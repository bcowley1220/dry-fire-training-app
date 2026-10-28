<script>
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { DEFAULT_CONFIG, validConfig } from '$lib/games/duck-hunt/model.js';
	import { createDuckSheet, grayscaleCanvas, paintPreview } from '$lib/games/duck-hunt/art.js';
	import { worldToProjector } from '$lib/games/coordinates.js';
	let { report = null, connected = false, onCommand, onShot, onExit } = $props();
	let preview,
		background,
		sheet,
		audio,
		lastCue = '';
	let loaded = $state(false),
		mode = $state(DEFAULT_CONFIG.mode),
		difficulty = $state(DEFAULT_CONFIG.difficulty),
		rounds = $state(DEFAULT_CONFIG.rounds),
		sound = $state(false),
		simulate = $state(false),
		debug = $state(false),
		audioError = $state('');
	let config = $derived({ mode, difficulty, rounds, sound });
	function command(action) {
		onCommand(action, { config });
	}
	function simulatedShot(world, method) {
		if (!simulate || !report || !world) return;
		onShot(worldToProjector(world, report.viewport, report.canvas), {
			method,
			detectedAt: report.sampleEpoch,
			timestampKind: 'preview-snapshot',
			encounter: report.round
		});
	}
	function click(event) {
		const r = preview.getBoundingClientRect();
		simulatedShot(
			{
				x: ((event.clientX - r.left) * 1280) / r.width,
				y: ((event.clientY - r.top) * 720) / r.height
			},
			'projector-preview'
		);
	}
	async function toggleSound(event) {
		sound = event.target.checked;
		audioError = '';
		if (!sound) {
			await audio?.close();
			audio = null;
			return;
		}
		try {
			audio ??= new (window.AudioContext || window.webkitAudioContext)();
			await audio.resume();
		} catch {
			audioError = 'Audio is unavailable in this browser.';
			sound = false;
		}
	}
	function cue(phase, outcome) {
		if (!audio || audio.state !== 'running') return;
		const notes =
			phase === 'FLYING'
				? [520, 650]
				: phase === 'SESSION_COMPLETE'
					? [440, 550, 660]
					: outcome === 'HIT'
						? [660, 880, 440]
						: [220, 165];
		notes.forEach((frequency, index) => {
			const oscillator = audio.createOscillator(),
				gain = audio.createGain(),
				at = audio.currentTime + index * 0.11;
			oscillator.type = 'triangle';
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
			oscillator.connect(gain);
			gain.connect(audio.destination);
			oscillator.start(at);
			oscillator.stop(at + 0.12);
			oscillator.onended = () => {
				oscillator.disconnect();
				gain.disconnect();
			};
		});
	}
	onMount(() => {
		let alive = true;
		sheet = createDuckSheet();
		const image = new Image();
		image.onload = () => {
			if (alive) {
				background = grayscaleCanvas(image);
				loaded = true;
			}
		};
		image.onerror = () => {
			if (alive) loaded = true;
		};
		image.src = asset('/duck-hunt/marsh.png');
		return () => {
			alive = false;
			image.onload = image.onerror = null;
			if (audio && audio.state !== 'closed') audio.close().catch(() => {});
		};
	});
	$effect(() => {
		if (preview && report && loaded)
			paintPreview(preview.getContext('2d'), report, background, sheet, debug);
	});
	$effect(() => {
		if (!report) return;
		const key = `${report.gameId}:${report.round}:${report.phase}`;
		if (key !== lastCue) {
			lastCue = key;
			if (
				sound &&
				!report.paused &&
				['FLYING', 'RESOLVING', 'SESSION_COMPLETE'].includes(report.phase)
			)
				cue(report.phase, report.lastResult?.outcome);
		}
	});
</script>

