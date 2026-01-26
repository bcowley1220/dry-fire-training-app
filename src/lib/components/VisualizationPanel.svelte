<script>
	import { createEventDispatcher } from 'svelte';

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

<div class={mobile ? 'mb-4 rounded-lg bg-secondary/50 p-4' : ''}>
	<div class="mb-4 flex items-center justify-between {mobile ? '' : 'mb-6'}">
		<h3 class={mobile ? 'text-lg font-semibold' : 'text-xl font-semibold'}>
			Shot Sequence Visualization
		</h3>
		<button
			on:click={() => dispatch('close')}
			class="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
			aria-label="Close sequence controls"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	<div class="space-y-4">
		<!-- Toggle Controls -->
		<div class="flex items-center gap-3">
			<input
				id="show-shot-numbers-{mobile ? 'mobile' : 'desktop'}"
				type="checkbox"
				bind:checked={visualizationState.showShotNumbers}
				class="h-5 w-5"
			/>
			<label for="show-shot-numbers-{mobile ? 'mobile' : 'desktop'}" class="cursor-pointer">
				Show Shot Numbers
			</label>
		</div>

		<div class="flex items-center gap-3">
			<input
				id="show-sequence-lines-{mobile ? 'mobile' : 'desktop'}"
				type="checkbox"
				bind:checked={visualizationState.showSequenceLines}
				class="h-5 w-5"
			/>
			<label for="show-sequence-lines-{mobile ? 'mobile' : 'desktop'}" class="cursor-pointer">
				Show Sequence Lines
			</label>
		</div>

		<!-- Line Color Picker -->
		<div class="flex items-center gap-3">
			<label for="line-color-{mobile ? 'mobile' : 'desktop'}" class="text-sm">Line Color:</label>
			<input
				id="line-color-{mobile ? 'mobile' : 'desktop'}"
				type="color"
				bind:value={visualizationState.lineColor}
				class="h-8 w-16 cursor-pointer rounded border border-border"
			/>
		</div>

		<!-- Replay Mode Controls -->
		{#if hits.length > 0}
			<div class="border-t border-border pt-4">
				<label for="replay-slider-{mobile ? 'mobile' : 'desktop'}" class="mb-2 block">
					Replay Mode:
				</label>
				<input
					id="replay-slider-{mobile ? 'mobile' : 'desktop'}"
					type="range"
					min="0"
					max={hits.length}
					value={visualizationState.currentReplayShot}
					on:input={(e) => {
						const val = parseInt(e.target.value);
						visualizationState.currentReplayShot = val;
						visualizationState.showAllShots = val === 0;
					}}
					class="w-full"
				/>
				<div class="mt-1 text-center text-sm text-muted-foreground">
					{visualizationState.currentReplayShot === 0
						? 'All Shots'
						: `Shot ${visualizationState.currentReplayShot} of ${hits.length}`}
				</div>
			</div>
		{/if}

		<!-- Shot Group Analysis -->
		{#if hits.length >= 2}
			{@const grouping = calculateShotGrouping(hits)}
			{#if grouping}
				<div class="border-t border-border pt-4">
					<h4 class="text-md mb-3 font-semibold">Shot Group Analysis</h4>
					<div class="space-y-2">
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Group Size (avg):</span>
							<span class="font-semibold">{grouping.groupSize}</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Max Spread:</span>
							<span class="font-semibold">{grouping.maxSpread}px</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">Total Shots:</span>
							<span class="font-semibold">{hits.length}</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<!-- Export Button -->
		{#if hits.length > 0}
			<button
				on:click={() => dispatch('export')}
				class="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
			>
				📸 Export Shot Pattern
			</button>
		{/if}
	</div>
</div>
