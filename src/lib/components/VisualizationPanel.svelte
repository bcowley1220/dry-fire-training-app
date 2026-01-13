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

<div class={mobile ? 'bg-secondary/50 rounded-lg p-4 mb-4' : ''}>
	<div class="flex items-center justify-between mb-4 {mobile ? '' : 'mb-6'}">
		<h3 class={mobile ? 'text-lg font-semibold' : 'text-xl font-semibold'}>
			Shot Sequence Visualization
		</h3>
		<button
			on:click={() => dispatch('close')}
			class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
			aria-label="Close sequence controls"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
				class="w-5 h-5"
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
				class="w-5 h-5"
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
				class="w-16 h-8 border border-border rounded cursor-pointer"
			/>
		</div>

		<!-- Replay Mode Controls -->
		{#if hits.length > 0}
			<div class="pt-4 border-t border-border">
				<label for="replay-slider-{mobile ? 'mobile' : 'desktop'}" class="block mb-2">
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
				<div class="text-center text-sm text-muted-foreground mt-1">
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
				<div class="pt-4 border-t border-border">
					<h4 class="text-md font-semibold mb-3">Shot Group Analysis</h4>
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
				class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
			>
				📸 Export Shot Pattern
			</button>
		{/if}
	</div>
</div>