<section class="duck-controller">
	<div class="title">
		<div>
			<p class="eyebrow">MARSH ARCADE</p>
			<h2>Duck Hunt</h2>
			<p>Choose your moment. One shot, then reset and READY.</p>
		</div>
		<button class="btn" onclick={onExit}>Exit game</button>
	</div>
	<canvas
		bind:this={preview}
		width="1280"
		height="720"
		role="button"
		tabindex="0"
		aria-label="Duck Hunt laptop preview. Enable simulated shots, then click a duck body. Enter targets the first visible duck."
		onclick={click}
		onkeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				const box = report?.hitboxes.find((b) => b.x > 0 && b.x < 1280);
				simulatedShot(box, 'keyboard-preview');
			}
		}}
	></canvas>
	{#if !report}<p role="status">
			Open the projector display from the menu to load Duck Hunt. Camera hardware is optional for
			simulation.
		</p>{/if}
	<div class="checks">
		<label
			><input type="checkbox" bind:checked={simulate} /> Enable simulated shots in laptop preview</label
		><label
			><input type="checkbox" bind:checked={debug} /> Body hitboxes and scoring geometry · laptop only</label
		><label
			><input type="checkbox" checked={sound} onchange={toggleSound} /> Optional audio cues · laptop output</label
		>
	</div>
	{#if audioError}<p role="status">{audioError}</p>{/if}
	<p class="small">
		Click a duck’s body while it flies. Wings and empty sky miss. Enter simulates a body hit.
		Preview shots use the displayed snapshot timestamp and are labeled simulated. No game sessions
		are saved to laser statistics.
	</p>
	<div class="panel">
		<fieldset disabled={!!report && report.round > 0 && report.phase !== 'SESSION_COMPLETE'}>
			<legend>Session setup</legend>
			<label
				>Mode<select bind:value={mode}
					><option value="single">Single Duck</option><option value="choice"
						>Two-Duck Choice · one shot total</option
					></select
				></label
			>
			<label
				>Difficulty<select bind:value={difficulty}
					><option value="easy">Easy · larger and slower</option><option value="normal"
						>Normal · varied paths</option
					><option value="hard">Hard · smaller and faster</option></select
				></label
			>
			<label
				>Encounters<select bind:value={rounds}
					><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option
					></select
				></label
			>
		</fieldset>
		<p class="small">
			In choice mode the smaller duck moves faster and earns 50 bonus points. Only the struck duck
			scores. Settings apply on start, restart, or the first READY.
		</p>
		<div class="actions">
			<button
				class="btn btn-primary"
				disabled={!connected || !report || report.phase !== 'IDLE' || !validConfig(config)}
				onclick={() => command('start')}>Start Duck Hunt</button
			><button
				class="btn btn-primary"
				disabled={!connected ||
					!report ||
					report.paused ||
					!['WAITING_FOR_READY', 'ROUND_RESULTS'].includes(report.phase)}
				onclick={() => command('ready')}
				>{report?.phase === 'ROUND_RESULTS' ? 'Ready for next encounter' : 'I’m ready'}</button
			><button
				class="btn"
				disabled={!connected || !report || ['IDLE', 'SESSION_COMPLETE'].includes(report.phase)}
				onclick={() => command(report.paused ? 'resume' : 'pause')}
				>{report?.paused ? 'Resume' : 'Pause'}</button
			><button
				class="btn"
				disabled={!connected || !report || !validConfig(config)}
				onclick={() => command('restart')}>Restart session</button
			>
		</div>
		<p class="state" role="status">
			{report
				? report.paused
					? 'Paused'
					: report.phase.replaceAll('_', ' ').toLowerCase()
				: 'Waiting for projector'}{report?.settling ? ' · checking delayed shots' : ''}
		</p>
		{#if report}<div class="metrics">
				<span><strong>{report.score}</strong> points</span><span
					><strong>{report.hits}</strong> hits</span
				><span><strong>{report.misses}</strong> misses</span><span
					><strong>{report.escapes}</strong> escapes</span
				><span><strong>{report.accuracy}%</strong> hit rate</span>
			</div>{/if}
		{#if report?.lastResult}<p class="result">
				<strong>{report.lastResult.outcome} · +{report.lastResult.points}</strong> · {report
					.lastResult.source ?? 'No shot'}{report.lastResult.timeToShot === null
					? ''
					: ` · ${(report.lastResult.timeToShot / 1000).toFixed(2)} s to shot`}
			</p>{/if}
		{#if report?.phase === 'ROUND_RESULTS'}<p>
				Reset your training device, then confirm READY. The next encounter waits for you.
			</p>{/if}
		{#if report?.phase === 'SESSION_COMPLETE'}<p role="status">
				<strong>Session complete. {report.score} points.</strong> Change setup and restart when ready.
			</p>{/if}
	</div>
	{#if report}<details>
			<summary>Moving-target diagnostics</summary>
			<p class="small">
				Frame-observed time is when the laptop reads the video frame, not sensor exposure time.
				Unmeasured camera and projector buffering remains. Estimated times include those delays.
			</p>
			<pre>{JSON.stringify(
					{
						phase: report.phase,
						encounter: report.round,
						historySamples: report.historySamples,
						eventTimestamp: report.lastEvent?.detectedAt,
						timestampKind: report.lastEvent?.timestampKind,
						source: report.lastEvent?.source,
						camera: report.lastEvent?.camera,
						receiptTime: report.lastMapping?.receivedAt,
						receiptEpoch: report.lastMapping?.receivedEpoch,
						delayMs: report.lastTiming?.delay,
						scoringMethod: report.lastTiming?.method,
						scoringTime: report.lastTiming?.time,
						mapping: report.lastMapping,
						scoringGeometry: report.lastResult?.geometry,
						currentGeometry: report.hitboxes,
						canvas: report.canvas,
						viewport: report.viewport
					},
					null,
					2
				)}</pre>
		</details>{/if}
	{#if report?.results.length}<div class="results">
			<h3>Encounter results · {report.score} points</h3>
			<table>
				<thead
					><tr
						><th>#</th><th>Outcome</th><th>Target / mode</th><th>Time</th><th>Points</th><th
							>Source</th
						></tr
					></thead
				><tbody
					>{#each report.results as result (result.round)}<tr
							><td>{result.round}</td><td>{result.outcome}</td><td
								>{result.targetId ?? '—'} / {result.mode}</td
							><td
								>{result.timeToShot === null
									? '—'
									: `${(result.timeToShot / 1000).toFixed(2)} s`}</td
							><td>{result.points}</td><td>{result.source ?? 'No shot'}</td></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

<style>
	.duck-controller {
		margin-bottom: 32px;
	}
	.title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 18px;
	}
	h2 {
		font-size: 2.3rem;
		line-height: 1.1;
	}
	.eyebrow {
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		font-weight: 700;
	}
	p {
		color: #5b6d80;
		margin: 10px 0;
	}
	canvas {
		width: 100%;
		height: auto;
		display: block;
		image-rendering: pixelated;
		background: #181818;
		border: 2px solid #555;
		cursor: crosshair;
	}
	.checks {
		display: grid;
		gap: 8px;
		margin: 18px 0;
	}
	.checks label {
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 0.85rem;
	}
	.small {
		font-size: 0.8rem;
	}
	.panel {
		background: white;
		border: 1px solid #d9e1eb;
		padding: 20px;
		border-radius: 12px;
		margin: 20px 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
	}
	legend {
		font-weight: 700;
		margin-bottom: 12px;
	}
	fieldset label {
		display: grid;
		gap: 8px;
		flex: 1;
		min-width: 140px;
	}
	select {
		border: 1px solid #bfcbd9;
		border-radius: 5px;
		padding: 8px;
		width: 100%;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.state {
		font-weight: 600;
	}
	.metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 18px;
		padding: 14px 0;
		border-block: 1px solid #d9e1eb;
	}
	.metrics span {
		display: grid;
		font-size: 0.8rem;
	}
	.metrics strong {
		font-size: 1.4rem;
		color: #26374a;
	}
	.result {
		border-left: 3px solid #555;
		padding-left: 12px;
	}
	.results {
		overflow: auto;
		margin-top: 24px;
	}
	table {
		width: 100%;
		text-align: left;
		font-size: 0.8rem;
	}
	th,
	td {
		padding: 9px;
		border-bottom: 1px solid #d9e1eb;
	}
	pre {
		font-size: 0.75rem;
		max-height: 360px;
		overflow: auto;
		background: #f3f5f7;
		padding: 12px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
</style>
