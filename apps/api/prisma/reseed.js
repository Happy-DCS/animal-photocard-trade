import { createClient } from "@supabase/supabase-js";

import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { seed } from "./seed.js";

const CONFIRMATION = "DELETE_ALL_DATA_AND_RESEED";

// Storage 정리에만 쓴다 (인증은 API가 직접 하므로 Supabase Auth 계정은 더 이상 만들지 않는다)
function createStorageAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Storage 버킷에서 seed/ 이미지를 제외한 전부(과거 실사용 업로드 등)를 지운다
async function deleteNonSeedStorageObjects(supabase) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "card-images";

  async function listAll(prefix) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;

    let paths = [];
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        paths = paths.concat(await listAll(fullPath));
      } else {
        paths.push(fullPath);
      }
    }
    return paths;
  }

  const allPaths = await listAll("");
  const toDelete = allPaths.filter((objectPath) => !objectPath.startsWith("seed/"));
  if (toDelete.length === 0) return 0;

  const { error } = await supabase.storage.from(bucket).remove(toDelete);
  if (error) throw error;
  return toDelete.length;
}

async function main() {
  if (process.env.LIVE_RESEED_CONFIRM !== CONFIRMATION) {
    throw new Error(`라이브 재시딩을 실행하려면 LIVE_RESEED_CONFIRM=${CONFIRMATION}가 필요합니다.`);
  }

  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("SEED_USER_PASSWORD는 8자 이상이어야 합니다.");
  }
  const passwordHash = await hashPassword(password);

  const deletedStorageCount = await deleteNonSeedStorageObjects(createStorageAdminClient());
  console.log(`Storage 파일 정리: ${deletedStorageCount}개 삭제`);

  await prisma.$transaction(
    async (tx) => {
      // FK 자식 → 부모 순서. 스키마가 바뀌면 이 목록도 함께 갱신해야 한다.
      await tx.notification.deleteMany();
      await tx.exchange.deleteMany();
      await tx.sale.deleteMany();
      await tx.card.deleteMany();
      await tx.imageData.deleteMany();
      await tx.refreshToken.deleteMany();
      await tx.user.deleteMany();

      // 삭제와 생성을 한 트랜잭션으로 묶어 seed 실패 시 기존 데이터를 복구한다.
      await seed(tx, { passwordHash });
    },
    { timeout: 60_000 },
  );
}

main()
  .catch((error) => {
    console.error("Live reseed 실패");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
