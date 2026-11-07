<script lang="ts">
	// 시트와 안내는 처음 필요할 때 불러온다: 대전 화면의 JS 예산(DESIGN_PLAN §7)을 지키기 위해서다.
	import type { Component } from 'svelte';
	import { session } from './session.svelte.ts';

	const LOADERS = {
		newGame: () => import('./NewGameSheet.svelte'),
		result: () => import('./ResultSheet.svelte'),
		rules: () => import('./RulesSheet.svelte'),
		hint: () => import('./HintSheet.svelte'),
		choice: () => import('./ChoiceSheet.svelte'),
		coach: () => import('./CoachMarks.svelte'),
		review: () => import('#lib/review/ReviewDialog.svelte')
	};
	type Name = keyof typeof LOADERS;

	let loaded = $state.raw<Partial<Record<Name, Component>>>({});
	const started = new Set<Name>();

	function load(name: Name) {
		if (started.has(name)) return;
		started.add(name);
		void LOADERS[name]().then((m) => {
			loaded = { ...loaded, [name]: m.default };
		});
	}

	$effect(() => {
		if (session.newGameOpen) load('newGame');
		if (session.rulesOpen) load('rules');
		if (session.hintOpen) load('hint');
		if (session.result) load('result');
		if (session.choice) load('choice');
		if (session.coachStep > 0) load('coach');
		if (session.reviewOpen) load('review');
	});
</script>

{#each Object.entries(loaded) as [name, Sheet] (name)}
	<Sheet />
{/each}
