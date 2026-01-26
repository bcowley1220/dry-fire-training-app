<script>
	import { createEventDispatcher } from 'svelte';

	export let zones;
	export let mobile = false;

	const dispatch = createEventDispatcher();

	function updateZoneBounds(zoneName, axis, index, value) {
		const numValue = parseFloat(value);
		if (isNaN(numValue) || numValue < 0 || numValue > 1) return;

		zones[zoneName].bounds[axis][index] = numValue;
		// Ensure min < max
		if (index === 0 && zones[zoneName].bounds[axis][0] >= zones[zoneName].bounds[axis][1]) {
			zones[zoneName].bounds[axis][0] = zones[zoneName].bounds[axis][1] - 0.01;
		}
		if (index === 1 && zones[zoneName].bounds[axis][1] <= zones[zoneName].bounds[axis][0]) {
			zones[zoneName].bounds[axis][1] = zones[zoneName].bounds[axis][0] + 0.01;
		}
		zones = { ...zones }; // Trigger reactivity
	}

	function updateZonePoints(zoneName, value) {
		const numValue = parseInt(value);
		if (isNaN(numValue) || numValue < 0) return;
		zones[zoneName].points = numValue;
		zones = { ...zones }; // Trigger reactivity
	}
</script>

<div class={mobile ? 'mb-4 rounded-lg bg-secondary/50 p-4' : ''}>
	<div class="mb-4 flex items-center justify-between {mobile ? '' : 'mb-6'}">
		<h3 class={mobile ? 'text-lg font-semibold' : 'text-xl font-semibold'}>Custom Zone Settings</h3>
		<button
			on:click={() => dispatch('close')}
			class="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
			aria-label="Close zone settings"
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
	<div class="space-y-6">
		{#each ['A', 'C', 'D'] as zoneName}
			{@const zone = zones[zoneName]}
			<div class="rounded-lg border border-border bg-background/50 p-4">
				<div class="mb-3 flex items-center gap-3">
					<div
						class="h-6 w-6 rounded border-2"
						style="background-color: {zone.color}; border-color: {zone.color};"
					></div>
					<h4 class="text-md font-semibold" style="color: {zone.color}">
						{zoneName}-zone ({zone.points} pts)
					</h4>
				</div>
				<div class={mobile ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'space-y-4'}>
					<!-- Points -->
					<div>
						<label
							for="points-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
							class="mb-1 block text-sm text-muted-foreground">Points</label
						>
						<input
							id="points-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
							type="number"
							min="0"
							max="10"
							value={zone.points}
							on:input={(e) => updateZonePoints(zoneName, e.target.value)}
							class="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
						/>
					</div>
					<!-- X-axis bounds -->
					<div>
						<div class="mb-1 block text-sm text-muted-foreground">
							X-axis: {zone.bounds.x[0].toFixed(2)} - {zone.bounds.x[1].toFixed(2)}
						</div>
						<div class="space-y-2">
							{#each ['Min', 'Max'] as label, i}
								<div>
									<label
										for="x-{label.toLowerCase()}-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
										class="text-xs text-muted-foreground">{label} X:</label
									>
									<input
										id="x-{label.toLowerCase()}-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={zone.bounds.x[i]}
										on:input={(e) => updateZoneBounds(zoneName, 'x', i, e.target.value)}
										class="w-full"
									/>
								</div>
							{/each}
						</div>
					</div>
					<!-- Y-axis bounds -->
					<div>
						<div class="mb-1 block text-sm text-muted-foreground">
							Y-axis: {zone.bounds.y[0].toFixed(2)} - {zone.bounds.y[1].toFixed(2)}
						</div>
						<div class="space-y-2">
							{#each ['Min', 'Max'] as label, i}
								<div>
									<label
										for="y-{label.toLowerCase()}-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
										class="text-xs text-muted-foreground">{label} Y:</label
									>
									<input
										id="y-{label.toLowerCase()}-{zoneName}-{mobile ? 'mobile' : 'desktop'}"
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={zone.bounds.y[i]}
										on:input={(e) => updateZoneBounds(zoneName, 'y', i, e.target.value)}
										class="w-full"
									/>
								</div>
							{/each}
						</div>
					</div>
					<!-- Zone preview info -->
					<div class="text-xs text-muted-foreground">
						<p>Zone covers:</p>
						<p>
							{((zone.bounds.x[1] - zone.bounds.x[0]) * 100).toFixed(0)}% width ×{' '}
							{((zone.bounds.y[1] - zone.bounds.y[0]) * 100).toFixed(0)}% height
						</p>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<div
		class={mobile
			? 'mt-4 flex items-center justify-between border-t border-border pt-4'
			: 'mt-6 border-t border-border pt-6'}
	>
		<p class="text-xs text-muted-foreground {mobile ? '' : 'mb-4'}">
			💡 Tip: Zones are checked from innermost (A) to outermost (D). Make sure A-zone is inside
			C-zone, and C-zone is inside D-zone for best results.
		</p>
		<button
			on:click={() => dispatch('reset')}
			class="{mobile
				? ''
				: 'w-full'} rounded-lg bg-secondary px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
		>
			Reset to Defaults
		</button>
	</div>
</div>
