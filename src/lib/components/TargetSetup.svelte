<script>
	import { createEventDispatcher } from 'svelte';
	import { templates } from '../utils/zones.js';

	export let targetMode = 'custom'; // 'preloaded' | 'custom' | 'freeform'
	export let selectedTemplate = 'ipsc-classic';
	export let isStreaming = false;

	const dispatch = createEventDispatcher();
	let isTemplateDropdownOpen = false;
</script>

<div class="bg-card rounded-xl border border-border p-4 space-y-4">
	<h2 class="font-semibold text-base">Select Target Mode</h2>

	<div class="space-y-2">
		<!-- Custom Target -->
		<button
			on:click={() => (targetMode = 'custom')}
			class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode ===
			'custom'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
		>
			<div
				class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode ===
				'custom'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="w-5 h-5 {targetMode === 'custom' ? 'text-primary' : 'text-muted-foreground'}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
					/>
				</svg>
			</div>
			<div class="flex-1 text-left min-w-0">
				<p class="font-medium text-sm">Custom Target</p>
				<p class="text-xs text-muted-foreground">Manual Zones</p>
			</div>
			{#if targetMode === 'custom'}
				<svg
					class="w-5 h-5 text-primary shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			{/if}
		</button>

		<!-- Free Training -->
		<button
			on:click={() => (targetMode = 'freeform')}
			class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode ===
			'freeform'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
		>
			<div
				class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode ===
				'freeform'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="w-5 h-5 {targetMode === 'freeform' ? 'text-primary' : 'text-muted-foreground'}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 10V3L4 14h7v7l9-11h-7z"
					/>
				</svg>
			</div>
			<div class="flex-1 text-left min-w-0">
				<p class="font-medium text-sm">Free Training</p>
				<p class="text-xs text-muted-foreground">No Zones</p>
			</div>
			{#if targetMode === 'freeform'}
				<svg
					class="w-5 h-5 text-primary shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			{/if}
		</button>

		<!-- Pre-loaded Template -->
		<button
			on:click={() => (targetMode = 'preloaded')}
			class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode ===
			'preloaded'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
		>
			<div
				class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode ===
				'preloaded'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="w-5 h-5 {targetMode === 'preloaded' ? 'text-primary' : 'text-muted-foreground'}"
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
			<div class="flex-1 text-left min-w-0">
				<p class="font-medium text-sm">Pre-loaded Template</p>
				<p class="text-xs text-muted-foreground">Quick Setup</p>
			</div>
			{#if targetMode === 'preloaded'}
				<svg
					class="w-5 h-5 text-primary shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			{/if}
		</button>
	</div>

	{#if targetMode === 'preloaded'}
		<!-- Template Selector -->
		<div class="space-y-2 pt-2 border-t border-border">
			<label class="text-xs text-muted-foreground font-medium">Select Template</label>
			<button
				on:click={() => (isTemplateDropdownOpen = !isTemplateDropdownOpen)}
				class="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary transition-colors"
			>
				<div class="text-left">
					<p class="font-medium text-sm">
						{templates[selectedTemplate]?.name || 'Select template'}
					</p>
					<p class="text-xs text-muted-foreground">
						{templates[selectedTemplate]?.size}, {templates[selectedTemplate]?.recommendedDistance}
					</p>
				</div>
				<svg
					class="w-5 h-5 text-muted-foreground transition-transform {isTemplateDropdownOpen
						? 'rotate-180'
						: ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if isTemplateDropdownOpen}
				<div class="bg-secondary rounded-lg border border-border overflow-hidden animate-fade-in">
					{#each Object.entries(templates) as [id, template]}
						{#if !template.grid}
							<button
								on:click={() => {
									selectedTemplate = id;
									isTemplateDropdownOpen = false;
								}}
								class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 {selectedTemplate ===
								id
									? 'bg-primary/10'
									: ''}"
							>
								<div class="text-left">
									<p class="font-medium text-sm">{template.name}</p>
									<p class="text-xs text-muted-foreground">
										{template.size}, {template.recommendedDistance}
									</p>
								</div>
								{#if selectedTemplate === id}
									<svg
										class="w-4 h-4 text-primary"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
						{/if}
					{/each}
				</div>
			{/if}

			<div class="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
				<span class="shrink-0 text-warning text-base">💡</span>
				<span class="text-xs text-warning/90"
					>Position camera {templates[selectedTemplate]?.recommendedDistance || '15-20 feet'} from
					target. Target should fill 30-50% of frame.</span
				>
			</div>
		</div>
	{/if}

	<button
		id="btn-start-camera"
		on:click={() => dispatch('complete')}
		class="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold transition-colors"
	>
		Continue
	</button>

	<p class="text-xs text-muted-foreground text-center pt-2">
		You'll calibrate by tapping the 4 corners <span class="text-primary font-medium">clockwise</span
		>
	</p>
</div>