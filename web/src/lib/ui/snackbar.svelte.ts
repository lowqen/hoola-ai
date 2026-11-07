// 스낵바 대기열: 한 번에 하나, 차례로 보여 준다 (M3). <SnackbarHost />를 앱에 한 번 둔다.

export interface SnackbarOptions {
	message: string;
	/** 행동 버튼 (예: "되돌리기"). */
	actionLabel?: string;
	onAction?: () => void;
	/** ms. 행동이 있으면 기본 6초, 없으면 4초. 0이면 닫을 때까지. */
	duration?: number;
	/** 닫기 아이콘 표시. */
	closable?: boolean;
}

export interface SnackbarItem extends SnackbarOptions {
	id: number;
}

let nextId = 0;

class SnackbarQueue {
	current = $state<SnackbarItem | null>(null);
	/**
	 * 'nav': 하단 내비게이션 위. 'top': 휴대폰에서 앱 바 아래.
	 * 대전 화면은 아래 1/3이 전부 조작이라 스낵바가 손패와 행동 바를 가리지 않도록 위로 올린다.
	 */
	placement = $state<'default' | 'nav' | 'top'>('default');
	private waiting: SnackbarItem[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;

	show(opts: SnackbarOptions): number {
		const item = { ...opts, id: ++nextId };
		this.waiting.push(item);
		if (!this.current) this.next();
		return item.id;
	}

	/** 현재 스낵바를 닫고 다음 것을 보여 준다. */
	dismiss(id?: number) {
		if (id !== undefined && this.current?.id !== id) {
			this.waiting = this.waiting.filter((w) => w.id !== id);
			return;
		}
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.current = null;
		setTimeout(() => this.next(), 120);
	}

	action() {
		const cur = this.current;
		this.dismiss();
		cur?.onAction?.();
	}

	private next() {
		const item = this.waiting.shift();
		if (!item) return;
		this.current = item;
		const duration = item.duration ?? (item.actionLabel ? 6000 : 4000);
		if (duration > 0) this.timer = setTimeout(() => this.dismiss(item.id), duration);
	}
}

export const snackbar = new SnackbarQueue();
