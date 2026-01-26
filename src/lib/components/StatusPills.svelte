<script>
	export let isStreaming = false;
	export let hits = [];
	export let targets = [];
	export let backgroundSnapshot = null;
</script>

<div class="flex flex-wrap justify-center gap-2">
	<div
		class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs {isStreaming
			? 'border-success/30 bg-success/20 text-success'
			: 'border-border bg-secondary/50 text-foreground'}"
	>
		{#if isStreaming}
			<span class="pulse-active h-2 w-2 shrink-0 rounded-full bg-success"></span>
		{/if}
		<span class="font-medium text-muted-foreground/80">Status</span>
		<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Inactive'}</span>
	</div>
	<div
		class="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground"
	>
		<span class="font-medium text-muted-foreground/80">Hits</span>
		<span class="font-mono font-semibold">{hits.length}</span>
	</div>
	<div
		class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs {targets.length > 0
			? 'border-success/30 bg-success/20 text-success'
			: 'border-warning/30 bg-warning/20 text-warning'}"
	>
		<span class="h-2 w-2 rounded-full {targets.length > 0 ? 'bg-success' : 'bg-warning'} shrink-0"
		></span>
		<span class="font-medium text-muted-foreground/80">Calibrated</span>
		<span class="font-mono font-semibold">{targets.length > 0 ? targets.length : 'No'}</span>
	</div>
	<div
		class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs {isStreaming
			? 'border-success/30 bg-success/20 text-success'
			: 'border-border bg-secondary/50 text-foreground'}"
	>
		{#if isStreaming}
			<span class="h-2 w-2 shrink-0 rounded-full bg-success"></span>
		{/if}
		<span class="font-medium text-muted-foreground/80">Detection</span>
		<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Off'}</span>
	</div>
	{#if backgroundSnapshot}
		<div
			class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs {isStreaming
				? 'border-success/30 bg-success/20 text-success'
				: 'border-border bg-secondary/50 text-foreground'}"
		>
			<span class="h-2 w-2 rounded-full {targets.length > 0 ? 'bg-success' : 'bg-warning'} shrink-0"
			></span>
			<span class="font-medium text-muted-foreground/80">Background</span>
			<span class="font-mono font-semibold text-green-400">Set</span>
		</div>
	{/if}
</div>
