<script>
	import { onMount } from 'svelte';
	let { onReport, onError } = $props();
	let root, runtime;
	let loading = $state(true),
		failure = $state('');
	export function command(value) {
		runtime?.dispatch(value);
	}
	onMount(() => {
		let disposed = false;
		import('$lib/games/high-noon/runtime.js')
			.then(async ({ createHighNoonRuntime }) => {
				if (disposed) return;
				runtime = createHighNoonRuntime({ parent: root, onReport, onError });
				await runtime.initialize();
				if (!disposed) loading = false;
			})
			.catch((error) => {
				if (!disposed) {
					failure = `High Noon could not load: ${error.message}`;
					onError(failure);
				}
			});
		return () => {
			disposed = true;
			runtime?.destroy();
		};
	});
</script>

<div class="game-host" bind:this={root} aria-label="High Noon Phaser game"></div>
{#if loading || failure}<p class="loading" role="status">{failure || 'Loading High Noon…'}</p>{/if}

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
