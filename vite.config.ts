import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// 앱 테마색 — src/utils/soundMapResult.ts 의 안전지대 색(teal-600)과 동일하게 유지한다.
const THEME_COLOR = '#0d9488';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',   // 새 버전을 배포하면 다음 실행에서 자동 반영
      includeAssets: ['apple-touch-icon.png', 'vocal_tract.jpg'],
      manifest: {
        name: '말막힘 일지',
        short_name: '말막힘 일지',
        description: '말막힘을 기록하고, 소리 지도로 어느 압력에서 왜 걸리는지 찾아보세요.',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // 배경이 전면 불투명이라 마스킹돼도 글리프가 잘리지 않는다
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 빌드 산출물을 프리캐시 — 오프라인에서도 앱 껍데기가 뜬다
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,   // 번들이 1.1MB 라 기본 2MB 로는 빠듯하다
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 외부 폰트 등 정적 자원만 캐시. Firestore/인증은 실시간 연결이라
            // 어떤 캐시 규칙에도 걸지 않는다 — 가로채면 동기화가 깨진다.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        // dev 서버에서는 서비스 워커를 끈다 — HMR 과 충돌하고 캐시가 남는다
        enabled: false,
      },
    }),
  ],
});
