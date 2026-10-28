<script>
	import { onMount } from 'svelte';
	import ProjectorGameHost from '$lib/components/ProjectorGameHost.svelte';
	import { CORNERS, AREA, DEFAULT_TARGET, targetGeometry } from '$lib/projector/geometry.js';
	import { emptySession, accuracy } from '$lib/projector/session.js';
	import { channelName, envelope, isMessage, validDisplayState } from '$lib/projector/protocol.js';
	let host = $state();
	let activeChannel, controllerId;
	function gameReport(report) {
		activeChannel?.postMessage(envelope(controllerId, 'game-report', { report }));
	}
	let viewport = $state({ width: 1280, height: 720, dpr: 1 });
	let state = $state({ target: DEFAULT_TARGET, session: emptySession(), calibrating: false });
	let connected = $state(false);
	let fullscreen = $state(false);
	let error = $state('');
	let geometry = $derived(targetGeometry(state.target, viewport));
	onMount(() => {
		const id = new URL(location.href).searchParams.get('id');
		if (!id || !('BroadcastChannel' in window)) {
			error = 'Open this display from Projector Mode in the controller.';
			return;
		}
		const channel = new BroadcastChannel(channelName(id));
		activeChannel = channel;
		controllerId = id;
		let lastState = 0;
		function ready() {
			viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
			channel.postMessage(envelope(id, 'ready', { viewport: $state.snapshot(viewport) }));
			connected = Date.now() - lastState < 10000;
		}
		channel.onmessage = ({ data }) => {
			if (isMessage(data, id, 'state') && validDisplayState(data.state)) {
				state = data.state;
				lastState = Date.now();
				connected = true;
			}
			if (
				isMessage(data, id, 'game-command') &&
				['high-noon', 'duck-hunt'].includes(state.activity)
			)
				host?.command(data.command);
			if (isMessage(data, id, 'disconnect')) {
				lastState = 0;
				connected = false;
			}
		};
		function fsChange() {
			fullscreen = !!document.fullscreenElement;
			ready();
		}
		function goodbye() {
			channel.postMessage(envelope(id, 'closed'));
		}
		window.addEventListener('resize', ready);
		window.addEventListener('pagehide', goodbye);
		document.addEventListener('fullscreenchange', fsChange);
		ready();
		const timer = setInterval(ready, 1000);
		return () => {
			goodbye();
			clearInterval(timer);
			channel.close();
			window.removeEventListener('resize', ready);
			window.removeEventListener('pagehide', goodbye);
			document.removeEventListener('fullscreenchange', fsChange);
		};
	});
	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			error = 'Fullscreen unavailable. Use your browser’s fullscreen command.';
		}
	}
</script>

<svelte:head><title>Projector display | Dry-Fire Trainer</title></svelte:head>
<div class="projection">
	{#if ['high-noon', 'duck-hunt'].includes(state.activity) && connected}
		<div class="game-layer" style:visibility={state.calibrating ? 'hidden' : 'visible'}>
			{#key state.activity}<ProjectorGameHost
					activity={state.activity}
					bind:this={host}
					onReport={gameReport}
					onError={(message) => (error = message)}
				/>{/key}
		</div>
	{/if}
	{#if !['high-noon', 'duck-hunt'].includes(state.activity) || state.calibrating || !connected}<div
			class="hud"
		>
			<strong
				>{connected
					? state.calibrating
						? 'CALIBRATION'
						: state.session.status.toUpperCase()
					: 'CONTROLLER DISCONNECTED'}</strong
			>
			<span>Shots {state.session.shots}</span><span>Hits {state.session.hits}</span>
			<span>Accuracy {accuracy(state.session)}%</span><span
				>Last score {state.session.lastScore ?? '—'}</span
			>
			{#if state.session.simulated}<span>Includes {state.session.simulated} simulated</span>{/if}
		</div>
	{/if}
	<svg
		class:inactive={['high-noon', 'duck-hunt'].includes(state.activity) &&
			!state.calibrating &&
			connected}
		viewBox={`0 0 ${viewport.width} ${viewport.height}`}
		aria-label="Projected training target"
	>
		{#if connected && state.calibrating}
			<rect
				x={AREA.x * viewport.width}
				y={AREA.y * viewport.height}
				width={AREA.width * viewport.width}
				height={AREA.height * viewport.height}
				fill="none"
				stroke="#888"
				stroke-dasharray="8 8"
			/>
			{#each CORNERS as p, i (i)}
				<g transform={`translate(${p.x * viewport.width} ${p.y * viewport.height})`}>
					<path d="M -14 0 H 14 M 0 -14 V 14" stroke="white" stroke-width="3" />
					<text
						x={i === 1 || i === 2 ? -22 : 22}
						y={i < 2 ? 30 : -22}
						text-anchor={i === 1 || i === 2 ? 'end' : 'start'}
						fill="white"
						font-size="22">{i + 1}</text
					>
				</g>
			{/each}
		{:else if connected && !['high-noon', 'duck-hunt'].includes(state.activity)}
			{#each Array.from({ length: 10 }, (_, i) => 10 - i) as ring (ring)}
				<circle
					cx={geometry.x * viewport.width}
					cy={geometry.y * viewport.height}
					r={(geometry.rx * viewport.width * ring) / 10}
					fill={ring % 2 ? '#242424' : '#d8d8d8'}
					stroke="#aaa"
					stroke-width="1"
				/>
			{/each}
		{/if}
	</svg>
	<footer
		class:game-footer={['high-noon', 'duck-hunt'].includes(state.activity) &&
			!state.calibrating &&
			connected}
	>
		<span
			>{error ||
				(state.calibrating
					? 'Click crosshair centers 1 → 2 → 3 → 4 in the laptop camera preview.'
					: 'Dry-Fire Trainer · Projector Mode')}</span
		><button onclick={toggleFullscreen}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
	</footer>
</div>

<style>
	.game-layer {
		position: absolute;
		inset: 0;
	}
	.inactive {
		display: none;
	}
	footer.game-footer {
		left: auto;
		right: 10px;
		bottom: 7px;
		font-size: 10px;
	}
	footer.game-footer span {
		display: none;
	}
	.projection {
		position: fixed;
		inset: 0;
		background: #080808;
		color: #eee;
		font-family: sans-serif;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.hud {
		position: absolute;
		z-index: 1;
		top: 3%;
		left: 5%;
		right: 5%;
		display: flex;
		flex-wrap: wrap;
		gap: 1.5vw;
		font-size: clamp(11px, 1.4vw, 24px);
	}
	footer {
		position: absolute;
		z-index: 1;
		bottom: 1%;
		left: 5%;
		right: 5%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		font-size: clamp(10px, 1vw, 16px);
	}
	button {
		border: 1px solid #777;
		border-radius: 4px;
		padding: 4px 10px;
		color: white;
	}
</style>
