import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 정적 사이트: public/data/(npm run export 결과)를 그대로 /data/로 배포
export default defineConfig({
  plugins: [react()],
  base: '/',
});
