import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 제작 API (웹 모드): 개발 서버(npm run studio = vite dev)에서만 /api/studio를 켬
// 빌드·배포된 정적 사이트에는 들어가지 않음 → 배포 사이트는 보기 전용
function cardnewsStudio(): Plugin {
  return {
    name: 'cardnews-studio',
    apply: 'serve',
    configureServer(server) {
      if (process.env.CARDNEWS_STUDIO === '0') return;
      const require = createRequire(import.meta.url);
      const { createStudio } = require('../scripts/lib/studio-api.js');
      // CARDNEWS_STUDIO_SANDBOX=<폴더>: 저장소 products/ 대신 시험용 폴더에서 제작 (화면 시험·시연 연습용)
      const sandbox = process.env.CARDNEWS_STUDIO_SANDBOX;
      const studio = createStudio(
        sandbox
          ? {
              productsDir: `${sandbox}/products`,
              reportsDir: `${sandbox}/jobs`,
              exportConfigFile: `${sandbox}/export.json`,
              webIndexFile: `${sandbox}/web/index.json`,
            }
          : {},
      );
      server.middlewares.use((req, res, next) => {
        studio.handle(req, res).then((handled: boolean) => {
          if (!handled) next();
        }, next);
      });
    },
  };
}

// 정적 사이트: public/data/(npm run export 결과)를 그대로 /data/로 배포
export default defineConfig({
  plugins: [react(), cardnewsStudio()],
  base: '/',
  server: {
    // 이 컴퓨터에서만 접속 (로컬 제작 API가 함께 켜지므로 다른 기기에 열지 않음)
    host: '127.0.0.1',
    port: 5173,
  },
});
