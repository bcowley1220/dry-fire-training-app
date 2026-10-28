<script>
	import { onMount } from 'svelte';
	let { activity = 'high-noon', onReport, onError } = $props();
	let root, runtime;
	let loading = $state(true),
		failure = $state('');
	export function command(value) {
		runtime?.dispatch(value);
	}
	onMount(() => {
		let disposed = false;
		(activity === 'duck-hunt'
			? import('$lib/games/duck-hunt/runtime.js')
			: import('$lib/games/high-noon/runtime.js')
		)
			.then(async (module) => {
				if (disposed) return;
				runtime = (module.createDuckHuntRuntime || module.createHighNoonRuntime)({
					parent: root,
					onReport,
					onError
				});
				await runtime.initialize();
				if (!disposed) loading = false;
			})
			.catch((error) => {
				if (!disposed) {
					failure = `Game could not load: ${error.message}`;
					onError(failure);
				}
			});
		return () => {
			disposed = true;
			runtime?.destroy();
		};
	});
</script>

<div class="game-host" bind:this={root} aria-label={`${activity} Phaser game`}></div>
{#if loading || failure}<p class="loading" role="status">{failure || 'Loading game…'}</p>{/if}

<style>
	.game-host {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #080808;
	}
	.game-host :global(canvas) {
		image-rendering: pixelated;
		filter: grayscale(1);
	}
	.loading {
		position: absolute;
		top: 45%;
		left: 0;
		right: 0;
		color: #ddd;
		text-align: center;
		background: #111;
		padding: 16px;
		font-family: monospace;
	}
</style>
