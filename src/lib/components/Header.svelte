<script>
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';
	export let view = 'practice';
	export let busy = false;
	const dispatch = createEventDispatcher();
</script>

<header class="app-header">
	<a
		class="wordmark"
		href="#practice"
		onclick={(event) => {
			event.preventDefault();
			if (!busy) dispatch('navigate', 'practice');
		}}
		aria-label="Dry-Fire Trainer practice"
	>
		<span class="brand-mark"><Icon name="target" size={25} /></span>
		<span>Dry-Fire <strong>Trainer</strong></span>
	</a>
	<nav aria-label="Main navigation">
		<button
			class:current={view === 'practice'}
			aria-current={view === 'practice' ? 'page' : undefined}
			disabled={busy}
			onclick={() => dispatch('navigate', 'practice')}
			><Icon name="target" size={18} /><span>Practice</span></button
		>
		<button
			class:current={view === 'history'}
			aria-current={view === 'history' ? 'page' : undefined}
			disabled={busy}
			onclick={() => dispatch('navigate', 'history')}
			><Icon name="history" size={18} /><span>History</span></button
		>
	</nav>
	<button
		class="icon-button help-button"
		aria-label="Training setup help"
		onclick={() => dispatch('help')}><Icon name="help" /></button
	>
</header>

<style>
	.app-header {
		max-width: 1440px;
		padding: 22px 40px;
		margin: auto;
		display: flex;
		align-items: center;
		gap: 32px;
	}
	.wordmark {
		display: flex;
		align-items: center;
		gap: 11px;
		text-decoration: none;
		color: #18324b;
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-size: 24px;
		font-weight: 500;
		white-space: nowrap;
	}
	.wordmark strong {
		font-weight: 600;
	}
	.brand-mark {
		width: 40px;
		height: 40px;
		color: #315de3;
		display: grid;
		place-items: center;
		border: 1.5px solid #bfcdef;
		border-radius: 50%;
	}
	nav {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}
	nav button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		min-height: 44px;
		color: #5b6d80;
		font-size: 0.9rem;
		border-radius: 8px;
		border: 1px solid transparent;
	}
	nav button:hover {
		background: #e5ebf4;
	}
	nav button.current {
		color: #315de3;
		background: #e4ebff;
	}
	.help-button {
		color: #5b6d80;
	}
	@media (max-width: 650px) {
		.app-header {
			padding: 15px 18px;
			gap: 12px;
		}
		.wordmark {
			font-size: 21px;
			gap: 8px;
		}
		.brand-mark {
			width: 32px;
			height: 32px;
		}
		.wordmark strong {
			display: block;
		}
		.wordmark > span:last-child {
			line-height: 0.95;
		}
		nav {
			gap: 2px;
		}
		nav button {
			padding: 8px 10px;
		}
		nav :global(svg) {
			display: none;
		}
		.help-button {
			display: none;
		}
	}
	@media (max-width: 360px) {
		.app-header {
			padding: 12px;
		}
		.wordmark {
			font-size: 19px;
		}
		nav button {
			padding: 8px;
			font-size: 0.85rem;
		}
	}
</style>
