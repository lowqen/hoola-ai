import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// 엔진 워커는 동적 import로 WASM을 불러오므로 ES 모듈 워커로 빌드한다
	worker: { format: 'es' },
	// material-color-utilities 0.4.0의 확장자 없는 import를 Node가 못 찾으므로 SSR(프리렌더)에서도 번들한다
	ssr: { noExternal: ['@material/material-color-utilities'] },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// GitHub Pages 미리보기: /hoola-ai/next (로컬 개발은 빈 값)
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	]
});
