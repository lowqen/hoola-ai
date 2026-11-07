<script lang="ts">
	// 초보자 모드: 할 수 있는 수가 여럿이면 목록에서 고른다.
	import BottomSheet from '#lib/ui/BottomSheet.svelte';
	import Button from '#lib/ui/Button.svelte';
	import { session } from './session.svelte.ts';

	let open = $state(false);
	const choice = $derived(session.choice);

	$effect(() => {
		open = !!choice;
	});
</script>

<BottomSheet bind:open label={choice?.title ?? '수 고르기'} onclose={() => (session.choice = null)}>
	{#if choice}
		<h2>{choice.title}</h2>
		<div class="options" data-testid="choices">
			{#each choice.options as option (option.action)}
				<Button wide variant="tonal" onclick={() => session.play(option.action)}
					>{option.label}</Button
				>
			{/each}
		</div>
	{/if}
</BottomSheet>

<style>
	h2 {
		margin: 0 0 12px;
		font-size: var(--md-sys-typescale-title-large-size);
		font-weight: 800;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
