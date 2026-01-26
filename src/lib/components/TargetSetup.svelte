<script>
	import { createEventDispatcher } from 'svelte';
	import { templates } from '../utils/zones.js';

	export let targetMode = 'custom'; // 'preloaded' | 'custom' | 'freeform'
	export let selectedTemplate = 'ipsc-classic';
	export let isStreaming = false;

	const dispatch = createEventDispatcher();
	let isTemplateDropdownOpen = false;
</script>

<div class="space-y-4 rounded-xl border border-border bg-card p-4">
	<h2 class="text-base font-semibold">Select Target Mode</h2>

	<div class="space-y-2">
		<!-- Custom Target -->
		<button
			on:click={() => (targetMode = 'custom')}
			class="flex w-full items-center gap-3 rounded-lg border p-3 transition-all duration-200 {targetMode ===
			'custom'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 text-foreground hover:bg-secondary'}"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {targetMode ===
				'custom'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="h-5 w-5 {targetMode === 'custom' ? 'text-primary' : 'text-muted-foreground'}"
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
			<div class="min-w-0 flex-1 text-left">
				<p class="text-sm font-medium">Custom Target</p>
				<p class="text-xs text-muted-foreground">Manual Zones</p>
			</div>
			{#if targetMode === 'custom'}
				<svg
					class="h-5 w-5 shrink-0 text-primary"
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
			class="flex w-full items-center gap-3 rounded-lg border p-3 transition-all duration-200 {targetMode ===
			'freeform'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 text-foreground hover:bg-secondary'}"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {targetMode ===
				'freeform'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="h-5 w-5 {targetMode === 'freeform' ? 'text-primary' : 'text-muted-foreground'}"
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
			<div class="min-w-0 flex-1 text-left">
				<p class="text-sm font-medium">Free Training</p>
				<p class="text-xs text-muted-foreground">No Zones</p>
			</div>
			{#if targetMode === 'freeform'}
				<svg
					class="h-5 w-5 shrink-0 text-primary"
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
			class="flex w-full items-center gap-3 rounded-lg border p-3 transition-all duration-200 {targetMode ===
			'preloaded'
				? 'border-primary bg-primary/10 text-primary'
				: 'border-border bg-secondary/50 text-foreground hover:bg-secondary'}"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {targetMode ===
				'preloaded'
					? 'bg-primary/20'
					: 'bg-secondary'}"
			>
				<svg
					class="h-5 w-5 {targetMode === 'preloaded' ? 'text-primary' : 'text-muted-foreground'}"
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
			<div class="min-w-0 flex-1 text-left">
				<p class="text-sm font-medium">Pre-loaded Template</p>
				<p class="text-xs text-muted-foreground">Quick Setup</p>
			</div>
			{#if targetMode === 'preloaded'}
				<svg
					class="h-5 w-5 shrink-0 text-primary"
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
		<div class="space-y-2 border-t border-border pt-2">
			<label class="text-xs font-medium text-muted-foreground">Select Template</label>
			<button
				on:click={() => (isTemplateDropdownOpen = !isTemplateDropdownOpen)}
				class="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 transition-colors hover:bg-secondary"
			>
				<div class="text-left">
					<p class="text-sm font-medium">
						{templates[selectedTemplate]?.name || 'Select template'}
					</p>
					<p class="text-xs text-muted-foreground">
						{templates[selectedTemplate]?.size}, {templates[selectedTemplate]?.recommendedDistance}
					</p>
				</div>
				<svg
					class="h-5 w-5 text-muted-foreground transition-transform {isTemplateDropdownOpen
						? 'rotate-180'
						: ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{#if isTemplateDropdownOpen}
				<div class="animate-fade-in overflow-hidden rounded-lg border border-border bg-secondary">
					{#each Object.entries(templates) as [id, template]}
						{#if !template.grid}
							<button
								on:click={() => {
									selectedTemplate = id;
									isTemplateDropdownOpen = false;
								}}
								class="flex w-full items-center justify-between border-b border-border/50 p-3 transition-colors last:border-0 hover:bg-muted/50 {selectedTemplate ===
								id
									? 'bg-primary/10'
									: ''}"
							>
								<div class="text-left">
									<p class="text-sm font-medium">{template.name}</p>
									<p class="text-xs text-muted-foreground">
										{template.size}, {template.recommendedDistance}
									</p>
								</div>
								{#if selectedTemplate === id}
									<svg
										class="h-4 w-4 text-primary"
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

			<div class="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3">
				<span class="shrink-0 text-base text-warning">💡</span>
				<span class="text-xs text-warning/90"
					>Position camera {templates[selectedTemplate]?.recommendedDistance || '15-20 feet'} from target.
					Target should fill 30-50% of frame.</span
				>
			</div>
		</div>
	{/if}

	<button
		id="btn-start-camera"
		on:click={() => dispatch('complete')}
		class="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
	>
		Continue
	</button>

	<p class="pt-2 text-center text-xs text-muted-foreground">
		You'll calibrate by tapping the 4 corners <span class="font-medium text-primary">clockwise</span
		>
	</p>
</div>
