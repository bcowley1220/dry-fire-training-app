<script>
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';
	import { formatTime, repTime, sessionSummary, trainingStatus } from '../utils/trainingView.js';
	export let active = false;
	export let phase = 'idle';
	export let config;
	export let session = { reps: [], startedAt: null };
	export let currentRound = 0;
	export let autoNextCountdown = null;
	export let startTime = null;
	export let timerDisplayUpdate = 0;
	export let ready = false;
	export let targetCount = 0;
	export let waitingForClear = false;
	export let callOutTarget = null;
	const dispatch = createEventDispatcher();
	let showReview = false;
	$: lastRep = session.reps.at(-1);
	$: summary = sessionSummary(session.reps);
	$: finished = phase === 'complete' && config.autoNextRound && currentRound >= config.roundCount;
	$: status = trainingStatus({
		phase,
		waitingForClear,
		callOutTarget,
		autoNextCountdown,
		sessionFinished: finished
	});
	$: elapsed = timerDisplayUpdate && startTime ? timerDisplayUpdate - startTime : 0;
	$: time =
		autoNextCountdown !== null
			? Math.ceil(autoNextCountdown / 1000)
			: phase === 'complete'
				? formatTime(repTime(lastRep))
				: formatTime(elapsed);
	const drills = [
		{
			id: 'draw',
			name: 'Draw',
			detail: 'First-shot time',
			description: 'Draw and fire one training shot after the beep.'
		},
		{
			id: 'reload',
			name: 'Reload',
			detail: 'Two-shot drill',
			description: 'Fire once, reload, then fire again. See both splits.'
		},
		{
			id: 'callout',
			name: 'Call-out',
			detail: 'Target recognition',
			description: 'Listen for a target name, then hit the target called.'
		}
	];
	function delay(event, key) {
		const value = Number(event.target.value) * 1000;
		if (value >= 1000 && value <= 30000) {
			config[key] = value;
			if (config.randomDelayMax < config.randomDelayMin)
				config.randomDelayMax = config.randomDelayMin;
		}
		event.target.value = config[key] / 1000;
	}
</script>

<section
	class="drill-console"
	class:live={phase !== 'idle'}
	class:stats-expanded={showReview}
	aria-label="Training controls"
