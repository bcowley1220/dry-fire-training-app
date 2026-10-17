<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { deleteSession, getSessionWithReps, getSessions } from '$lib/storage/trainingLog.js';

	export let refreshKey = 0;
	export let mobile = false;

	const dispatch = createEventDispatcher();

	let mounted = false;
	let sessions = [];
	let selectedSession = null;
	let selectedReps = [];
	let loading = true;
	let error = '';

	function formatDate(timestamp) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatTime(ms) {
		if (ms === null || ms === undefined || Number.isNaN(ms)) return '--';
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function getRepTime(rep) {
		return rep.drillType === 'reload' ? rep.totalTime : rep.drawTime;
	}

	function getDrillLabel(drillType) {
		switch (drillType) {
			case 'reload':
				return 'Reload';
			case 'callout':
				return 'Call-Out';
			default:
				return 'Draw';
		}
	}

	function summarizeZones(reps) {
		const counts = {};

		for (const rep of reps) {
			const hits = rep.hits || (rep.hit ? [rep.hit] : []);
			for (const hit of hits) {
				const zone = hit.zone || 'Unknown';
				counts[zone] = (counts[zone] || 0) + 1;
			}
		}

		return Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 4);
	}

	async function loadSessions(keepSelection = true) {
		loading = true;
		error = '';

		try {
			sessions = await getSessions();

			if (keepSelection && selectedSession) {
				const stillExists = sessions.some((session) => session.id === selectedSession.id);
				if (stillExists) {
					await selectSession(selectedSession.id);
				} else {
					selectedSession = null;
					selectedReps = [];
				}
			}
		} catch (err) {
			error = err.message || 'Unable to load training log.';
		} finally {
			loading = false;
		}
	}

	async function selectSession(sessionId) {
		error = '';

		try {
			const { session, reps } = await getSessionWithReps(sessionId);
			selectedSession = session;
			selectedReps = reps;
		} catch (err) {
			error = err.message || 'Unable to load session details.';
		}
	}

	async function removeSelectedSession() {
		if (!selectedSession) return;
		if (!confirm('Delete this training session?')) return;

		try {
			await deleteSession(selectedSession.id);
			selectedSession = null;
			selectedReps = [];
			await loadSessions(false);
		} catch (err) {
			error = err.message || 'Unable to delete session.';
		}
	}

	$: if (browser && mounted && refreshKey !== undefined) {
		loadSessions();
	}

	onMount(() => {
		mounted = true;
	});
</script>

<div class="h-full overflow-y-auto rounded-lg bg-secondary/50 p-4">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-lg font-semibold">Training Log</h3>
		<button
			on:click={() => dispatch('close')}
			class="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
			aria-label="Close training log"
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

	{#if error}
		<div
			class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
		>
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="py-8 text-center text-sm text-muted-foreground">Loading sessions...</div>
	{:else if sessions.length === 0}
		<div class="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
			Completed drill reps will be saved here automatically.
		</div>
	{:else}
		<div class={mobile ? 'space-y-4' : 'grid grid-cols-[minmax(0,1fr)] gap-4'}>
			<div class="space-y-2">
				{#each sessions as session (session.id)}
					<button
						on:click={() => selectSession(session.id)}
						class="w-full rounded-lg border p-3 text-left transition-colors {selectedSession?.id ===
						session.id
							? 'border-primary bg-primary/10'
							: 'border-border bg-background/40 hover:bg-background/70'}"
					>
						<div class="mb-2 flex items-start justify-between gap-3">
							<div>
								<div class="font-semibold">{getDrillLabel(session.drillType)}</div>
								<div class="text-xs text-muted-foreground">{formatDate(session.startedAt)}</div>
							</div>
							<div class="rounded bg-secondary px-2 py-1 text-xs font-semibold">
								{session.repCount} rep{session.repCount === 1 ? '' : 's'}
							</div>
						</div>
						<div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
							<div>Best: <span class="text-foreground">{formatTime(session.bestTime)}</span></div>
							<div>Avg: <span class="text-foreground">{formatTime(session.averageTime)}</span></div>
							<div>Hits: <span class="text-foreground">{session.totalHits}</span></div>
							<div>Mode: <span class="text-foreground">{session.targetMode}</span></div>
						</div>
					</button>
				{/each}
			</div>

			{#if selectedSession}
				<div class="rounded-lg border border-border bg-background/40 p-4">
					<div class="mb-4 flex items-start justify-between gap-3">
						<div>
							<h4 class="font-semibold">{getDrillLabel(selectedSession.drillType)} Session</h4>
							<p class="text-xs text-muted-foreground">{formatDate(selectedSession.startedAt)}</p>
						</div>
						<button
							on:click={removeSelectedSession}
							class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
						>
							Delete
						</button>
					</div>

					<div class="mb-4 grid grid-cols-3 gap-2">
						<div class="rounded bg-secondary/60 p-2 text-center">
							<div class="text-xs text-muted-foreground">Reps</div>
							<div class="font-mono text-lg font-bold">{selectedSession.repCount}</div>
						</div>
						<div class="rounded bg-secondary/60 p-2 text-center">
							<div class="text-xs text-muted-foreground">Best</div>
							<div class="font-mono text-lg font-bold text-success">
								{formatTime(selectedSession.bestTime)}
							</div>
						</div>
						<div class="rounded bg-secondary/60 p-2 text-center">
							<div class="text-xs text-muted-foreground">Avg</div>
							<div class="font-mono text-lg font-bold">
								{formatTime(selectedSession.averageTime)}
							</div>
						</div>
					</div>

					{#if summarizeZones(selectedReps).length > 0}
						<div class="mb-4">
							<div
								class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
							>
								Hit Zones
							</div>
							<div class="flex flex-wrap gap-2">
								{#each summarizeZones(selectedReps) as [zone, count] (zone)}
									<span class="rounded bg-secondary px-2 py-1 text-xs">{zone}: {count}</span>
								{/each}
							</div>
						</div>
					{/if}

					<div>
						<div class="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
							Reps
						</div>
						<div class="max-h-64 space-y-2 overflow-y-auto">
							{#each selectedReps as rep, index (rep.id)}
								<div class="rounded bg-secondary/50 p-2 text-sm">
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-2">
											<span class="text-muted-foreground">#{index + 1}</span>
											<span class="font-mono font-semibold">{formatTime(getRepTime(rep))}</span>
											{#if rep.isMalfunction}
												<span
													class="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive"
												>
													MALF
												</span>
											{/if}
											{#if rep.isFailure}
												<span
													class="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive"
												>
													FAIL
												</span>
											{/if}
										</div>
										<div class="text-xs text-muted-foreground">{formatDate(rep.timestamp)}</div>
									</div>
									{#if rep.drillType === 'reload'}
										<div class="mt-1 text-xs text-muted-foreground">
											Draw {formatTime(rep.drawTime)} / Reload {formatTime(rep.reloadTime)}
										</div>
									{:else if rep.drillType === 'callout'}
										<div class="mt-1 text-xs text-muted-foreground">
											Called {rep.calledTarget}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
