<script>
	export let hits = [];
</script>

<div class="flex min-h-[200px] flex-col rounded-xl border border-border bg-card p-4">
	{#if hits.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center space-y-3 py-8 text-center">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50">
				<svg
					class="h-8 w-8 text-muted-foreground"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<div>
				<p class="text-sm font-medium text-muted-foreground">No hits detected yet</p>
				<p class="mt-1 text-xs text-muted-foreground/60">Point your laser at the target</p>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-semibold">Hit History</h3>
				<span class="text-xs text-muted-foreground"
					>{hits.length} {hits.length === 1 ? 'hit' : 'hits'}</span
				>
			</div>
			<div class="max-h-[300px] space-y-1.5 overflow-y-auto">
				{#each hits.slice().reverse() as hit (hit.id)}
					<div
						class="flex items-center justify-between rounded-lg bg-secondary/30 p-2 transition-colors hover:bg-secondary/50"
					>
						<div class="flex items-center gap-2">
							<div
								class="h-2 w-2 rounded-full {hit.zone === 'A'
									? 'bg-success'
									: hit.zone === 'C'
										? 'bg-warning'
										: hit.zone === 'D'
											? 'bg-destructive'
											: 'bg-muted-foreground'}"
							></div>
							<span class="text-xs font-medium">Zone {hit.zone || 'Miss'}</span>
							{#if hit.points !== undefined}
								<span class="text-xs text-muted-foreground">({hit.points} pts)</span>
							{/if}
						</div>
						<span class="text-xs text-muted-foreground"
							>{new Date(hit.timestamp).toLocaleTimeString()}</span
						>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