>
	{#if phase === 'idle'}
		<div class="stack">
			<div>
				<h2>Make the next rep count.</h2>
				<p class="muted intro">Choose a drill. Set your pace. Step back when you're ready.</p>
			</div>
			<fieldset class="drill-choices">
				<legend class="sr-only">Choose a drill</legend>
				{#each drills as drill (drill.id)}
					<label class:selected={config.drillType === drill.id}
						><input
							type="radio"
							name="drill-type"
							value={drill.id}
							bind:group={config.drillType}
						/><strong>{drill.name}</strong><span>{drill.detail}</span></label
					>
				{/each}
			</fieldset>
			<p class="small muted">
				{drills.find((drill) => drill.id === config.drillType)?.description}
			</p>
			<div class="session-plan">
				<Icon name="refresh" size={18} /><span
					>{config.autoNextRound
						? `${config.roundCount} automatic reps`
						: 'One rep at a time'}</span
				><span>{config.randomDelayMin / 1000}–{config.randomDelayMax / 1000}s delay</span>
			</div>
			<details class="tool-disclosure">
				<summary
					><span class="action-row"><Icon name="settings" size={18} />Drill settings</span></summary
				>
				<div class="stack settings-content">
					<div class="field-pair">
						<div class="field">
							<label for="delay-min">Minimum delay (s)</label><input
								id="delay-min"
								type="number"
								min="1"
								max="30"
								value={config.randomDelayMin / 1000}
								on:change={(event) => delay(event, 'randomDelayMin')}
							/>
						</div>
						<div class="field">
							<label for="delay-max">Maximum delay (s)</label><input
								id="delay-max"
								type="number"
								min={config.randomDelayMin / 1000}
								max="30"
								value={config.randomDelayMax / 1000}
								on:change={(event) => delay(event, 'randomDelayMax')}
							/>
						</div>
					</div>
					<div class="field">
						<label for="beep-volume"
							>Beep volume <span class="muted">{Math.round(config.beepVolume * 100)}%</span></label
						><input
							id="beep-volume"
							type="range"
							min="0"
							max="1"
							step=".05"
							bind:value={config.beepVolume}
						/>
					</div>
					<label class="check-row"
						><input type="checkbox" bind:checked={config.autoNextRound} /><span
							><strong>Repeat automatically</strong><span class="small muted"
								>Stay in position between reps.</span
							></span
						></label
					>
					{#if config.autoNextRound}<div class="field-pair">
							<div class="field">
								<label for="round-count">Number of reps</label><input
									id="round-count"
									type="number"
									min="1"
									max="100"
									value={config.roundCount}
									on:change={(event) =>
										(config.roundCount = Math.max(
											1,
											Math.min(100, Number(event.target.value) || 1)
										))}
								/>
							</div>
							<div class="field">
								<label for="reset-duration">Rest between reps (s)</label><input
									id="reset-duration"
									type="number"
									min="1"
									max="30"
									value={config.resetDuration / 1000}
									on:change={(event) =>
										(config.resetDuration =
											Math.max(1, Math.min(30, Number(event.target.value) || 1)) * 1000)}
								/>
							</div>
						</div>{/if}
					<label class="check-row"
						><input type="checkbox" bind:checked={config.malfunctionMode} /><span
							><strong>Random malfunctions</strong><span class="small muted"
								>Occasionally ignore the first hit. Clear and fire again.</span
							></span
						></label
					>
				</div>
			</details>
			{#if !ready}<p class="notice">
					Start the camera and finish target setup to begin.
				</p>{:else if config.drillType === 'callout' && !targetCount}<p class="notice">
					Add at least one named target for a call-out drill.
				</p>{/if}
			<button
				class="btn btn-primary btn-large btn-full"
				disabled={!ready || (config.drillType === 'callout' && !targetCount)}
				on:click={() => {
					showReview = false;
					dispatch('start');
				}}><Icon name="play" size={18} />Start drill</button
			>
			<p class="small muted start-note">Wait for the beep before firing your training laser.</p>
		</div>
	{:else}
		<div
			class="live-readout"
			class:waiting={phase === 'waiting'}
			class:complete={phase === 'complete'}
			class:failed={lastRep?.isFailure && phase === 'complete'}
		>
			<div class="rep-counter">
				{config.autoNextRound
					? `Rep ${currentRound} of ${config.roundCount}`
					: `Rep ${currentRound}`}
			</div>
			<p class="phase-label" aria-live="polite">{status}</p>
			{#if phase === 'waiting'}<div class="standby-display">
					Listen for<br />the beep.
				</div>{:else}<div
					class="timer-value"
					aria-label={autoNextCountdown !== null
						? `Next rep in ${time} seconds`
						: `${time} seconds`}
				>
					<span>{time}</span><small>s</small>
				</div>{/if}
			{#if phase === 'complete' && lastRep}<div class="rep-outcome">
					{lastRep.isFailure
						? `Wrong target. Called ${lastRep.calledTarget}.`
						: lastRep.drillType === 'reload'
							? `Draw ${formatTime(lastRep.drawTime)}s / Reload ${formatTime(lastRep.reloadTime)}s`
							: `${lastRep.hit?.zone || 'Hit'}${lastRep.hit?.points != null ? ` / ${lastRep.hit.points} points` : ''}`}
				</div>{:else if phase === 'reloading'}<p class="rep-outcome">
					First shot registered. Reload for your second shot.
				</p>{:else if phase === 'active'}<p class="rep-outcome">
					{waitingForClear
						? 'Clear, then fire again.'
						: config.drillType === 'callout'
							? 'Fire at the named target.'
							: 'Fire when ready.'}
				</p>{/if}
		</div>
		<div class="live-actions">
			{#if active || autoNextCountdown !== null}<button
					class="btn btn-full"
					on:click={() => dispatch('cancel')}><Icon name="stop" size={17} />Stop drill</button
				>{:else}<button
					class="btn btn-primary btn-large btn-full"
					on:click={() => {
						showReview = false;
						dispatch(finished ? 'start' : 'next');
					}}><Icon name="refresh" size={18} />{finished ? 'Repeat session' : 'Next rep'}</button
				>
				<div class="action-row">
					<button class="btn btn-quiet" on:click={() => (showReview = !showReview)}
						>{showReview ? 'Hide results' : 'Review session'}</button
					><button class="btn btn-quiet" on:click={() => dispatch('finish')}>Finish session</button>
				</div>{/if}
		</div>
	{/if}
	{#if summary.count > 0}
		<div class="session-summary">
			<div><span>Completed</span><strong>{summary.count}<small> reps</small></strong></div>
			<div><span>Best</span><strong>{formatTime(summary.best)}<small>s</small></strong></div>
			<div><span>Average</span><strong>{formatTime(summary.average)}<small>s</small></strong></div>
		</div>
		{#if showReview}<div class="rep-table">
				<div class="table-heading"><span>Rep</span><span>Time</span><span>Result</span></div>
				{#each session.reps as rep, index (rep.id)}<div>
						<span>{index + 1}</span><strong>{formatTime(repTime(rep))}s</strong><span
							>{rep.isFailure
								? 'Wrong target'
								: (rep.hits || [rep.hit]).map((hit) => hit?.zone || 'Hit').join(' / ')}</span
						>
					</div>{/each}
			</div>{/if}
	{/if}
</section>

<style>
	.intro {
		margin-top: 12px;
	}
	.drill-choices {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.drill-choices label {
		padding: 12px 8px;
		border: 1px solid #d9e1eb;
		border-radius: 8px;
		cursor: pointer;
		position: relative;
	}
	.drill-choices input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.drill-choices label:has(input:focus-visible) {
		outline: 3px solid #315de3;
		outline-offset: 3px;
	}
	.drill-choices label.selected {
		border-color: #315de3;
		background: #eef3ff;
	}
	.drill-choices strong {
		font-size: 1rem;
		display: block;
	}
	.drill-choices span {
		display: block;
		font-size: 0.7rem;
		line-height: 1.35;
		color: #5b6d80;
		margin-top: 4px;
	}
	.session-plan {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
		font-size: 0.8rem;
		color: #5b6d80;
	}
	.session-plan span:last-child {
		margin-left: auto;
	}
	.start-note {
		text-align: center;
		margin-top: -8px;
		font-size: 0.8rem;
	}
	.live-readout {
		background: #eaf0ff;
		border-radius: 12px;
		padding: 26px 18px 24px;
		text-align: center;
		color: #244cc8;
	}
	.live-readout.waiting {
		background: #fff4df;
		color: #8c4a0c;
	}
	.live-readout.complete {
		background: #edf5f2;
		color: #1c6546;
	}
	.live-readout.failed {
		background: #fff0f0;
		color: #a72f39;
	}
	.rep-counter {
		font-size: 0.85rem;
		opacity: 0.8;
		margin-bottom: 18px;
	}
	.phase-label {
		font-weight: 600;
		font-size: 1.2rem;
	}
	.standby-display {
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-weight: 500;
		font-size: clamp(3rem, 6vw, 4.5rem);
		line-height: 1;
		padding: 18px 0;
	}
	.timer-value {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 7px;
		padding: 8px 0 6px;
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.timer-value > span {
		font-size: clamp(5.5rem, 10vw, 8rem);
		font-weight: 500;
		letter-spacing: -0.045em;
	}
	.timer-value small {
		font-size: 1.8rem;
	}
	.rep-outcome {
		font-size: 0.9rem;
		margin: 12px auto 0;
		line-height: 1.5;
	}
	.live-actions {
		padding-top: 16px;
	}
	.live-actions .action-row {
		justify-content: space-between;
		margin-top: 8px;
	}
	.session-summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 22px 0 0;
		margin-top: 24px;
		border-top: 1px solid #d9e1eb;
		gap: 12px;
	}
	.session-summary span {
		display: block;
		color: #5b6d80;
		font-size: 0.8rem;
	}
	.session-summary strong {
		display: block;
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-weight: 500;
		font-size: 1.9rem;
		font-variant-numeric: tabular-nums;
		margin-top: 4px;
	}
	.session-summary small {
		font-size: 0.85rem;
	}
	.rep-table {
		margin-top: 20px;
		max-height: 340px;
		overflow: auto;
		font-size: 0.85rem;
	}
	.rep-table > div {
		display: grid;
		grid-template-columns: 36px 80px 1fr;
		padding: 10px 0;
		border-bottom: 1px solid #e4eaf2;
	}
	.table-heading {
		color: #5b6d80;
	}
	@media (max-width: 360px) {
		.drill-choices span {
			display: none;
		}
	}
	@media (max-width: 700px), (max-height: 550px) and (orientation: landscape) {
		.drill-console.live:not(.stats-expanded) .session-summary {
			display: none;
		}
		.live-readout {
			padding: 18px 16px;
		}
		.rep-counter {
			margin-bottom: 10px;
		}
		.timer-value > span {
			font-size: 6rem;
		}
	}
	@media (max-height: 550px) and (orientation: landscape) {
		.live-readout {
			padding: 12px;
		}
		.rep-counter {
			margin-bottom: 4px;
		}
		.timer-value > span {
			font-size: 4.5rem;
		}
		.rep-outcome {
			margin-top: 4px;
		}
		.live-actions {
			padding-top: 10px;
		}
	}
</style>
