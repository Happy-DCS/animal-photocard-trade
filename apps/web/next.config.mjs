const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    // Next 16은 localhost 같은 로컬 IP 이미지를 기본으로 막는다.
    // 개발 중에는 API가 로컬 저장소(apps/api/uploads)에서 서빙하는 이미지를 쓰므로 허용한다
    dangerouslyAllowLocalIP: isDev,
    remotePatterns: [
      ...(isDev
        ? [
            {
              // Supabase 미설정 시 API가 직접 서빙하는 업로드 이미지 (apps/api/src/lib/image-storage.js)
              protocol: "http",
              hostname: "localhost",
              port: "4000",
              pathname: "/uploads/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "cdn.example.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        // Supabase Storage 공개 이미지 (예: tgeegyvuyrhwjphdcbsa.supabase.co)
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        // 테스트용 placeholder 이미지
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;
