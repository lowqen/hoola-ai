// 카드 모션(대전 첫 로드)이 쓰는 값이다. spec.ts의 나머지 토큰까지 번들에 끌려오지 않게 파일을 나눈다.

/**
 * M3 모션 스킴 스프링 (감쇠비, 강성). Jetpack Compose Material3 MotionScheme 토큰 값.
 * spatial = 위치·크기 이동, effects = 색·투명도.
 */
export const SPRINGS = {
	standard: {
		'spatial-fast': [0.9, 1400],
		'spatial-default': [0.9, 700],
		'spatial-slow': [0.9, 300],
		'effects-fast': [1, 3800],
		'effects-default': [1, 1600],
		'effects-slow': [1, 800]
	},
	expressive: {
		'spatial-fast': [0.6, 800],
		'spatial-default': [0.8, 380],
		'spatial-slow': [0.8, 200],
		'effects-fast': [1, 3800],
		'effects-default': [1, 1600],
		'effects-slow': [1, 800]
	}
} as const;
