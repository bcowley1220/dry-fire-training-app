<script>
	export let isStreaming = false;
	export let hits = [];
	export let targetBoundary = null;
</script>

<div class="flex flex-wrap gap-2 justify-center">
	<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {isStreaming ? 'bg-success/20 text-success border-success/30' : 'bg-secondary/50 text-foreground border-border'}">
		{#if isStreaming}
			<span class="w-2 h-2 rounded-full bg-success pulse-active shrink-0"></span>
		{/if}
		<span class="text-muted-foreground/80 font-medium">Status</span>
		<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Inactive'}</span>
	</div>
	<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs bg-secondary/50 text-foreground border-border">
		<span class="text-muted-foreground/80 font-medium">Hits</span>
		<span class="font-mono font-semibold">{hits.length}</span>
	</div>
	<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {targetBoundary ? 'bg-success/20 text-success border-success/30' : 'bg-warning/20 text-warning border-warning/30'}">
		<span class="w-2 h-2 rounded-full {targetBoundary ? 'bg-success' : 'bg-warning'} shrink-0"></span>
		<span class="text-muted-foreground/80 font-medium">Calibrated</span>
		<span class="font-mono font-semibold">{targetBoundary ? 'Yes' : 'No'}</span>
	</div>
	<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {isStreaming ? 'bg-success/20 text-success border-success/30' : 'bg-secondary/50 text-foreground border-border'}">
		{#if isStreaming}
			<span class="w-2 h-2 rounded-full bg-success shrink-0"></span>
		{/if}
		<span class="text-muted-foreground/80 font-medium">Detection</span>
		<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Off'}</span>
	</div>
</div>