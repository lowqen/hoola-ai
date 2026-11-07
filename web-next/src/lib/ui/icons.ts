// 쓰는 아이콘 목록: Material Symbols Rounded (weight 500).
// 그림은 JS가 아니라 외부 스프라이트(icons.svg)에 있다. 번들에는 이름만 들어간다.
// 새 아이콘은 여기에 한 줄 추가하고 `npm run icons`로 스프라이트를 다시 만든다
// (이름은 fonts.google.com/icons 기준).
export const ICON_NAMES = [
	'add',
	'arrow_back',
	'arrow_forward',
	'bar_chart',
	'check',
	'close',
	'delete',
	'download',
	'front_hand',
	'help',
	'history',
	'layers',
	'lightbulb',
	'more_vert',
	'playing_cards',
	'replay',
	'school',
	'settings',
	'stop_circle',
	'swap_horiz',
	'timer',
	'undo',
	'visibility',
	'visibility_off',
	'warning'
] as const;

export type IconName = (typeof ICON_NAMES)[number];
