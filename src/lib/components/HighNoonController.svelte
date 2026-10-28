<script>
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
	import { DEFAULT_CONFIG, validConfig } from '$lib/games/high-noon/model.js';
	import {
		createCowboySheet,
		prepareCowboySheet,
		grayscaleCanvas,
		paintPreview
	} from '$lib/games/high-noon/art.js';
	import { worldToProjector } from '$lib/games/coordinates.js';
	let { report = null, connected = false, compact = false, onCommand, onShot, onExit } = $props();
	let preview, background, sheet;
	let loaded = $state(false),
		drawTime = $state(DEFAULT_CONFIG.drawTime),
		rounds = $state(DEFAULT_CONFIG.rounds),
		simulate = $state(false),
		debug = $state(false);
	let config = $derived({ drawTime, rounds });
	function command(action) {
		onCommand(action, { config });
	}
	function simulateClick(event) {
		if (!simulate || !report) return;
		const r = preview.getBoundingClientRect();
		const world = {
			x: ((event.clientX - r.left) * 1280) / r.width,
			y: ((event.clientY - r.top) * 720) / r.height
		};
		const point = worldToProjector(world, report.viewport, report.canvas);
		onShot(point, { method: 'projector-preview' });
	}
	onMount(() => {
		let alive = true;
		const street = new Image(),
			cowboy = new Image();
		let remaining = 2;
		sheet = createCowboySheet();
		function finish() {
			if (alive && --remaining === 0) loaded = true;
		}
		street.onload = () => {
			if (alive) background = grayscaleCanvas(street);
			finish();
		};
		street.onerror = finish;
		cowboy.onload = () => {
			if (alive) sheet = prepareCowboySheet(cowboy);
			finish();
		};
		cowboy.onerror = finish;
		street.src = asset('/high-noon/street.png');
		cowboy.src = asset('/high-noon/cowboy-sheet.png');
		return () => {
			alive = false;
			street.onload = null;
			street.onerror = null;
			cowboy.onload = null;
			cowboy.onerror = null;
		};
	});
	$effect(() => {
		if (preview && report && loaded)
			paintPreview(preview.getContext('2d'), report, background, sheet, debug);
	});
</script>

