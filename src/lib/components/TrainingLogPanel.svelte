<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { deleteSession, getSessionWithReps, getSessions } from '$lib/storage/trainingLog.js';
	import { formatTime, repTime } from '../utils/trainingView.js';
	import Icon from './Icon.svelte';
	export let refreshKey = 0;
	export let mobile = false;
	const dispatch = createEventDispatcher();
	let mounted = false;
	let sessions = [];
	let selectedSession = null;
	let selectedReps = [];
	let loading = true;
	let error = '';
	let filter = 'all';
	let requestVersion = 0;
	let detailVersion = 0;
	$: visibleSessions = sessions.filter(
		(session) => filter === 'all' || session.drillType === filter
	);
	const drillName = (type) =>
		({ draw: 'Draw', reload: 'Reload', callout: 'Call-out' })[type] || 'Practice';
	function date(timestamp) {
		return new Date(timestamp).toLocaleDateString([], {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
	function time(timestamp) {
		return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}
	async function loadSessions() {
		const version = ++requestVersion;
		error = '';
		try {
			const result = await getSessions();
			if (version !== requestVersion) return;
			sessions = result;
			if (selectedSession && sessions.some((session) => session.id === selectedSession.id))
				await selectSession(selectedSession.id);
		} catch (err) {
			if (version === requestVersion)
				error = err.message || 'Training history could not be loaded. Try again.';
		} finally {
			if (version === requestVersion) loading = false;
		}
	}
	async function selectSession(id) {
		const version = ++detailVersion;
		error = '';
		try {
			const result = await getSessionWithReps(id);
			if (version !== detailVersion) return;
			selectedSession = result.session;
			selectedReps = result.reps;
		} catch (err) {
			if (version === detailVersion) error = err.message || 'Session details could not be loaded.';
		}
	}
	async function removeSession() {
		if (!selectedSession || !confirm('Delete this saved training session? This cannot be undone.'))
			return;
		try {
			await deleteSession(selectedSession.id);
			selectedSession = null;
			selectedReps = [];
			await loadSessions();
		} catch (err) {
			error = err.message || 'The session could not be deleted. Try again.';
		}
	}
	$: if (browser && mounted && refreshKey !== undefined) loadSessions();
	onMount(() => {
		mounted = true;
	});
</script>

<section class="history-panel" class:compact={mobile} aria-label="Training history">
	{#if error}<p class="notice notice-error" role="alert">
			{error}<button class="btn btn-quiet" on:click={loadSessions}>Try again</button>
		</p>{/if}
	{#if loading}<p class="empty-note muted" role="status">Loading your sessions…</p>
	{:else if !sessions.length}
		<div class="history-empty">
			<div class="history-empty-icon"><Icon name="history" size={38} /></div>
			<h2>A record of showing up.</h2>
			<p>
				Your completed drills will appear here, with times and hit zones. Start a session to make
				your first entry.
			</p>
			<button class="btn btn-primary btn-large" on:click={() => dispatch('practice')}
				><Icon name="play" size={18} />Start practicing</button
			><span class="small muted">Saved in this browser. No account needed.</span>
		</div>
	{:else}
		<div class="history-toolbar">
			<span>{sessions.length} saved session{sessions.length === 1 ? '' : 's'}</span>
			<div class="history-filter">
				<label for="history-filter">Show</label><select id="history-filter" bind:value={filter}
					><option value="all">All drills</option><option value="draw">Draw</option><option
						value="reload">Reload</option
					><option value="callout">Call-out</option></select
				>
			</div>
		</div>
		<div class="history-layout" class:has-selection={!!selectedSession}>
			<div class="session-list">
				{#if !visibleSessions.length}<p class="empty-note muted">
						No {drillName(filter).toLowerCase()} sessions yet. Choose another drill above.
					</p>{/if}{#each visibleSessions as session (session.id)}<button
						class="session-entry"
						class:selected={selectedSession?.id === session.id}
						on:click={() => selectSession(session.id)}
						aria-pressed={selectedSession?.id === session.id}
						><span class="session-entry-icon"
							><Icon
								name={session.drillType === 'reload'
									? 'refresh'
									: session.drillType === 'callout'
										? 'sound'
										: 'target'}
								size={22}
							/></span
						><span class="session-identity"
							><strong>{drillName(session.drillType)}</strong><span
								>{date(session.startedAt)} at {time(session.startedAt)}</span
							><small>{session.repCount} rep{session.repCount === 1 ? '' : 's'}</small></span
						><span class="session-result"
							><small>Average</small><strong
								>{formatTime(session.averageTime)}<small>s</small></strong
							></span
						><Icon name="chevron" size={17} /></button
					>{/each}
			</div>
			{#if selectedSession}<section class="session-detail" aria-label="Session details">
					<div class="detail-heading">
						<div>
							<h2>{drillName(selectedSession.drillType)} session</h2>
							<p class="small muted">
								{date(selectedSession.startedAt)} at {time(selectedSession.startedAt)}
							</p>
						</div>
						<button
							class="icon-button"
							aria-label="Close session details"
							on:click={() => {
								detailVersion++;
								selectedSession = null;
							}}><Icon name="close" /></button
						>
					</div>
					<div class="history-stats">
						<div>
							<span>Completed</span><strong>{selectedSession.repCount}<small> reps</small></strong>
						</div>
						<div>
							<span>Best</span><strong
								>{formatTime(selectedSession.bestTime)}<small>s</small></strong
							>
						</div>
						<div>
							<span>Average</span><strong
								>{formatTime(selectedSession.averageTime)}<small>s</small></strong
							>
						</div>
					</div>
					<div class="history-reps">
						<div class="history-rep-heading">
							<span>Rep</span><span>Time</span><span>Hit / result</span>
						</div>
						{#each selectedReps as rep, index (rep.id)}<div class="history-rep">
								<span>{index + 1}</span><strong>{formatTime(repTime(rep))}s</strong>
								<div>
									<span
										>{rep.isFailure
											? 'Wrong target'
											: (rep.hits || (rep.hit ? [rep.hit] : []))
													.map((hit) => hit.zone)
													.join(' / ')}</span
									>{#if rep.drillType === 'reload'}<small
											>Draw {formatTime(rep.drawTime)}s / Reload {formatTime(
												rep.reloadTime
											)}s</small
										>{/if}{#if rep.calledTarget}<small>Called {rep.calledTarget}</small
										>{/if}{#if rep.isMalfunction}<small>Malfunction cleared</small>{/if}
								</div>
							</div>{/each}
					</div>
					<button class="btn btn-quiet delete-session" on:click={removeSession}
						><Icon name="trash" size={16} />Delete session</button
					>
				</section>{/if}
		</div>
		<p class="history-local-note">
			<Icon name="history" size={16} />History is saved on this device. Clearing browser site data
			removes it.
		</p>
	{/if}
</section>

<style>
	.history-panel {
		background: white;
		border: 1px solid #d9e1eb;
		border-radius: 14px;
		padding: 28px;
	}
	.history-empty {
		min-height: 400px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 18px;
		padding: 40px 20px;
	}
	.history-empty-icon {
		color: #315de3;
		width: 80px;
		height: 80px;
		border: 1px solid #c2cfee;
		border-radius: 50%;
		display: grid;
		place-items: center;
		margin-bottom: 5px;
	}
	.history-empty h2 {
		font-size: 2.5rem;
	}
	.history-empty p {
		max-width: 44ch;
		color: #5b6d80;
		font-size: 0.95rem;
	}
	.history-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 18px;
		margin-bottom: 20px;
		color: #5b6d80;
		font-size: 0.85rem;
	}
	.history-filter {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.history-filter select {
		width: 150px;
		font-size: 0.85rem;
	}
	.history-layout.has-selection {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
	}
	.session-entry {
		display: flex;
		width: 100%;
		gap: 16px;
		align-items: center;
		padding: 22px 8px;
		border-top: 1px solid #e0e7ef;
		text-align: left;
	}
	.session-entry:hover,
	.session-entry.selected {
		background: #f0f4ff;
	}
	.session-entry-icon {
		color: #315de3;
		width: 42px;
		height: 42px;
		background: #edf2fd;
		border-radius: 9px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.session-identity {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.session-identity strong {
		font-weight: 600;
		font-size: 1rem;
	}
	.session-identity > span,
	.session-identity > small {
		color: #5b6d80;
		font-size: 0.78rem;
	}
	.session-result {
		margin-left: auto;
		text-align: right;
		flex-shrink: 0;
	}
	.session-result > small {
		display: block;
		color: #5b6d80;
		font-size: 0.72rem;
	}
	.session-result > strong {
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-size: 2rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.session-result > strong > small {
		font-size: 1rem;
	}
	.session-entry > :global(svg) {
		color: #8293a8;
	}
	.session-detail {
		background: #f5f7fa;
		border-radius: 10px;
		padding: 24px;
	}
	.detail-heading {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 22px;
	}
	.detail-heading h2 {
		font-size: 1.8rem;
		margin-bottom: 7px;
	}
	.history-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 24px;
	}
	.history-stats span {
		display: block;
		color: #5b6d80;
		font-size: 0.75rem;
	}
	.history-stats strong {
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-size: 2rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.history-stats small {
		font-size: 0.9rem;
	}
	.history-reps > div {
		display: grid;
		grid-template-columns: 30px 70px 1fr;
		padding: 12px 0;
		gap: 10px;
		border-bottom: 1px solid #d9e1eb;
		font-size: 0.85rem;
	}
	.history-rep-heading {
		color: #5b6d80;
	}
	.history-rep small {
		display: block;
		color: #5b6d80;
		font-size: 0.7rem;
		margin-top: 5px;
	}
	.delete-session {
		margin-top: 20px;
		color: #b73841;
	}
	.history-local-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 30px;
		font-size: 0.8rem;
		color: #5b6d80;
	}
	.compact .history-layout {
		display: block;
	}
	@media (max-width: 950px) {
		.history-layout.has-selection {
			grid-template-columns: 1fr;
			gap: 20px;
		}
	}
	@media (max-width: 600px) {
		.history-panel {
			padding: 20px 16px;
		}
		.history-empty {
			padding: 25px 4px;
			min-height: 360px;
		}
		.history-empty h2 {
			font-size: 2.1rem;
		}
		.session-entry {
			gap: 10px;
		}
		.session-entry-icon {
			width: 34px;
			height: 34px;
		}
		.history-toolbar {
			font-size: 0.78rem;
		}
		.history-filter label {
			display: none;
		}
		.history-filter select {
			width: 125px;
		}
		.session-detail {
			padding: 18px 14px;
		}
	}
</style>
