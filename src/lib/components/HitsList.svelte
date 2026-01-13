<script>
	export let hits = [];
</script>

<div class="bg-card rounded-xl border border-border p-4 min-h-[200px] flex flex-col">
	{#if hits.length === 0}
		<div class="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-8">
			<div class="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
				<svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</div>
			<div>
				<p class="text-muted-foreground text-sm font-medium">No hits detected yet</p>
				<p class="text-muted-foreground/60 text-xs mt-1">Point your laser at the target</p>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-sm font-semibold">Hit History</h3>
				<span class="text-xs text-muted-foreground">{hits.length} {hits.length === 1 ? 'hit' : 'hits'}</span>
			</div>
			<div class="space-y-1.5 max-h-[300px] overflow-y-auto">
				{#each hits.slice().reverse() as hit (hit.id)}
					<div class="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
						<div class="flex items-center gap-2">
							<div class="w-2 h-2 rounded-full {hit.zone === 'A' ? 'bg-success' : hit.zone === 'C' ? 'bg-warning' : hit.zone === 'D' ? 'bg-destructive' : 'bg-muted-foreground'}"></div>
							<span class="text-xs font-medium">Zone {hit.zone || 'Miss'}</span>
							{#if hit.points !== undefined}
								<span class="text-xs text-muted-foreground">({hit.points} pts)</span>
							{/if}
						</div>
						<span class="text-xs text-muted-foreground">{new Date(hit.timestamp).toLocaleTimeString()}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>