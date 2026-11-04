// 아이콘 레지스트리: Material Symbols Rounded (weight 500) SVG. 쓰는 아이콘만 번들에 들어간다.
// 새 아이콘은 여기에 한 줄씩 추가한다 (이름은 fonts.google.com/icons 기준).
import styleSvg from '@material-symbols/svg-500/rounded/style.svg?raw';
import casinoSvg from '@material-symbols/svg-500/rounded/casino.svg?raw';
import schoolSvg from '@material-symbols/svg-500/rounded/school.svg?raw';
import barChartSvg from '@material-symbols/svg-500/rounded/bar_chart.svg?raw';
import settingsSvg from '@material-symbols/svg-500/rounded/settings.svg?raw';
import undoSvg from '@material-symbols/svg-500/rounded/undo.svg?raw';
import redoSvg from '@material-symbols/svg-500/rounded/redo.svg?raw';
import helpSvg from '@material-symbols/svg-500/rounded/help.svg?raw';
import addSvg from '@material-symbols/svg-500/rounded/add.svg?raw';
import closeSvg from '@material-symbols/svg-500/rounded/close.svg?raw';
import checkSvg from '@material-symbols/svg-500/rounded/check.svg?raw';
import frontHandSvg from '@material-symbols/svg-500/rounded/front_hand.svg?raw';
import backHandSvg from '@material-symbols/svg-500/rounded/back_hand.svg?raw';
import panToolSvg from '@material-symbols/svg-500/rounded/pan_tool.svg?raw';
import stopCircleSvg from '@material-symbols/svg-500/rounded/stop_circle.svg?raw';
import playingCardsSvg from '@material-symbols/svg-500/rounded/playing_cards.svg?raw';
import layersSvg from '@material-symbols/svg-500/rounded/layers.svg?raw';
import swapHorizSvg from '@material-symbols/svg-500/rounded/swap_horiz.svg?raw';
import arrowBackSvg from '@material-symbols/svg-500/rounded/arrow_back.svg?raw';
import moreVertSvg from '@material-symbols/svg-500/rounded/more_vert.svg?raw';
import darkModeSvg from '@material-symbols/svg-500/rounded/dark_mode.svg?raw';
import lightModeSvg from '@material-symbols/svg-500/rounded/light_mode.svg?raw';
import contrastSvg from '@material-symbols/svg-500/rounded/contrast.svg?raw';
import replaySvg from '@material-symbols/svg-500/rounded/replay.svg?raw';
import keyboardArrowDownSvg from '@material-symbols/svg-500/rounded/keyboard_arrow_down.svg?raw';
import menuSvg from '@material-symbols/svg-500/rounded/menu.svg?raw';
import personSvg from '@material-symbols/svg-500/rounded/person.svg?raw';
import groupSvg from '@material-symbols/svg-500/rounded/group.svg?raw';
import starSvg from '@material-symbols/svg-500/rounded/star.svg?raw';
import favoriteSvg from '@material-symbols/svg-500/rounded/favorite.svg?raw';
import infoSvg from '@material-symbols/svg-500/rounded/info.svg?raw';
import warningSvg from '@material-symbols/svg-500/rounded/warning.svg?raw';
import deleteSvg from '@material-symbols/svg-500/rounded/delete.svg?raw';
import editSvg from '@material-symbols/svg-500/rounded/edit.svg?raw';
import searchSvg from '@material-symbols/svg-500/rounded/search.svg?raw';
import tuneSvg from '@material-symbols/svg-500/rounded/tune.svg?raw';
import volumeUpSvg from '@material-symbols/svg-500/rounded/volume_up.svg?raw';
import boltSvg from '@material-symbols/svg-500/rounded/bolt.svg?raw';
import timerSvg from '@material-symbols/svg-500/rounded/timer.svg?raw';
import lightbulbSvg from '@material-symbols/svg-500/rounded/lightbulb.svg?raw';
import historySvg from '@material-symbols/svg-500/rounded/history.svg?raw';
import homeSvg from '@material-symbols/svg-500/rounded/home.svg?raw';
import sportsEsportsSvg from '@material-symbols/svg-500/rounded/sports_esports.svg?raw';
import downloadSvg from '@material-symbols/svg-500/rounded/download.svg?raw';
import visibilitySvg from '@material-symbols/svg-500/rounded/visibility.svg?raw';
import visibilityOffSvg from '@material-symbols/svg-500/rounded/visibility_off.svg?raw';
import dragHandleSvg from '@material-symbols/svg-500/rounded/drag_handle.svg?raw';
import arrowForwardSvg from '@material-symbols/svg-500/rounded/arrow_forward.svg?raw';
import refreshSvg from '@material-symbols/svg-500/rounded/refresh.svg?raw';
import doneAllSvg from '@material-symbols/svg-500/rounded/done_all.svg?raw';

export const ICONS = {
	style: styleSvg,
	casino: casinoSvg,
	school: schoolSvg,
	bar_chart: barChartSvg,
	settings: settingsSvg,
	undo: undoSvg,
	redo: redoSvg,
	help: helpSvg,
	add: addSvg,
	close: closeSvg,
	check: checkSvg,
	front_hand: frontHandSvg,
	back_hand: backHandSvg,
	pan_tool: panToolSvg,
	stop_circle: stopCircleSvg,
	playing_cards: playingCardsSvg,
	layers: layersSvg,
	swap_horiz: swapHorizSvg,
	arrow_back: arrowBackSvg,
	more_vert: moreVertSvg,
	dark_mode: darkModeSvg,
	light_mode: lightModeSvg,
	contrast: contrastSvg,
	replay: replaySvg,
	keyboard_arrow_down: keyboardArrowDownSvg,
	menu: menuSvg,
	person: personSvg,
	group: groupSvg,
	star: starSvg,
	favorite: favoriteSvg,
	info: infoSvg,
	warning: warningSvg,
	delete: deleteSvg,
	edit: editSvg,
	search: searchSvg,
	tune: tuneSvg,
	volume_up: volumeUpSvg,
	bolt: boltSvg,
	timer: timerSvg,
	lightbulb: lightbulbSvg,
	history: historySvg,
	home: homeSvg,
	sports_esports: sportsEsportsSvg,
	download: downloadSvg,
	visibility: visibilitySvg,
	visibility_off: visibilityOffSvg,
	drag_handle: dragHandleSvg,
	arrow_forward: arrowForwardSvg,
	refresh: refreshSvg,
	done_all: doneAllSvg
} as const;

export type IconName = keyof typeof ICONS;