<section class="high-noon-controller" class:compact>
	<div class="title">
		<div>
			<h2>High Noon</h2>
			<p>One signal. One shot. Reset, then face the next round.</p>
		</div>
		<button class="btn" onclick={onExit}>Exit game</button>
	</div>
	<div class="layout">
		<div>
			<canvas
				bind:this={preview}
				width="1280"
				height="720"
				role="button"
				tabindex="0"
				aria-label="High Noon laptop game preview. Enable simulation, then click a target region."
				onclick={simulateClick}
				onkeydown={(e) => {
					if (e.key === 'Enter' && simulate && report) {
						e.preventDefault();
						const box = report.hitboxes[0];
						onShot(
							worldToProjector(
								{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
								report.viewport,
								report.canvas
							),
							{ method: 'keyboard-preview' }
						);
					}
				}}
			></canvas>
			{#if !report}<p role="status">
					Open the projector display to load High Noon. Camera hardware is optional for simulation.
				</p>{/if}
			<label class="check"
				><input type="checkbox" bind:checked={simulate} /> Enable simulated game shots in this laptop
				preview</label
			>
			<label class="check"
				><input type="checkbox" bind:checked={debug} /> Show hitboxes on laptop only</label
			>
			<p class="small">
				Click the chest or hips after DRAW. Other locations miss. Enter sends a simulated torso
				shot. Simulated rounds are labeled and never saved as physical laser statistics.
			</p>
			{#if report}<details>
					<summary>Game diagnostics</summary>
					<dl>
						<dt>State / round</dt>
						<dd>{report.phase}{report.paused ? ' (paused)' : ''} / {report.round}</dd>
						<dt>Opponent / remaining</dt>
						<dd>
							{report.config.drawTime.toFixed(1)} s / {report.remaining === null
								? '—'
								: `${Math.ceil(report.remaining)} ms`}
						</dd>
						<dt>Phaser canvas (CSS pixels)</dt>
						<dd>
							{Math.round(report.canvas.width)} × {Math.round(report.canvas.height)} at {Math.round(
								report.canvas.left
							)}, {Math.round(report.canvas.top)}
						</dd>
						<dt>Last shot source</dt>
						<dd>{report.lastEvent?.source ?? '—'} {report.lastEvent?.camera?.deviceId ?? ''}</dd>
						<dt>Projector coordinate</dt>
						<dd>
							{report.lastMapping
								? `${report.lastMapping.normalized.x.toFixed(4)}, ${report.lastMapping.normalized.y.toFixed(4)}`
								: '—'}
						</dd>
						<dt>World coordinate</dt>
						<dd>
							{report.lastMapping?.world
								? `${report.lastMapping.world.x.toFixed(1)}, ${report.lastMapping.world.y.toFixed(1)}`
								: '—'}
						</dd>
						<dt>Accepted / region</dt>
						<dd>
							{report.lastMapping?.accepted ? 'Yes' : 'No'} / {report.lastResult?.region ?? '—'}
						</dd>
						<dt>Active world hitboxes</dt>
						<dd>
							{report.hitboxes
								.map(
									(b) =>
										`${b.region}: ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`
								)
								.join('; ')}
						</dd>
					</dl>
				</details>{/if}
		</div>
		<div class="panel">
			<h3>Quick draw session</h3>
			<fieldset disabled={!!report && report.round > 0 && report.phase !== 'SESSION_COMPLETE'}>
				<label
					>Opponent draw time: {Number(drawTime).toFixed(1)} s<input
						type="range"
						min="0.3"
						max="2"
						step="0.1"
						bind:value={drawTime}
					/></label
				>
				<label
					>Rounds (1–50)<input type="number" min="1" max="50" step="1" bind:value={rounds} /></label
				>
			</fieldset>
			<p class="small">
				Try 1.5 s while testing a webcam. Changes apply when starting or restarting a session.
			</p>
			<div class="actions">
				<button
					class="btn btn-primary"
					disabled={!connected || !report || report.phase !== 'IDLE' || !validConfig(config)}
					onclick={() => command('start')}>Start High Noon</button
				>
				<button
					class="btn btn-primary"
					disabled={!report ||
						report.paused ||
						!['WAITING_FOR_READY', 'ROUND_RESULTS'].includes(report.phase)}
					onclick={() => command('ready')}
					>{report?.phase === 'ROUND_RESULTS' ? 'Ready for next round' : 'I’m ready'}</button
				>
				<button
					class="btn"
					disabled={!connected || !report || ['IDLE', 'SESSION_COMPLETE'].includes(report.phase)}
					onclick={() => command(report.paused ? 'resume' : 'pause')}
					>{report?.paused ? 'Resume' : 'Pause'}</button
				>
				<button
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
					: 'Waiting for projector'}
			</p>
			{#if report?.lastResult}<p class="result">
					<strong
						>{report.lastResult.win
							? 'You won'
							: report.lastResult.falseStart
								? 'False start'
								: report.lastResult.outcome === 'PLAYER_MISSED'
									? 'Miss'
									: 'Opponent fired'}</strong
					><br />{report.lastResult.points} points · {report.lastResult.region || 'No hit'} · {report
						.lastResult.reactionTime === null
						? 'No reaction recorded'
						: `${(report.lastResult.reactionTime / 1000).toFixed(2)} s reaction`}
				</p>{/if}
			{#if report?.phase === 'ROUND_RESULTS'}<p>
					Reset your training device, then confirm readiness. The next round waits for you.
				</p>{/if}
			{#if report?.phase === 'SESSION_COMPLETE'}<p role="status">
					<strong>Session complete. {report.score} points.</strong> Restart when you’re ready.
				</p>{/if}
			<p class="small">
				Reaction estimates include camera exposure, processing, and local message delivery. They are
				not millisecond-accurate measurements.
			</p>
		</div>
	</div>
	{#if report?.results.length}<div class="results">
			<h3>Round results · Total {report.score}</h3>
			<table>
				<thead
					><tr
						><th>Round</th><th>Outcome</th><th>Region</th><th>Reaction</th><th>Opponent</th><th
							>Points</th
						><th>Source</th></tr
					></thead
				><tbody
					>{#each report.results as result (result.round)}<tr
							><td>{result.round}</td><td>{result.outcome.replaceAll('_', ' ').toLowerCase()}</td
							><td>{result.region || '—'}</td><td
								>{result.reactionTime === null
									? '—'
									: `${(result.reactionTime / 1000).toFixed(2)} s`}</td
							><td>{result.opponentDrawTime.toFixed(1)} s</td><td>{result.points}</td><td
								>{result.source || 'No shot'}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

<style>
	.high-noon-controller {
		margin-bottom: 32px;
	}
	.compact .layout {
		grid-template-columns: 1fr;
	}
	.title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		margin-bottom: 18px;
	}
	h2 {
		font-size: 2.2rem;
	}
	h3 {
		font-size: 1.5rem;
		margin-bottom: 16px;
	}
	p {
		color: #5b6d80;
		margin: 10px 0;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
		gap: 24px;
		align-items: start;
	}
	canvas {
		width: 100%;
		height: auto;
		display: block;
		image-rendering: pixelated;
		background: #171717;
		border: 0;
		outline: 2px solid #454545;
		cursor: crosshair;
	}
	.panel {
		padding: 22px;
		background: white;
		border: 1px solid #d9e1eb;
		border-radius: 12px;
	}
	fieldset {
		padding: 0;
		border: 0;
	}
	label {
		display: grid;
		gap: 10px;
		margin: 15px 0;
	}
	input[type='range'] {
		width: 100%;
	}
	input[type='number'] {
		border: 1px solid #bfcbd9;
		padding: 8px;
		border-radius: 5px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.small {
		font-size: 0.8rem;
	}
	.state {
		font-weight: 600;
		font-size: 1rem;
	}
	.result {
		border-left: 3px solid #315de3;
		padding-left: 12px;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1.3fr;
		gap: 8px;
		font-size: 0.8rem;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.results {
		overflow: auto;
		margin-top: 24px;
	}
	table {
		width: 100%;
		text-align: left;
		font-size: 0.85rem;
	}
	td,
	th {
		padding: 10px;
		border-bottom: 1px solid #d9e1eb;
	}
	@media (max-width: 850px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
