<script>
	import { onMount } from 'svelte';
	import HighNoonController from '$lib/components/HighNoonController.svelte';
	import { shotEvent } from '$lib/games/coordinates.js';
	import { validGameReport } from '$lib/games/protocol.js';
	import { isMessage } from '$lib/projector/protocol.js';
	import {
		createCameraLease,
		restoreCalibration,
		clearStoredCalibration,
		CALIBRATION_STORAGE_KEY
	} from '$lib/projector/lifecycle.js';
	import { resolve } from '$app/paths';
	import { detectLaserDots } from '$lib/utils/detection.js';
	import {
		DEFAULT_TARGET,
		homography,
		previewPoint,
		evaluateCameraPoint
	} from '$lib/projector/geometry.js';
	import {
		emptySession,
		recordShot,
		accuracy,
		createTemporalFilter,
		validSettings
	} from '$lib/projector/session.js';
	import {
		channelName,
		envelope,
		createDisplayConnection,
		CONNECTION_TIMEOUT_MS,
		geometryKey
	} from '$lib/projector/protocol.js';

	let video, canvas;
	let activity = $state('target'),
		gameReport = $state(null);
	let gameLive = $derived(
		activity === 'high-noon' &&
			gameReport &&
			!gameReport.paused &&
			['READY_DELAY', 'DRAWING'].includes(gameReport.phase)
	);
	let cameras = $state([]),
		selectedCamera = $state(''),
		activeCamera = $state('');
	let streaming = $state(false),
		starting = $state(false),
		error = $state('');
	let width = $state(640),
		height = $state(480);
	let viewport = $state(null),
		connected = $state(false),
		supported = $state(true);
	let calibrating = $state(false),
		points = $state([]),
		calibration = $state(null);
	let simulation = $state(false),
		countSimulation = $state(false),
		synthetic = $state(false);
	let session = $state(emptySession()),
		target = $state({ ...DEFAULT_TARGET });
	let settings = $state({
		color: 'red',
		brightness: 150,
		dominance: 30,
		minSize: 2,
		maxSize: 150,
		confirmationFrames: 1,
		cooldown: 250
	});
	let diagnostics = $state({
		fps: 0,
		candidates: 0,
		accepted: 0,
		lastRaw: null,
		lastPoint: null,
		lastTime: null,
		blob: null,
		simulated: null
	});
	const labels = ['top-left (1)', 'top-right (2)', 'bottom-right (3)', 'bottom-left (4)'];
	const storageKey = CALIBRATION_STORAGE_KEY;
	const cameraLease = createCameraLease();
	const filter = createTemporalFilter();
	let id = $state('');
	let connection;
	let channel,
		projectorWindow,
		frame,
		alive = false;
	let openedAt = 0;
	let lastFrame = 0,
		reportTime = 0,
		frameCount = 0,
		candidatesCount = 0,
		accepted = 0;
	let lastRaw = null,
		lastPoint = null,
		lastTime = null,
		lastBlob = null;
	let currentKey = '',
		cursor = { x: 320, y: 240 };
	let cameraLabel = $derived(
		cameras.find((camera) => camera.deviceId === activeCamera)?.label ||
			(synthetic ? 'Synthetic camera (simulation only)' : activeCamera || 'None')
	);
	let canStart = $derived(
		connected && calibration && (streaming || synthetic) && validSettings(settings)
	);

	function sendState() {
		channel?.postMessage(
			envelope(id, 'state', {
				state: {
					session: $state.snapshot(session),
					target: $state.snapshot(target),
					calibrating,
					activity
				}
			})
		);
	}
	$effect(() => {
		session;
		target.x;
		target.y;
		target.size;
		calibrating;
		activity;
		sendState();
	});

	function gameCommand(action, payload = {}) {
		if (!connected || activity !== 'high-noon' || !gameReport) return;
		channel?.postMessage(
			envelope(id, 'game-command', {
				command: {
					id: crypto.randomUUID(),
					gameId: gameReport.gameId,
					action,
					...$state.snapshot(payload)
				}
			})
		);
	}
	function changeActivity(next) {
		pause();
		activity = next;
		gameReport = null;
		filter.reset();
	}
	function routeGameShot(point, source, metadata = {}) {
		if (!connected || !gameReport) return;
		gameCommand('shot', { shot: shotEvent(point, source, metadata) });
	}
	function pause() {
		if (activity === 'high-noon') gameCommand('pause');
		if (session.status === 'running') session = { ...session, status: 'paused' };
		filter.reset();
	}
	function invalidate(message = '') {
		pause();
		calibration = null;
		points = [];
		calibrating = false;
		if (message) error = message;
	}
	function calibrationStorage() {
		try {
			return localStorage;
		} catch {
			return null;
		}
	}
	function forgetStoredCalibration() {
		if (!synthetic) clearStoredCalibration(calibrationStorage());
	}
	function checkGeometry() {
		if (!viewport || (!streaming && !synthetic)) return;
		const key = geometryKey(activeCamera, width, height, viewport);
		if (key === currentKey) return;
		const hadGeometry = !!currentKey;
		currentKey = key;
		invalidate(
			hadGeometry ? 'Camera or projector geometry changed. Recalibrate before continuing.' : ''
		);
		if (hadGeometry) forgetStoredCalibration();
		else if (!synthetic) {
			calibration = restoreCalibration(calibrationStorage(), key, width, height);
			if (calibration) points = calibration.points;
		}
	}
	function openProjector() {
		if (!supported) return;
		if (projectorWindow && !projectorWindow.closed) {
			projectorWindow.focus();
			return;
		}
		invalidate();
		viewport = null;
		currentKey = '';
		connected = false;
		openedAt = Date.now();
		projectorWindow = window.open(
			`${resolve('/projector/display')}?id=${encodeURIComponent(id)}`,
			`projector-${id}`,
			'popup,width=1100,height=760'
		);
		if (!projectorWindow)
			error = 'The projector popup was blocked. Allow popups for this site, then open it again.';
		else error = 'Move the new window to the projector, enter fullscreen, then calibrate.';
	}
	async function enumerate() {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			if (alive) cameras = devices.filter((device) => device.kind === 'videoinput');
		} catch {
			if (alive) error = 'Could not list cameras. Check browser camera permissions.';
		}
	}
	function stopCamera() {
		cameraLease.stop();
		starting = false;
		cancelAnimationFrame(frame);

		if (video) video.srcObject = null;
		streaming = false;
		synthetic = false;
		activeCamera = '';
		currentKey = '';
		invalidate();
	}
	async function startCamera() {
		stopCamera();
		error = '';
		starting = true;
		const request = cameraLease.generation;
		try {
			if (!navigator.mediaDevices?.getUserMedia)
				throw new Error(
					'Camera capture requires HTTPS or localhost and a browser with camera support.'
				);
			const next = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					...(selectedCamera ? { deviceId: { exact: selectedCamera } } : {}),
					width: { ideal: 640 },
					height: { ideal: 480 },
					frameRate: { ideal: 30, max: 30 }
				}
			});
			if (!cameraLease.attach(request, next)) return;
			video.srcObject = next;
			await video.play();
			if (!alive || !cameraLease.current(request)) return;
			activeCamera = next.getVideoTracks()[0].getSettings().deviceId || selectedCamera;
			selectedCamera = activeCamera;
			width = video.videoWidth;
			height = video.videoHeight;
			next.getVideoTracks()[0].onended = () => {
				stopCamera();
				error = 'Camera disconnected. Reconnect it and enable the camera again.';
			};
			streaming = true;
			await enumerate();
			if (!alive || !cameraLease.current(request)) return;
			checkGeometry();
			beginFrames();
		} catch (cause) {
			if (!alive || !cameraLease.current(request)) return;
			stopCamera();
			error =
				cause.name === 'NotAllowedError'
					? 'Camera permission denied. Allow camera access in browser settings, then try again.'
					: cause.name === 'NotFoundError' || cause.name === 'OverconstrainedError'
						? 'Selected camera is unavailable. Connect a camera or select another device.'
						: cause.message || 'Could not start camera. Close other apps using it and retry.';
		} finally {
			if (cameraLease.current(request)) starting = false;
		}
	}
	function useSynthetic() {
		stopCamera();
		simulation = true;
		synthetic = true;
		activeCamera = 'simulation';
		width = 640;
		height = 480;
		error =
			'Synthetic camera: calibrate a quadrilateral in the preview, then click to test scoring. No laser detection is performed.';
		checkGeometry();
		beginFrames();
	}
	function beginCalibration() {
		pause();
		error = '';
		calibration = null;
		points = [];
		calibrating = true;
		forgetStoredCalibration();
	}
	function selectPoint(raw) {
		if (calibrating) {
			const next = [...points, { x: raw.x / width, y: raw.y / height }];
			points = next;
			if (next.length === 4) {
				try {
					const matrix = homography(next);
					calibration = { matrix, points: next, width, height };
					calibrating = false;
					error = '';
					if (!synthetic) {
						try {
							localStorage.setItem(storageKey, JSON.stringify({ key: currentKey, points: next }));
						} catch {
							error =
								'Calibration ready. Local storage is unavailable, so it will not be remembered.';
						}
					}
				} catch (cause) {
					error = cause.message;
					points = next.slice(0, 3);
				}
			}
		} else if (simulation) processPoint(raw, true);
	}
	function clickPreview(event) {
		const raw = previewPoint(
			event.clientX,
			event.clientY,
			canvas.getBoundingClientRect(),
			width,
			height
		);
		if (raw) selectPoint(raw);
	}
	function keyboardPreview(event) {
		const shifts = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
		if (shifts[event.key]) {
			event.preventDefault();
			const [dx, dy] = shifts[event.key];
			cursor = {
				x: Math.max(0, Math.min(width, cursor.x + dx)),
				y: Math.max(0, Math.min(height, cursor.y + dy))
			};
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectPoint(cursor);
		}
	}
	function processPoint(raw, simulated = false) {
		if (!calibration || !connected || !viewport || calibrating) return;
		const result = evaluateCameraPoint(raw, calibration, target, viewport);
		lastRaw = raw;
		lastPoint = result?.point ?? null;
		lastTime = new Date().toISOString();
		if (simulated)
			diagnostics = {
				...diagnostics,
				simulated: result
					? activity === 'high-noon'
						? `Mapped ${result.point.x.toFixed(3)}, ${result.point.y.toFixed(3)} to High Noon. See game results above.`
						: `Score ${result.score} at ${result.point.x.toFixed(3)}, ${result.point.y.toFixed(3)}`
					: 'Outside calibrated region — ignored'
			};
		if (activity === 'high-noon') {
			if (result)
				routeGameShot(result.point, simulated ? 'simulated' : 'laser', {
					camera: { deviceId: activeCamera, width, height, raw: { x: raw.x, y: raw.y } },
					method: 'camera'
				});
			return;
		}
		if (!result || session.status !== 'running' || (simulated && !countSimulation)) return;
		session = recordShot(session, result, simulated);
		accepted++;
	}
	function reset() {
		session = emptySession();
		filter.reset();
		candidatesCount = 0;
		accepted = 0;
		lastRaw = lastPoint = lastTime = lastBlob = null;
		diagnostics = {
			...diagnostics,
			candidates: 0,
			accepted: 0,
			lastRaw: null,
			lastPoint: null,
			lastTime: null,
			blob: null,
			simulated: null
		};
	}
	function beginFrames() {
		lastFrame = 0;
		reportTime = performance.now();
		frameCount = 0;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(processFrame);
	}
	function processFrame(now) {
		if (!alive || (!streaming && !synthetic)) return;
		frame = requestAnimationFrame(processFrame);
		if (now - lastFrame < 33 || (streaming && video.readyState < 2)) return;
		lastFrame = now;
		if (streaming && (width !== video.videoWidth || height !== video.videoHeight)) {
			width = video.videoWidth;
			height = video.videoHeight;
			checkGeometry();
		}
		if (!width || !height) return;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		const context = canvas.getContext('2d', { willReadFrequently: true });
		let candidates = [];
		if (streaming) {
			context.drawImage(video, 0, 0, width, height);
			if (
				!simulation &&
				!calibrating &&
				connected &&
				calibration &&
				validSettings(settings) &&
				(activity === 'high-noon' ? gameLive : session.status === 'running')
			) {
				const pixels = context.getImageData(0, 0, width, height).data;
				candidates = detectLaserDots(pixels, width, height, false, null, 100, null, settings);
				candidatesCount += candidates.length;
				// Discard candidates outside calibration before temporal filtering.
				const usable = candidates.filter((p) =>
					evaluateCameraPoint(p, calibration, target, viewport)
				);
				const pulse = filter.update(usable, now, settings);
				if (pulse) {
					lastBlob = pulse.size;
					processPoint(pulse);
				}
			} else filter.reset();
		} else {
			context.fillStyle = '#152335';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#b4c5db';
			context.font = '18px sans-serif';
			context.fillText('SIMULATION · synthetic camera', 25, 35);
			context.strokeStyle = '#465a72';
			for (let x = 80; x < width; x += 80) {
				context.beginPath();
				context.moveTo(x, 60);
				context.lineTo(x, height);
				context.stroke();
			}
			for (let y = 80; y < height; y += 80) {
				context.beginPath();
				context.moveTo(0, y);
				context.lineTo(width, y);
				context.stroke();
			}
		}
		const boundary = calibration?.points || points;
		if (boundary.length) {
			context.strokeStyle = '#77d9ff';
			context.lineWidth = 2;
			context.beginPath();
			boundary.forEach((p, i) => {
				if (!i) context.moveTo(p.x * width, p.y * height);
				else context.lineTo(p.x * width, p.y * height);
			});
			if (boundary.length === 4) context.closePath();
			context.stroke();
			boundary.forEach((p, i) => {
				context.fillStyle = '#fff';
				context.font = '18px sans-serif';
				context.fillText(String(i + 1), p.x * width + 6, p.y * height - 6);
				context.fillRect(p.x * width - 3, p.y * height - 3, 6, 6);
			});
		}
		for (const p of candidates) {
			context.strokeStyle = '#ffcc66';
			context.beginPath();
			context.arc(p.x, p.y, 8, 0, Math.PI * 2);
			context.stroke();
		}
		if (calibrating || simulation) {
			context.strokeStyle = '#fff';
			context.strokeRect(cursor.x - 5, cursor.y - 5, 10, 10);
		}
		frameCount++;
		if (now - reportTime >= 500) {
			diagnostics = {
				...diagnostics,
				fps: Math.round((frameCount * 1000) / (now - reportTime)),
				candidates: candidatesCount,
				accepted,
				lastRaw,
				lastPoint,
				lastTime,
				blob: lastBlob
			};
			frameCount = 0;
			reportTime = now;
		}
	}
	onMount(() => {
		alive = true;
		id = crypto.randomUUID();
		supported = 'BroadcastChannel' in window;
		if (!supported)
			error =
				'This browser does not support local projector synchronization. Use a current desktop browser.';
		if (supported) {
			channel = new BroadcastChannel(channelName(id));
			connection = createDisplayConnection(id);
			channel.onmessage = ({ data }) => {
				if (
					isMessage(data, id, 'game-report') &&
					activity === 'high-noon' &&
					validGameReport(data.report)
				) {
					if (
						data.report.lastMapping?.accepted &&
						data.report.lastEvent?.method === 'camera' &&
						data.report.lastEvent.id !== gameReport?.lastEvent?.id
					)
						accepted++;
					gameReport = data.report;
					return;
				}
				const message = connection.receive(data);
				if (message?.type === 'ready') {
					openedAt = 0;
					connected = true;
					viewport = message.viewport;
					checkGeometry();
					sendState();
				} else if (message?.type === 'closed') {
					connected = false;
					invalidate('Projector closed. Open it again and recalibrate.');
					forgetStoredCalibration();
				}
			};
		}
		const monitor = setInterval(() => {
			if (openedAt && !connected && Date.now() - openedAt >= CONNECTION_TIMEOUT_MS) {
				openedAt = 0;
				error =
					'The display has not connected. This browser may not support popup windows. Use the display tab link below, or open the app in a desktop browser.';
			}
			if (connected && (projectorWindow?.closed || connection?.expired())) {
				connected = false;
				invalidate('Projector disconnected. Reopen or restore the display, then recalibrate.');
				forgetStoredCalibration();
			}
		}, 1000);
		navigator.mediaDevices?.addEventListener('devicechange', enumerate);
		return () => {
			alive = false;
			stopCamera();
			clearInterval(monitor);
			navigator.mediaDevices?.removeEventListener('devicechange', enumerate);
			channel?.postMessage(envelope(id, 'disconnect'));
			channel?.close();
			projectorWindow?.close();
		};
	});
