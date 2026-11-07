import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// 엔진 워커는 동적 import로 WASM을 불러오므로 ES 모듈 워커로 빌드한다
	worker: { format: 'es' },
	// material-color-utilities 0.4.0의 확장자 없는 import를 Node가 못 찾으므로 SSR(프리렌더)에서도 번들한다
	ssr: { noExternal: ['@material/material-color-utilities'] },
	build: {
		rolldownOptions: {
			output: {
				// 작은 묶음이 많으면 gzip 효율이 떨어진다: 항상 함께 받는 코드를 한 묶음으로 합친다 (DESIGN_PLAN §7)
				codeSplitting: {
					groups: [
						{
							name: 'kit',
							test: /(preload-helper|__sveltekit|esm-env|devalue|@sveltejs\/kit\/src\/(?!runtime\/client\/))/,
							priority: 6
						},
						{ name: 'runtime', test: /node_modules\/svelte\//, priority: 5 },
						{
							name: 'shell',
							test: /src\/lib\/(game\/(cards|motion\.svelte)|ui\/(ActionBar|Button|IconButton|Icon|icons|ripple|Chip|TopAppBar|AppNav|SnackbarHost|snackbar\.svelte))/,
							priority: 4
						},
						{
							name: 'play',
							test: /src\/lib\/play\/(session\.svelte|actions|LazySheets)/,
							priority: 2
						},
						// 훈련·기록은 대전 세션 없이 저장소와 엔진 호출만 쓴다
						{ name: 'data', test: /src\/lib\/(store|engine|play\/bots)\.ts/, priority: 3 },
						{ name: 'table', test: /src\/lib\/game\//, priority: 1 }
					]
				}
			}
		}
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				discloseVersion: false,
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
