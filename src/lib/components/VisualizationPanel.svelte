<script>
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	export let mobile = false;
	export let visualizationState;
	export let hits = [];

	const dispatch = createEventDispatcher();

	function calculateShotGrouping(hits) {
		if (hits.length < 2) return null;

		// Calculate center of group
		const centerX = hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length;
		const centerY = hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length;

		// Calculate average distance from center (group size)
		const distances = hits.map((hit) =>
			Math.sqrt(Math.pow(hit.x - centerX, 2) + Math.pow(hit.y - centerY, 2))
		);
		const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

		// Calculate max spread (extreme shot distances)
		const maxDistance = Math.max(...distances);

		return {
			centerX,
			centerY,
			avgDistance: avgDistance.toFixed(1),
			maxSpread: (maxDistance * 2).toFixed(1), // Diameter
			groupSize: `${(avgDistance * 2).toFixed(1)}px`
		};
	}
</script>

<div class="shot-controls" class:compact={mobile}>
	<label class="check-row"
		><input type="checkbox" bind:checked={visualizationState.showShotNumbers} /><span
			>Number each shot</span
		></label
	>
	<label class="check-row"
		><input type="checkbox" bind:checked={visualizationState.showSequenceLines} /><span
			>Connect shots in order</span
		></label
	>
	<div class="line-color">
		<label for="line-color-{mobile}">Connecting line color</label><input
			id="line-color-{mobile}"
			type="color"
			bind:value={visualizationState.lineColor}
		/>
	</div>
	{#if hits.length}<div class="field">
			<label for="replay-{mobile}"
				>Replay <span class="muted"
					>{visualizationState.currentReplayShot
						? `Shot ${visualizationState.currentReplayShot} of ${hits.length}`
						: 'All shots'}</span
				></label
			><input
				id="replay-{mobile}"
				type="range"
				min="0"
				max={hits.length}
				value={visualizationState.currentReplayShot}
				on:input={(event) => {
					const value = Number(event.target.value);
					visualizationState.currentReplayShot = value;
					visualizationState.showAllShots = value === 0;
				}}
			/>
			<p class="small muted">Move the slider to review shots in sequence.</p>
		</div>{/if}
	{#if hits.length >= 2}{@const grouping = calculateShotGrouping(hits)}
		<div class="group-analysis">
			<span>Average group diameter<strong>{grouping.groupSize}</strong></span><span
				>Maximum radial spread<strong>{grouping.maxSpread}px</strong></span
			>
		</div>
		<p class="small muted">Measured in camera pixels, not physical distance.</p>{/if}
	<button class="btn btn-full" disabled={!hits.length} on:click={() => dispatch('export')}
		><Icon name="camera" size={17} />Export shot image</button
	>
</div>

<style>
	.shot-controls {
		display: flex;
		flex-direction: column;
		gap: 14px;
		font-size: 0.85rem;
	}
	.line-color {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
	}
	.line-color input {
		width: 54px;
		height: 36px;
		border: 1px solid #c4cfdd;
		border-radius: 5px;
		background: white;
		padding: 3px;
	}
	.group-analysis {
		display: flex;
		gap: 20px;
		border-top: 1px solid #d9e1eb;
		padding-top: 18px;
		color: #5b6d80;
		font-size: 0.75rem;
	}
	.group-analysis strong {
		display: block;
		color: #18324b;
		font-size: 1rem;
		margin-top: 5px;
	}
	.compact {
		gap: 10px;
	}
</style>
