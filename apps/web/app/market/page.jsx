"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import MarketHeader from "@/components/market/MarketHeader";
import MarketFilters from "@/components/market/MarketFilters";
import MarketCardList from "@/components/market/MarketCardList";
import MarketEmpty from "@/components/market/MarketEmpty";
import MobileFilter from "@/components/card/MobileFilter";
import CreateSaleModal from "@/components/trade/CreateSaleModal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import AppHeader from "@/components/ui/AppHeader";

import { saleToPhotoCardProps } from "@/components/card/toPhotoCardProps";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSales } from "@/lib/sales/api";

const PAGE_SIZE = 20;

const ORDER_BY_MAP = {
  "관상 지수 높은 순": "SCORE_DESC",
  "관상 지수 낮은 순": "SCORE_ASC",
  "낮은 포인트 순": "POINT_ASC",
  "높은 포인트 순": "POINT_DESC",
  "최근 등록 순": "RECENT",
  "오래된 등록 순": "OLDEST",
};

export default function MarketPage() {
  const router = useRouter();
  //판매 목록 로딩과 중복되지 않게 AuthLoading으로 받는다
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  // ========================================
  // 실제 적용된 필터
  // ========================================

  // 검색
  const [keyword, setKeyword] = useState("");

  // 입력이 멈춘 뒤 300ms 후에만 실제 요청에 반영되는 검색어 (마이갤러리와 동일한 디바운스 방식)
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  // 실제 적용된 카테고리
  const [categories, setCategories] = useState([]);

  // 실제 적용된 품절 포함 여부
  // false = 품절 제외
  // true = 품절 포함
  const [isSoldOutIncluded, setIsSoldOutIncluded] = useState(false);

  // 정렬
  const [sort, setSort] = useState("최근 등록 순");

  // ========================================
  // 모바일 필터 임시 상태
  // ========================================

  // 모바일 필터 안에서 현재 선택 중인 카테고리
  const [tempCategories, setTempCategories] = useState([]);

  // 모바일 필터 안에서 현재 선택 중인 품절 포함 여부
  const [tempIsSoldOutIncluded, setTempIsSoldOutIncluded] = useState(false);

  // 모바일 필터 열림/닫힘
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // ========================================
  // 판매 데이터
  // ========================================

  const [cards, setCards] = useState([]);

  // 로딩
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 다음 cursor
  const [nextCursor, setNextCursor] = useState(null);

  // 더 불러올 데이터가 있는지
  const [hasMore, setHasMore] = useState(true);

  // 카테고리별 카드 개수
  const [countsBySoldOut, setCountsBySoldOut] = useState({
    false: { DOG: 0, CAT: 0 }, //품절제외
    true: { DOG: 0, CAT: 0 }, //품절포함
  });

  // ========================================
  // 모달
  // ========================================

  // 로그인 필요 모달
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // 판매글 생성 모달
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

  const observerRef = useRef(null);

  // 목록 요청이 진행 중인지 (다음 페이지 중복 요청 방지용)
  const isFetchingRef = useRef(false);

  // 목록 요청마다 1씩 증가하는 번호. 가장 최근 요청의 응답만 화면에 반영하는 데 쓴다
  const requestIdRef = useRef(0);

  // 검색어는 입력이 멈춘 뒤 300ms 후에만 요청에 반영
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  /**
   * 판매 데이터 → MarketCard 형태로 변환
   */
  const normalizeSale = useCallback((sale) => {
    const hasPendingExchange = sale.status === "ON_EXCHANGE";

    const photoCardProps = saleToPhotoCardProps(
      {
        ...sale,
        status: hasPendingExchange ? "ON_SALE" : sale.status,
      },
      hasPendingExchange,
    );

    return {
      ...sale,

      id: sale.id,
      name: sale.card.name,
      image: sale.card.image,
      price: sale.price,
      saleStatus: sale.status,

      ...photoCardProps,
    };
  }, []);

  /**
   * ========================================
   * 판매 목록 조회
   * GET /sales
   * ========================================
   *
   * 첫 페이지 요청에는 includeCounts를 붙여 모바일 필터용 카테고리별 개수(categoryCounts)를 함께 받는다.
   * 커서로 다음 페이지를 받을 때는 서버가 개수를 보내지 않으므로 기존 값을 그대로 둔다
   */
  const fetchSales = useCallback(
    async ({ cursor = null, append = false } = {}) => {
      // 다음 페이지(append)는 이미 요청 중이면 건너뛴다 (무한 스크롤 중복 요청 방지).
      // 첫 페이지(필터·검색·정렬 변경)는 진행 중인 요청이 있어도 항상 새로 보내고, 이전 요청의 응답은 버린다
      if (append && isFetchingRef.current) {
        return;
      }

      const requestId = ++requestIdRef.current;
      // 늦게 도착한 이전 조건의 응답이 화면을 덮어쓰지 않도록, 가장 최근 요청의 응답만 반영한다
      const isLatest = () => requestId === requestIdRef.current;

      isFetchingRef.current = true;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setCards([]);
        setNextCursor(null);
        setHasMore(true);
      }

      try {
        const result = await getSales({
          limit: PAGE_SIZE,
          keyword: debouncedKeyword.trim() || undefined,
          // API는 category 하나만 받을 수 있음
          // []              → 전체
          // ["DOG"]         → 강아지
          // ["CAT"]         → 고양이
          // ["DOG", "CAT"]  → 전체
          category: categories.length === 1 ? categories[0] : undefined,
          // false → 품절 제외 / true → 품절 포함
          includeSoldOut: isSoldOutIncluded,
          orderBy: ORDER_BY_MAP[sort],
          cursor: cursor ?? undefined,
          includeCounts: !append,
        });

        if (!isLatest()) return;

        if (result?.categoryCounts) {
          setCountsBySoldOut({
            false: result.categoryCounts.excludeSoldOut, // 품절 제외
            true: result.categoryCounts.includeSoldOut, // 품절 포함
          });
        }

        const lists = result?.lists ?? [];
        const newCursor = result?.nextCursor ?? null;

        const normalizedCards = lists.map(normalizeSale);

        if (append) {
          setCards((prevCards) => [...prevCards, ...normalizedCards]);
        } else {
          setCards(normalizedCards);
        }

        setNextCursor(newCursor);
        setHasMore(Boolean(newCursor));
      } catch (error) {
        if (!isLatest()) return;

        console.error("판매 목록 조회 실패:", error);

        if (!append) {
          setCards([]);
        }

        setNextCursor(null);
        setHasMore(false);
      } finally {
        // 버려진 요청이 끝났을 때는 최신 요청의 진행 상태를 건드리지 않는다
        if (isLatest()) {
          isFetchingRef.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedKeyword, categories, isSoldOutIncluded, sort, normalizeSale],
  );

  /**
   * ========================================
   * 검색 / 실제 필터 / 정렬 변경
   * ========================================
   *
   * 변경되면 첫 페이지부터 다시 조회
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSales({
      cursor: null,
      append: false,
    });
  }, [fetchSales]);

  /**
   * ========================================
   * 모바일 필터 열기
   * ========================================
   */
  const handleOpenMobileFilter = () => {
    setTempCategories([...categories]);

    setTempIsSoldOutIncluded(isSoldOutIncluded);

    setIsMobileFilterOpen(true);
  };

  /**
   * ========================================
   * 모바일 필터 닫기
   * ========================================
   *
   * 적용하지 않고 닫으면
   * 임시 선택은 버린다.
   */
  const handleCloseMobileFilter = () => {
    setTempCategories([...categories]);

    setTempIsSoldOutIncluded(isSoldOutIncluded);

    setIsMobileFilterOpen(false);
  };

  /**
   * ========================================
   * 모바일 필터 적용
   * ========================================
   */
  const handleApplyMobileFilter = () => {
    setCategories([...tempCategories]);

    setIsSoldOutIncluded(tempIsSoldOutIncluded);

    setIsMobileFilterOpen(false);
  };

  /**
   * ========================================
   * 모바일 필터 전체 초기화
   * ========================================
   *
   * 카테고리
   * 품절 여부
   * 검색어
   * 정렬
   * 모두 기본값으로 초기화
   */
  const handleResetFilters = () => {
    // 모바일 임시 상태 초기화
    setTempCategories([]);
    setTempIsSoldOutIncluded(false);

    // 실제 적용 상태 초기화
    setCategories([]);
    setIsSoldOutIncluded(false);

    // 검색어 초기화
    setKeyword("");
    setDebouncedKeyword("");

    // 정렬 초기화
    setSort("최근 등록 순");
  };

  /**
   * ========================================
   * 무한 스크롤
   * ========================================
   */
  useEffect(() => {
    const target = observerRef.current;

    if (!target || !hasMore || isLoading || isLoadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (!entry.isIntersecting) {
          return;
        }

        if (!nextCursor) {
          return;
        }

        fetchSales({
          cursor: nextCursor,
          append: true,
        });
      },
      {
        rootMargin: "300px",
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [nextCursor, hasMore, isLoading, isLoadingMore, fetchSales]);

  /**
   * ========================================
   * 카드 클릭
   * ========================================
   *
   * 로그인 상태
   * → 카드 상세 페이지 이동
   *
   * 비로그인 상태
   * → 로그인 필요 모달
   */
  const handleCardClick = async (card) => {
    if (isAuthLoading) {
      return;
    }

    if (!currentUser) {
      setIsLoginModalOpen(true);
      return;
    }

    router.push(`/market/${card.id}`);
  };

  /**
   * ========================================
   * 나의 포토카드 판매하기
   * ========================================
   *
   * 로그인 상태
   * → 판매 모달
   *
   * 비로그인 상태
   * → 로그인 필요 모달
   */
  const handleOpenSaleModal = async () => {
    if (isAuthLoading) {
      return;
    }

    if (!currentUser) {
      setIsLoginModalOpen(true);
      return;
    }

    setIsSaleModalOpen(true);
  };

  /**
   * ========================================
   * 로그인 모달에서 로그인 버튼
   * ========================================
   */
  const handleLoginConfirm = () => {
    setIsLoginModalOpen(false);
    router.push("/login");
  };

  /**
   * ========================================
   * 로그인 모달에서 취소 버튼
   * ========================================
   */
  const handleLoginCancel = () => {
    setIsLoginModalOpen(false);
  };

  return (
    <>
      <AppHeader />

      <main
        className="
          isolate
          mx-auto
          min-h-screen
          w-full
          max-w-[1248px]
          px-[16px]
          pt-[20px]
          pb-[37px]

          tablet:px-[20px]
          tablet:pt-[64px]
          tablet:pb-[224px]

          pc:px-0
          pc:pb-[240px]
        "
      >
        <MarketHeader onOpenSaleModal={handleOpenSaleModal} />

        {/* ========================================
            검색 / 필터 / 정렬
        ======================================== */}
        <section className="tablet:mt-4 pc:mt-6">
          <MarketFilters
            keyword={keyword}
            setKeyword={setKeyword}
            categories={categories}
            setCategories={setCategories}
            soldOut={isSoldOutIncluded}
            setSoldOut={setIsSoldOutIncluded}
            sort={sort}
            setSort={setSort}
            onOpenMobileFilter={handleOpenMobileFilter}
          />
        </section>

        {/* ========================================
            카드 목록
        ======================================== */}
        <section className="mt-4 tablet:mt-6 pc:mt-8">
          {isLoading ? (
            <div className="flex min-h-[300px] items-center justify-center text-white">
              판매 목록을 불러오는 중...
            </div>
          ) : cards.length === 0 ? (
            <MarketEmpty />
          ) : (
            <>
              <MarketCardList cards={cards} onCardClick={handleCardClick} />

              {/* 무한 스크롤 감지 영역 */}
              <div ref={observerRef} className="h-[1px] w-full" aria-hidden="true" />

              {isLoadingMore && (
                <div className="py-8 text-center text-sm text-white">더 불러오는 중...</div>
              )}
            </>
          )}
        </section>
      </main>

      {/* ========================================
          모바일 필터 Bottom Sheet
      ======================================== */}
      <MobileFilter
        isOpen={isMobileFilterOpen}
        onClose={handleCloseMobileFilter}
        categories={tempCategories}
        setCategories={setTempCategories}
        soldOut={tempIsSoldOutIncluded}
        setSoldOut={setTempIsSoldOutIncluded}
        onApply={handleApplyMobileFilter}
        onReset={handleResetFilters}
        countsBySoldOut={countsBySoldOut}
      />

      {/* ========================================
          판매글 생성 모달
      ======================================== */}
      <CreateSaleModal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        onCreated={() => {
          fetchSales({
            cursor: null,
            append: false,
          });
        }}
      />

      {/* ========================================
          로그인 필요 모달
      ======================================== */}
      <ConfirmModal
        isOpen={isLoginModalOpen}
        title="로그인이 필요합니다"
        description={"로그인 하시겠습니까?\n다양한 서비스를 편리하게 이용하실 수 있습니다."}
        confirmLabel="로그인"
        onConfirm={handleLoginConfirm}
        onClose={handleLoginCancel}
      />
    </>
  );
}