</script>

<section class="projector-controller">
	<div class="heading">
		<div>
			<h1>Projector Mode</h1>
			<p>One laptop, one webcam, one projected target. Everything runs locally.</p>
		</div>
		<span class="status">{connected ? 'Projector connected' : 'Projector offline'}</span>
	</div>
	<p class="instructions">
		Connect your projector as an extended display. Open the display window, move it to the
		projector, and enter fullscreen before calibrating. Keep the camera and projector still.
	</p>
	{#if error}<p class="notice" role="status">{error}</p>{/if}

	<div class="workspace" class:game-layout={activity === 'high-noon'}>
		<div class="preview-column">
			{#if activity === 'high-noon'}<HighNoonController
					compact
					report={gameReport}
					{connected}
					onCommand={gameCommand}
					onShot={(point, metadata) => routeGameShot(point, 'simulated', metadata)}
					onExit={() => changeActivity('target')}
				/>{/if}
			<video bind:this={video} autoplay muted playsinline aria-label="Camera source" hidden></video>
			<canvas
				bind:this={canvas}
				width={640}
				height={480}
				role="button"
				tabindex="0"
				aria-label="Camera preview. Click to calibrate or simulate. Arrow keys move cursor, Enter selects."
				onclick={clickPreview}
				onkeydown={keyboardPreview}
			></canvas>
			<p class="preview-note">
				{calibrating
					? `Select ${labels[points.length]} crosshair center in the live camera image.`
					: calibration
						? 'Calibrated region outlined in blue.'
						: 'Enable a camera, then calibrate the four projected crosshairs.'} Arrow keys move the cursor;
				Enter selects.
			</p>
			{#if activity === 'target'}<div class="stats">
					<span><strong>{session.shots}</strong> shots</span><span
						><strong>{session.hits}</strong> hits</span
					><span><strong>{accuracy(session)}%</strong> accuracy</span><span
						><strong>{session.lastScore ?? '—'}</strong> last score</span
					>
				</div>
				<p>
					Session: {session.status} · Total score: {session.score}{session.simulated
						? ` · Includes ${session.simulated} simulated shots`
						: ''}
				</p>
			{:else}<p>Camera input feeds High Noon. Game results appear above.</p>{/if}
			<details open>
				<summary>Diagnostics</summary>
				<dl>
					<dt>Camera</dt>
					<dd>{cameraLabel}</dd>
					<dt>Sensor / processing</dt>
					<dd>{width} × {height} · {diagnostics.fps} FPS</dd>
					<dt>Projector viewport</dt>
					<dd>
						{viewport
							? `${viewport.width} × ${viewport.height} · DPR ${viewport.dpr}`
							: 'Waiting for display'}
					</dd>
					<dt>Calibration</dt>
					<dd>{calibration ? 'Ready' : calibrating ? `${points.length}/4 points` : 'Required'}</dd>
					<dt>Detection</dt>
					<dd>
						{simulation || synthetic
							? 'Simulation — laser processing disabled'
							: (activity === 'high-noon' ? gameLive : session.status === 'running') &&
								  connected &&
								  calibration
								? 'Active · red or green laser'
								: 'Inactive'}
					</dd>
					<dt>Candidate blobs / accepted shots</dt>
					<dd>{diagnostics.candidates} / {diagnostics.accepted}</dd>
					<dt>Last raw camera point</dt>
					<dd>
						{diagnostics.lastRaw ? `${diagnostics.lastRaw.x}, ${diagnostics.lastRaw.y}` : '—'}
					</dd>
					<dt>Last projector point</dt>
					<dd>
						{diagnostics.lastPoint
							? `${diagnostics.lastPoint.x.toFixed(4)}, ${diagnostics.lastPoint.y.toFixed(4)}`
							: '—'}
					</dd>
					<dt>Last detection timestamp</dt>
					<dd>{diagnostics.lastTime || '—'}</dd>
					<dt>Last accepted blob size</dt>
					<dd>{diagnostics.blob ?? '—'} pixels</dd>
				</dl>
				<p class="small">
					Candidates use the configured brightness, color dominance, and blob size limits. Yellow
					circles show candidates on this preview only. FPS measures processed frames, including
					detection and overlays.
				</p>
			</details>
		</div>
		<div class="controls">
			<section>
				<h2>1. Projector display</h2>
				<label class="activity-picker"
					>Projected activity<select
						value={activity}
						onchange={(event) => changeActivity(event.target.value)}
						><option value="target">Static bullseye</option><option value="high-noon"
							>High Noon · Quick draw</option
						></select
					></label
				>
				<button class="btn btn-primary" disabled={!supported} onclick={openProjector}
					>Open projector window</button
				>
				{#if supported && id}<p class="small">
						<a
							href={resolve(`/projector/display?id=${encodeURIComponent(id)}`)}
							target="_blank"
							rel="opener">Open display in a browser tab</a
						> if popups are unavailable. Drag that tab into a separate window.
					</p>{/if}
				<p class="small">
					Use Fullscreen in the display window. Resizing or changing camera geometry requires
					calibration again.
				</p>
			</section>
			<section>
				<h2>2. Camera</h2>
				<label
					>Camera<select
						bind:value={selectedCamera}
						disabled={starting || !cameras.length}
						onchange={startCamera}
						><option value="">Default camera</option
						>{#each cameras as camera, i (camera.deviceId)}<option value={camera.deviceId}
								>{camera.label || `Camera ${i + 1}`}</option
							>{/each}</select
					></label
				>
				<div class="actions">
					<button class="btn" disabled={starting} onclick={startCamera}
						>{starting ? 'Connecting…' : 'Enable camera'}</button
					><button class="btn" disabled={!streaming && !synthetic && !starting} onclick={stopCamera}
						>Stop camera</button
					>
				</div>
				<p class="small">
					Grant permission to list available cameras. Capture prefers 640 × 480 at 30 FPS.
				</p>
			</section>
			<section>
				<h2>3. Calibrate projection</h2>
				<button
					class="btn"
					disabled={!connected || (!streaming && !synthetic)}
					onclick={beginCalibration}
					>{calibration ? 'Recalibrate' : 'Show calibration pattern'}</button
				>
				{#if calibrating}<div class="actions">
						<button
							class="btn"
							disabled={!points.length}
							onclick={() => (points = points.slice(0, -1))}>Undo corner</button
						><button class="btn" onclick={() => invalidate()}>Cancel</button>
					</div>{/if}
				<p class="small">
					Click crosshair centers 1 → 2 → 3 → 4 in the camera preview, clockwise from top-left.
					Calibration is remembered for this camera and display geometry. Recalibrate after
					physically moving either device.
				</p>
			</section>
			{#if activity === 'target'}<section>
					<h2>4. Training session</h2>
					<div class="actions">
						<button
							class="btn btn-primary"
							disabled={!canStart || session.status === 'running'}
							onclick={() => {
								filter.reset();
								session = { ...session, status: 'running' };
							}}>Start / resume</button
						><button class="btn" disabled={session.status !== 'running'} onclick={pause}
							>Pause</button
						><button class="btn" onclick={reset}>Reset results</button>
					</div>
					<fieldset disabled={session.status === 'running'}>
						<legend>Target</legend>
						<label
							>Size ({Math.round(target.size * 100)}% radius of usable short edge)<input
								type="range"
								min="0.1"
								max="0.4"
								step="0.01"
								bind:value={target.size}
							/></label
						>
						<label
							>Horizontal position<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={target.x}
							/></label
						>
						<label
							>Vertical position<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								bind:value={target.y}
							/></label
						>
						<button
							class="btn"
							onclick={() => {
								target = { ...DEFAULT_TARGET };
								reset();
							}}>Reset target & results</button
						>
					</fieldset>
				</section>
			{/if}
			<details>
				<summary>Detection tuning (red / green laser)</summary>
				<label
					>Laser color<select bind:value={settings.color}
						><option value="red">Red</option><option value="green">Green</option></select
					></label
				>
				{#if !validSettings(settings)}<p role="alert">
						Enter valid detection settings within the displayed ranges. Maximum blob size must be at
						least the minimum.
					</p>{/if}
				<fieldset disabled={session.status === 'running' || gameLive}>
					<legend>Pause to adjust</legend>
					<label
						>Laser channel brightness threshold (0–255)<input
							type="number"
							min="0"
							max="255"
							bind:value={settings.brightness}
							required
						/></label
					>
					<label
						>Laser channel dominance (0–255)<input
							type="number"
							min="0"
							max="255"
							bind:value={settings.dominance}
							required
						/></label
					>
					<label
						>Minimum blob pixels<input
							type="number"
							min="1"
							max="10000"
							bind:value={settings.minSize}
							required
						/></label
					>
					<label
						>Maximum blob pixels<input
							type="number"
							min={settings.minSize}
							max="10000"
							bind:value={settings.maxSize}
							required
						/></label
					>
					<label
						>Consecutive frames<input
							type="number"
							min="1"
							max="10"
							bind:value={settings.confirmationFrames}
							required
						/></label
					>
					<label
						>Shot cooldown (ms)<input
							type="number"
							min="0"
							max="5000"
							bind:value={settings.cooldown}
							required
						/></label
					>
				</fieldset>
				<p class="small">
					A pulse must disappear before another shot is accepted. More confirmation frames can
					reject short laser pulses. The projector uses grayscale to reduce color interference.
				</p>
			</details>
			<details>
				<summary>Developer simulation</summary>
				<label class="check-row"
					><input
						type="checkbox"
						bind:checked={simulation}
						onchange={() => {
							pause();
							if (synthetic && !simulation) stopCamera();
						}}
					/> Simulation: click camera preview (disables laser detection)</label
				>
				<label class="check-row"
					><input type="checkbox" bind:checked={countSimulation} /> Intentionally count simulated shots
					in session statistics</label
				>
				<button class="btn" onclick={useSynthetic}>Use synthetic camera (no hardware)</button>
				<p class="small">
					Simulation uses the same homography and scoring pipeline. By default it only reports a
					result here. Counting requires an active session and the checkbox above.
				</p>
				{#if diagnostics.simulated}<p role="status">SIMULATION: {diagnostics.simulated}</p>{/if}
			</details>
		</div>
	</div>
</section>

<style>
	.activity-picker {
		max-width: 440px;
		margin: 0 0 24px;
	}
	.heading {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		align-items: center;
		margin-bottom: 18px;
	}
	h1 {
		font-size: 2.7rem;
	}
	h2 {
		font-size: 1.4rem;
		margin-bottom: 12px;
	}
	p {
		color: #5b6d80;
		margin: 10px 0;
	}
	.instructions {
		max-width: 900px;
		margin-bottom: 24px;
	}
	.status {
		color: #315de3;
		background: #e4ebff;
		padding: 10px 14px;
		border-radius: 8px;
		white-space: nowrap;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
		gap: 28px;
		align-items: start;
	}
	canvas {
		display: block;
		width: 100%;
		height: auto;
		background: #152335;
		border-radius: 12px;
		cursor: crosshair;
	}
	.preview-column {
		min-width: 0;
	}
	.preview-note,
	.small {
		font-size: 0.8rem;
	}
	.controls {
		background: white;
		border: 1px solid #d9e1eb;
		border-radius: 14px;
		padding: 24px;
		display: grid;
		gap: 24px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	label {
		display: grid;
		gap: 5px;
		margin: 12px 0;
		font-size: 0.85rem;
	}
	select,
	input[type='number'] {
		width: 100%;
		min-height: 40px;
		border: 1px solid #bfcbd9;
		border-radius: 6px;
		padding: 8px;
	}
	input[type='range'] {
		width: 100%;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin-top: 16px;
		min-width: 0;
	}
	legend {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		padding: 20px 0;
	}
	.stats strong {
		font-size: 1.7rem;
		display: block;
		color: #18324b;
	}
	details {
		border-top: 1px solid #d9e1eb;
		padding-top: 12px;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		font-size: 0.8rem;
	}
	dt {
		color: #5b6d80;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.check-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	@media (max-width: 850px) {
		.game-layout .controls {
			order: -1;
		}
		.workspace {
			grid-template-columns: 1fr;
		}
		.heading {
			flex-wrap: wrap;
		}
	}
</style>
