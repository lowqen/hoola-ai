// 복기 진행: 워커가 결정마다 평가한 결과를 모아 항목으로 만든다. 같은 판을 다시 열면 다시 계산하지 않는다.
import { reviewGame } from '#lib/engine.ts';
import type { ReviewSummary } from '#lib/store.ts';
import {
	biggestMistake,
	buildItems,
	mistakesOf,
	REVIEW_K,
	summarize,
	type RawItem,
	type ReviewContext,
	type ReviewItem
} from './analysis.ts';

class Review {
	status = $state<'idle' | 'running' | 'done' | 'empty' | 'error'>('idle');
	done = $state(0);
	total = $state(0);
	items = $state.raw<ReviewItem[]>([]);
	selected = $state(0);
	summary = $state.raw<ReviewSummary | null>(null);
	error = $state('');
	seatName: (seat: number) => string = String;

	private replay: string | null = null;
	private cancel: (() => void) | null = null;

	open(
		ctx: ReviewContext,
		onDone: (summary: ReviewSummary, mistakes: ReturnType<typeof mistakesOf>) => void
	) {
		if (ctx.replay === this.replay && this.status === 'done') return;
		this.cancel?.();
		this.replay = ctx.replay;
		this.seatName = ctx.seatName;
		this.items = [];
		this.summary = null;
		this.selected = 0;
		this.done = 0;
		this.total = ctx.decisions.length;
		if (!ctx.decisions.length) {
			this.status = 'empty';
			return;
		}
		this.status = 'running';
		const raw = new Array<RawItem | undefined>(ctx.decisions.length);
		this.cancel = reviewGame(ctx.replay, ctx.decisions, REVIEW_K, ctx.seat, {
			onItem: (i, item) => {
				raw[i] = item;
				this.done++;
			},
			onDone: () => {
				this.cancel = null;
				const items = buildItems(raw, ctx);
				if (!items.length) {
					this.status = 'empty';
					return;
				}
				this.items = items;
				this.selected = biggestMistake(items);
				this.summary = summarize(items);
				this.status = 'done';
				onDone(this.summary, mistakesOf(items, ctx.key));
			},
			onError: (message) => {
				this.cancel = null;
				this.error = message;
				this.status = 'error';
				this.replay = null;
			}
		});
	}

	/** 분석 중에 닫으면 멈춘다. 다른 계산(힌트·문제 생성)이 뒤로 밀리지 않게 한다. */
	close() {
		if (this.status !== 'running') return;
		this.cancel?.();
		this.cancel = null;
		this.replay = null;
		this.status = 'idle';
	}
}

export const review = new Review();
