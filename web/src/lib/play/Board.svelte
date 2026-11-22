<script lang="ts">
	// 판 화면: 탁자와 행동 바, 단축키. 판을 시작할 때 불러와 첫 화면의 JS를 줄인다 (DESIGN_PLAN §7).
	import { t } from '#lib/i18n/index.ts';
	import { cardsText, cardText, sortCards } from '#lib/game/cards.ts';
	import Scene from '#lib/game/Scene.svelte';
	import ActionBar, { type ActionSlot, type PrimaryAction } from '#lib/ui/ActionBar.svelte';
	import Button from '#lib/ui/Button.svelte';
	import { stopAdvice } from './actions.ts';
	import LogPanel from './LogPanel.svelte';
	import { session } from './session.svelte.ts';

	const obs = $derived(session.obs);
	const beginner = $derived(session.settings.beginner);
	const single = $derived(session.selected.length === 1 ? session.selected[0] : null);
	const startPhase = $derived(session.myTurn && obs?.phase === 'turn_start');
	const meldPhase = $derived(session.myTurn && obs?.phase === 'meld');
	const legalWith = (prefix: string) => session.legal.some((a) => a.startsWith(prefix));

	const blockedReason = $derived(
		session.over ? t('판이 끝났다') : session.myTurn ? null : t('상대 차례다')
	);

	const slots = $derived.by<ActionSlot[]>(() => {
		const canStop = beginner ? legalWith('stop') : startPhase;
		const canThank = beginner ? legalWith('thankyou') : startPhase;
		const canRegister = beginner ? legalWith('register ') : meldPhase;
		const canAttach = beginner ? legalWith('attach ') : meldPhase;
		return [
			{
				id: 'stop',
				label: t('스톱'),
				icon: 'stop_circle',
				tone: 'danger',
				enabled: !!canStop,
				reason:
					blockedReason ??
					(startPhase
						? t('손패 {pts}점: {limit}점 이하일 때만 스톱할 수 있다', {
								pts: obs?.hand_points ?? 0,
								limit: obs?.stop_limit ?? 0
							})
						: t('스톱은 받기 전에만 할 수 있다')),
				onclick: () => session.stop()
			},
			{
				id: 'thankyou',
				label: t('땡큐'),
				icon: 'front_hand',
				enabled: !!canThank,
				emphasized: beginner,
				reason:
					blockedReason ??
					(startPhase ? t('지금 버림패로 땡큐할 조합이 없다') : t('땡큐는 받기 전에만 할 수 있다')),
				onclick: () => session.thankYou()
			},
			{
				id: 'register',
				label: t('등록'),
				icon: 'layers',
				enabled: !!canRegister,
				emphasized: beginner,
				reason:
					blockedReason ??
					(meldPhase ? t('지금 등록할 수 있는 조합이 없다') : t('받은 뒤에 등록할 수 있다')),
				onclick: () => session.register()
			},
			{
				id: 'attach',
				label: t('붙이기'),
				icon: 'add',
				enabled: !!canAttach,
				emphasized: beginner,
				reason:
					blockedReason ??
					(meldPhase ? t('지금 붙일 수 있는 카드가 없다') : t('받은 뒤에 붙일 수 있다')),
				onclick: () => session.attach()
			}
		];
	});

	const primary = $derived.by<PrimaryAction>(() => {
		if (session.over) {
			return { label: t('새 판'), icon: 'replay', enabled: true, onclick: () => session.newGame() };
		}
		if (startPhase) {
			return {
				label: t('받기'),
				icon: 'playing_cards',
				enabled: true,
				onclick: () => session.draw()
			};
		}
		if (meldPhase) {
			return {
				label: t('버리기'),
				icon: 'arrow_forward',
				enabled: !!single,
				onclick: () => single && session.discard(single)
			};
		}
		return { label: t('상대 차례'), icon: 'timer', enabled: false };
	});

	/** 고른 카드로 할 행동 미리보기. 셀프 모드는 합법 여부를 알려 주지 않고 선택만 되풀이한다. */
	const preview = $derived.by(() => {
		const sel = sortCards(session.selected);
		if (startPhase && sel.length >= 2 && obs?.discard_top) {
			return `${t('땡큐')} ${cardsText(sel)} + ${cardText(obs.discard_top)}`;
		}
		if (meldPhase && sel.length === 1) return `${t('버리기')} ${cardText(sel[0])}`;
		if (meldPhase && sel.length > 1) return `${t('등록')} ${cardsText(sel)}`;
		if (beginner && startPhase && obs && legalWith('stop')) {
			return t('기준표: {text}', { text: stopAdvice(obs, 0).text });
		}
		if (beginner && session.settings.autoHint && session.hintState.status === 'ready') {
			const best = session.hintState.moves[0];
			return best && t('추천: {text}', { text: best.text });
		}
		return undefined;
	});

	const hint = $derived.by(() => {
		if (session.over) return t('판이 끝났다');
		if (startPhase) return t('더미를 눌러 받기, 조합이 되면 2장 골라 땡큐');
		if (meldPhase) return t('끌어서 버림패나 조합에 놓기, 두 번 탭하면 버리기');
		return obs ? t('{name} 차례', { name: session.seatName(obs.current_player) }) : undefined;
	});

	const history = $derived(
		session.showHistory && obs ? obs.visible_discards.slice(0, -2).slice(-10) : undefined
	);

	/** 키보드 단축키 (DESIGN_PLAN §6.5). 대화상자와 입력칸에서는 쓰지 않는다. */
	function keydown(e: KeyboardEvent) {
		if (!obs || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]'))
			return;
		const target = e.target as HTMLElement;
		if (target.matches('input, select, textarea')) return;
		if (e.key === 'Enter') {
			if (target.matches('button, a')) return;
			e.preventDefault();
			if (primary.enabled) primary.onclick?.();
			return;
		}
		const id = { s: 'stop', t: 'thankyou', r: 'register' }[e.key.toLowerCase()];
		if (id) {
			const slot = slots.find((s) => s.id === id)!;
			if (slot.enabled) slot.onclick?.();
			else if (slot.reason) session.notifyRule(slot.reason);
		} else if (e.key.toLowerCase() === 'd' && startPhase) {
			session.draw();
		}
	}
</script>

<svelte:window onkeydown={keydown} />

{#if obs}
	<Scene
		seats={session.seats}
		turn={session.turn}
		stockCount={obs.stock_len ?? 0}
		discard={obs.visible_discards}
		discardHistory={history}
		melds={session.melds}
		hand={session.hand}
		selected={session.selected}
		dropTargets={session.dropTargets}
		announcement={session.announcement}
		turnLabel={session.over ? t('판 종료') : undefined}
		ontoggle={(card) => session.toggle(card)}
		onplay={session.playCard}
		ondraw={startPhase ? () => session.draw() : undefined}
	>
		{#snippet tools()}
			{#if session.over && session.result}
				<Button
					variant="tonal"
					size="sm"
					data-testid="show-result"
					onclick={() => (session.resultOpen = true)}>{t('결과 보기')}</Button
				>
			{:else}
				<Button
					variant="text"
					size="sm"
					icon="swap_horiz"
					data-testid="sort"
					onclick={() => session.resort()}
					>{session.settings.sort === 'rank' ? t('숫자순') : t('무늬순')}</Button
				>
			{/if}
		{/snippet}
		{#snippet actions()}
			<ActionBar
				{slots}
				{primary}
				{preview}
				{hint}
				onblocked={(slot) => slot.reason && session.notifyRule(slot.reason)}
			/>
		{/snippet}
	</Scene>
	<LogPanel lines={session.log} />
{/if}
