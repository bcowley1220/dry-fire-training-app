<script>
	import { createEventDispatcher } from 'svelte';
	import ZoneSettingsPanel from './ZoneSettingsPanel.svelte';
	import DrillsPanel from './DrillsPanel.svelte';
	import VisualizationPanel from './VisualizationPanel.svelte';

	// Props for button states
	export let calibrationMode = false;
	export let isStreaming = false;
	export let targets = [];
	export let hits = [];

	// Props for panel visibility (bindable)
	export let showZoneSettings = false;
	export let showDrills = false;
	export let showVisualizationControls = false;
	export let showDiagnosticOverlay = false;
	export let showDebugOverlay = false;

	// Props for child panels
	export let zones;
	export let shotTimerActive;
	export let shotTimerPhase;
	export let shotTimerConfig;
	export let shotTimerSession;
	export let currentRound;
	export let autoNextCountdown;
	export let shotTimerStartTime;
	export let timerDisplayUpdate;
	export let visualizationState;

	// Internal state
	let actionBarExpanded = false;

	const dispatch = createEventDispatcher();
</script>

<div class="safe-area-pb fixed right-0 bottom-0 left-0 z-40">
	<div
		id="action-bar"
		class="glass border-t border-border transition-all duration-300 ease-out {actionBarExpanded ||
		showZoneSettings ||
		showDrills ||
		showVisualizationControls
			? 'pb-4'
			: 'pb-0'}"
	>
		<!-- Toggle Handle -->
		<button
			on:click={() => (actionBarExpanded = !actionBarExpanded)}
			class="flex w-full items-center justify-center gap-2 py-2 text-muted-foreground transition-colors hover:text-foreground"
		>
			<svg
				class="h-5 w-5 transition-transform duration-300 {actionBarExpanded ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
			</svg>
			<span class="text-xs font-medium"
				>{actionBarExpanded ? 'Hide Controls' : 'More Controls'}</span
			>
		</button>

		<!-- Main Quick Actions -->
		<div class="flex justify-center gap-3 px-4 pb-3">
			<button
				id="btn-calibrate"
				on:click={() => dispatch('startCalibration')}
				disabled={calibrationMode || !isStreaming}
				class="flex flex-col items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/20 p-3 text-primary transition-all duration-200 hover:bg-primary/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if targets.length > 0}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<span class="text-xs font-medium">Add Target</span>
				{:else}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="text-xs font-medium">Calibrate</span>
				{/if}
			</button>
			<button
				on:click={() => (showZoneSettings = !showZoneSettings)}
				class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-3 text-foreground transition-all duration-200 hover:bg-secondary/80 active:scale-95"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2-2v-2z"
					/>
				</svg>
				<span class="text-xs font-medium">Zones</span>
			</button>
			<button
				id="btn-drills"
				on:click={() => (showDrills = !showDrills)}
				class="flex flex-col items-center gap-1.5 rounded-xl border border-warning/30 bg-warning/20 p-3 text-warning transition-all duration-200 hover:bg-warning/30 active:scale-95"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span class="text-xs font-medium">Drills</span>
			</button>
			<button
				on:click={() => dispatch('clearHits')}
				disabled={hits.length === 0}
				class="flex flex-col items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/20 p-3 text-destructive transition-all duration-200 hover:bg-destructive/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
				<span class="text-xs font-medium">Clear</span>
			</button>
		</div>

		<!-- Expanded Controls -->
		{#if actionBarExpanded}
			<div class="animate-fade-in border-t border-border/50 px-4 pt-3">
				<div class="mx-auto flex max-w-md flex-wrap justify-center gap-3">
					<button
						on:click={() => dispatch('clearCalibration')}
						disabled={targets.length === 0}
						class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-2.5 text-foreground transition-all duration-200 hover:bg-secondary/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						<span class="text-[10px] font-medium">Clear Cal</span>
					</button>
					<button
						on:click={() => dispatch('resetSetup')}
						class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-2.5 text-foreground transition-all duration-200 hover:bg-secondary/80 active:scale-95"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-[10px] font-medium">Target</span>
					</button>
					<button
						on:click={() => (showVisualizationControls = !showVisualizationControls)}
						class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-2.5 text-foreground transition-all duration-200 hover:bg-secondary/80 active:scale-95"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
						<span class="text-[10px] font-medium">Sequence</span>
					</button>
					<button
						on:click={() => dispatch('help')}
						class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-2.5 text-foreground transition-all duration-200 hover:bg-secondary/80 active:scale-95"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-[10px] font-medium">Help</span>
					</button>
					<button
						on:click={() => dispatch('resetApp')}
						class="flex w-[72px] flex-col items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-destructive transition-all duration-200 hover:bg-destructive/20 active:scale-95"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
						<span class="text-[10px] font-medium">Reset App</span>
					</button>
				</div>

				<!-- Target List -->
				{#if targets.length > 0}
					<div class="mt-4 border-t border-border/50 pt-3">
						<h4
							class="mb-2 text-center text-xs font-semibold tracking-wider text-muted-foreground uppercase"
						>
							Active Targets
						</h4>
						<div class="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
							{#each targets as target}
								<div
									class="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 p-2"
								>
									<span class="truncate text-xs font-medium">{target.name}</span>
									<div class="flex items-center">
										<button
											on:click={() => {
												const newName = prompt('Rename target:', target.name);
												if (newName) dispatch('renameTarget', { id: target.id, name: newName });
											}}
											class="mr-1 p-1 text-muted-foreground transition-colors hover:text-primary"
											aria-label="Rename target"
										>
											<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
												/></svg
											>
										</button>
										<button
											on:click={() => dispatch('removeTarget', target.id)}
											class="p-1 text-muted-foreground transition-colors hover:text-destructive"
											aria-label="Remove target"
										>
											<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M6 18L18 6M6 6l12 12"
												/></svg
											>
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Debug Section -->
				<div class="mt-4 flex justify-center gap-3 border-t border-border/50 pt-3">
					<button
						on:click={() => (showDiagnosticOverlay = !showDiagnosticOverlay)}
						class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
							/>
						</svg>
						Diagnostic
					</button>
					<button
						on:click={() => (showDebugOverlay = !showDebugOverlay)}
						class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
							/>
						</svg>
						Debug
					</button>
				</div>
			</div>
		{/if}

		<!-- Mobile Panels -->
		<div class="md:hidden">
			{#if showZoneSettings}
				<div
					class="animate-fade-in max-h-[50vh] overflow-y-auto border-t border-border/50 px-4 pt-3"
				>
					<ZoneSettingsPanel
						bind:zones
						mobile={true}
						on:close={() => (showZoneSettings = false)}
						on:reset={() => dispatch('resetZones')}
					/>
				</div>
			{/if}

			{#if showDrills}
				<div
					class="animate-fade-in max-h-[50vh] overflow-y-auto border-t border-border/50 px-4 pt-3"
				>
					<DrillsPanel
						mobile={true}
						active={shotTimerActive}
						phase={shotTimerPhase}
						bind:config={shotTimerConfig}
						session={shotTimerSession}
						{currentRound}
						{autoNextCountdown}
						startTime={shotTimerStartTime}
						{timerDisplayUpdate}
						on:start={() => dispatch('startDrill')}
						on:cancel={() => dispatch('cancelDrill')}
						on:next={() => dispatch('nextRep')}
						on:end={() => dispatch('endSession')}
						on:close={() => (showDrills = false)}
					/>
				</div>
			{/if}

			{#if showVisualizationControls}
				<div
					class="animate-fade-in max-h-[50vh] overflow-y-auto border-t border-border/50 px-4 pt-3"
				>
					<VisualizationPanel
						mobile={true}
						bind:visualizationState
						{hits}
						on:close={() => (showVisualizationControls = false)}
						on:export={() => dispatch('export')}
					/>
				</div>
			{/if}
		</div>
	</div>
</div>
