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
	use: { baseURL: `http://localhost:4173${base}/` },
	testMatch: '**/*.e2e.{ts,js}',
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list'
});
