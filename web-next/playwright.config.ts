import { defineConfig } from '@playwright/test';

// 빌드 결과를 vite preview로 띄워 실제 배포와 같은 경로(BASE_PATH)에서 확인한다.
const base = process.env.BASE_PATH ?? '';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	// 서비스 워커는 테스트마다 앱 전체를 받고 네트워크 응답을 가로채므로, pwa.e2e.ts에서만 켠다
	use: { baseURL: `http://localhost:4173${base}/`, serviceWorkers: 'block' },
	testMatch: '**/*.e2e.{ts,js}',
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list'
});
