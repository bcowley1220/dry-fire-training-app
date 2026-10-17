<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		starting = false,
		videoElement = $bindable(null),
		canvasElement = $bindable(null),
		stream = null,
		isStreaming = false,
		calibrationMode = false,
		calibrationPoints = [],
		hasFrozenCalibrationFrame = false,
		zoneCalibrationMode = null,
		zoneCalibrationPoints = [],
		targets = [],
		hasBackground = false,
		waitingForClear = false,
		callOutTarget = null,
		isFullscreen = $bindable(false)
	} = $props();

	// Internal state for zoom/pan
	let canvasWrapper = $state(null);
	let cameraZoom = $state(1.0);
	let cameraPanX = $state(0);
	let cameraPanY = $state(0);
	let isZooming = false;
	let zoomStartDistance = 0;
	let zoomStartZoom = 1.0;
	let zoomStartPanX = 0;
	let zoomStartPanY = 0;
	let lastTouchCenterX = 0;
	let lastTouchCenterY = 0;
	/*  */ let isDragging = false;
	let lastMouseX = 0;
	let lastMouseY = 0;

	// Zoom capabilities state
	let hasHardwareZoom = $state(false);
	let zoomCapabilities = $state({ min: 1, max: 5, step: 0.1 });
	let currentZoomLevel = $state(1);
	let showZoomControls = $state(false);

	const dispatch = createEventDispatcher();

	// --- Event Handlers ---

	function constrainPan() {
		if (!canvasWrapper) return;
		const rect = canvasWrapper.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;

		const minPanX = width - width * cameraZoom;
		const maxPanX = 0;
		const minPanY = height - height * cameraZoom;
		const maxPanY = 0;

		if (cameraZoom <= 1) {
			cameraPanX = 0;
			cameraPanY = 0;
		} else {
			cameraPanX = Math.min(maxPanX, Math.max(minPanX, cameraPanX));
			cameraPanY = Math.min(maxPanY, Math.max(minPanY, cameraPanY));
		}
	}

	function handleCanvasClick(event) {
		if (!canvasElement) return;

		// Handle both mouse and touch events
		let clientX, clientY;
		if (event.touches && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else if (event.changedTouches && event.changedTouches.length > 0) {
			clientX = event.changedTouches[0].clientX;
			clientY = event.changedTouches[0].clientY;
		} else {
			clientX = event.clientX;
			clientY = event.clientY;
		}

		const wrapper = canvasElement.parentElement?.parentElement;
		if (!wrapper) return;

		const wrapperRect = wrapper.getBoundingClientRect();
		const videoAspect = canvasElement.width / canvasElement.height;
		const wrapperAspect = wrapperRect.width / wrapperRect.height;

		let displayedWidth, displayedHeight, offsetX, offsetY;

		if (videoAspect > wrapperAspect) {
			displayedWidth = wrapperRect.width;
			displayedHeight = wrapperRect.width / videoAspect;
			offsetX = 0;
			offsetY = (wrapperRect.height - displayedHeight) / 2;
		} else {
			displayedHeight = wrapperRect.height;
			displayedWidth = wrapperRect.height * videoAspect;
			offsetX = (wrapperRect.width - displayedWidth) / 2;
			offsetY = 0;
		}

		const adjustedX = clientX - wrapperRect.left;
		const adjustedY = clientY - wrapperRect.top;

		const untransformedX = (adjustedX - cameraPanX) / cameraZoom - offsetX;
		const untransformedY = (adjustedY - cameraPanY) / cameraZoom - offsetY;

		const scaleX = canvasElement.width / displayedWidth;
		const scaleY = canvasElement.height / displayedHeight;
		const actualX = untransformedX * scaleX;
		const actualY = untransformedY * scaleY;

		if (
			actualX < 0 ||
			actualY < 0 ||
			actualX > canvasElement.width ||
			actualY > canvasElement.height
		)
			return;
		dispatch('canvasClick', { x: actualX, y: actualY, event });
	}

	function handleZoom(event) {
		if (!canvasElement) return;
		event.preventDefault();
		let delta = -event.deltaY * 0.001;
		const wrapper = canvasElement.parentElement;
		if (!wrapper) return;
		const wrapperRect = wrapper.getBoundingClientRect();
		let centerX = event.clientX ? event.clientX - wrapperRect.left : wrapperRect.width / 2;
		let centerY = event.clientY ? event.clientY - wrapperRect.top : wrapperRect.height / 2;
		const newZoom = Math.max(1.0, Math.min(5.0, cameraZoom + delta));
		const zoomFactor = newZoom / cameraZoom;
		cameraPanX = cameraPanX - centerX * cameraZoom * (zoomFactor - 1);
		cameraPanY = cameraPanY - centerY * cameraZoom * (zoomFactor - 1);
		cameraZoom = newZoom;
		constrainPan();
	}

	function handlePinchStart(event) {
		if (event.touches.length !== 2 || !canvasElement) return;
		isZooming = true;
		const touch1 = event.touches[0];
		const touch2 = event.touches[1];
		const wrapper = canvasElement.parentElement;
		if (!wrapper) return;
		const wrapperRect = wrapper.getBoundingClientRect();
		zoomStartDistance = Math.hypot(
			touch2.clientX - touch1.clientX,
			touch2.clientY - touch1.clientY
		);
		zoomStartZoom = cameraZoom;
		zoomStartPanX = cameraPanX;
		zoomStartPanY = cameraPanY;
		lastTouchCenterX = (touch1.clientX + touch2.clientX) / 2 - wrapperRect.left;
		lastTouchCenterY = (touch1.clientY + touch2.clientY) / 2 - wrapperRect.top;
	}

	function handlePinchMove(event) {
		if (!isZooming || event.touches.length !== 2 || !canvasElement) return;
		event.preventDefault();
		const touch1 = event.touches[0];
		const touch2 = event.touches[1];
		const wrapper = canvasElement.parentElement;
		if (!wrapper) return;
		const wrapperRect = wrapper.getBoundingClientRect();
		const currentDistance = Math.hypot(
			touch2.clientX - touch1.clientX,
			touch2.clientY - touch1.clientY
		);
		const zoomFactor = currentDistance / zoomStartDistance;
		const newZoom = Math.max(1.0, Math.min(5.0, zoomStartZoom * zoomFactor));
		const centerX = (touch1.clientX + touch2.clientX) / 2 - wrapperRect.left;
		const centerY = (touch1.clientY + touch2.clientY) / 2 - wrapperRect.top;
		const zoomDelta = newZoom / zoomStartZoom;
		cameraPanX = zoomStartPanX - centerX * zoomStartZoom * (zoomDelta - 1);
		cameraPanY = zoomStartPanY - centerY * zoomStartZoom * (zoomDelta - 1);
		cameraZoom = newZoom;
		lastTouchCenterX = centerX;
		lastTouchCenterY = centerY;
		constrainPan();
	}

	function handlePinchEnd() {
		isZooming = false;
	}

	function handlePan(event) {
		if (isZooming || cameraZoom <= 1.0 || !canvasElement) return;
		if (event.touches && event.touches.length === 1) {
			event.preventDefault();
			const touch = event.touches[0];
			const wrapper = canvasElement.parentElement;
			if (!wrapper) return;
			const wrapperRect = wrapper.getBoundingClientRect();
			if (event.type === 'touchmove') {
				const currentX = touch.clientX - wrapperRect.left;
				const currentY = touch.clientY - wrapperRect.top;
				const deltaX = currentX - lastTouchCenterX;
				const deltaY = currentY - lastTouchCenterY;
				cameraPanX += deltaX;
				cameraPanY += deltaY;
				lastTouchCenterX = currentX;
				lastTouchCenterY = currentY;
			} else if (event.type === 'touchstart') {
				lastTouchCenterX = touch.clientX - wrapperRect.left;
				lastTouchCenterY = touch.clientY - wrapperRect.top;
			}
			constrainPan();
		}
	}

	function handleTouchStart(event) {
		if (event.touches.length === 2) {
			handlePinchStart(event);
		} else if (event.touches.length === 1 && cameraZoom > 1.0) {
			handlePan(event);
		}
	}

	function handleTouchMove(event) {
		if (event.touches.length === 2) {
			handlePinchMove(event);
		} else if (event.touches.length === 1 && cameraZoom > 1.0) {
			handlePan(event);
		}
	}

	function handleMouseDown(event) {
		if (cameraZoom <= 1.0) return;
		isDragging = true;
		lastMouseX = event.clientX;
		lastMouseY = event.clientY;
	}

	function handleMouseMove(event) {
		if (!isDragging) return;
		event.preventDefault();
		const deltaX = event.clientX - lastMouseX;
		const deltaY = event.clientY - lastMouseY;

		cameraPanX += deltaX;
		cameraPanY += deltaY;

		lastMouseX = event.clientX;
		lastMouseY = event.clientY;

		constrainPan();
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleMouseLeave() {
		isDragging = false;
	}

	$effect(() => {
		if (videoElement && stream && videoElement.srcObject !== stream) {
			videoElement.srcObject = stream;
			videoElement.play().catch((e) => console.error('Error playing video:', e));

			// Check for hardware zoom capabilities
			const track = stream.getVideoTracks()[0];
			const capabilities = track?.getCapabilities?.() ?? {};
			const settings = track?.getSettings?.() ?? {};

			if (capabilities.zoom) {
				hasHardwareZoom = true;
				zoomCapabilities = {
					min: capabilities.zoom.min,
					max: capabilities.zoom.max,
					step: capabilities.zoom.step
				};
				currentZoomLevel = settings.zoom || capabilities.zoom.min;
				// Reset software zoom if hardware is active
				cameraZoom = 1.0;
			} else {
				hasHardwareZoom = false;
				zoomCapabilities = { min: 1, max: 5, step: 0.1 };
				currentZoomLevel = cameraZoom;
			}
		}
	});

	onMount(() => {
		if (browser && canvasWrapper) {
			canvasWrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
			canvasWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
			canvasWrapper.addEventListener('touchend', handlePinchEnd, { passive: false });
			return () => {
				canvasWrapper.removeEventListener('touchstart', handleTouchStart);
				canvasWrapper.removeEventListener('touchmove', handleTouchMove);
				canvasWrapper.removeEventListener('touchend', handlePinchEnd);
			};
		}
	});

	function handleSliderZoom(e) {
		const value = parseFloat(e.currentTarget.value);
		currentZoomLevel = value;

		if (hasHardwareZoom && stream) {
			const track = stream.getVideoTracks()[0];
			if (track) {
				track.applyConstraints({ advanced: [{ zoom: value }] }).catch((err) => {
					console.error('Failed to apply zoom constraints:', err);
				});
			}
		} else {
			// Software zoom with center focus
			const oldZoom = cameraZoom;
			const newZoom = value;

			if (canvasWrapper) {
				const rect = canvasWrapper.getBoundingClientRect();
				const width = rect.width;
				const height = rect.height;

				// Calculate center point in unzoomed space relative to current pan
				const cx = width / 2;
				const cy = height / 2;

				cameraPanX = cx - ((cx - cameraPanX) / oldZoom) * newZoom;
				cameraPanY = cy - ((cy - cameraPanY) / oldZoom) * newZoom;
			}
			cameraZoom = newZoom;
			constrainPan();
		}
	}

	function handleViewKey(event) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			showZoomControls = !showZoomControls;
		}
		if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
			event.preventDefault();
		if (event.key === '+' || event.key === '=')
			handleSliderZoom({
				currentTarget: { value: Math.min(zoomCapabilities.max, currentZoomLevel + 0.2) }
			});
		if (event.key === '-')
			handleSliderZoom({
				currentTarget: { value: Math.max(zoomCapabilities.min, currentZoomLevel - 0.2) }
			});
		if (event.key === 'ArrowLeft') cameraPanX += 20;
		if (event.key === 'ArrowRight') cameraPanX -= 20;
		if (event.key === 'ArrowUp') cameraPanY += 20;
		if (event.key === 'ArrowDown') cameraPanY -= 20;
		constrainPan();
	}

	let keyboardX = $state(0.5);
	let keyboardY = $state(0.5);
	function handleCalibrationKey(event) {
		if (!canvasElement) return;
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key))
			event.preventDefault();
		if (event.key === 'ArrowLeft') keyboardX = Math.max(0, keyboardX - 0.02);
		if (event.key === 'ArrowRight') keyboardX = Math.min(1, keyboardX + 0.02);
		if (event.key === 'ArrowUp') keyboardY = Math.max(0, keyboardY - 0.02);
		if (event.key === 'ArrowDown') keyboardY = Math.min(1, keyboardY + 0.02);
		if (event.key === 'Enter' || event.key === ' ')
			dispatch('canvasClick', {
				x: keyboardX * canvasElement.width,
				y: keyboardY * canvasElement.height,
				event
			});
	}
</script>

<div id="camera-viewport" class="camera-viewport-container">
	<div class="camera-caption">
		<span class="camera-state"
			><span class:connected={isStreaming}></span>{isStreaming
				? calibrationMode
					? 'Frame paused for setup'
					: 'Camera live'
				: 'Camera preview'}</span
		><span
			>{targets.length
				? `${targets.length} target${targets.length === 1 ? '' : 's'}`
				: 'Your space, in view'}</span
		>
	</div>
	<div class="camera-surface">
		<video bind:this={videoElement} autoplay playsinline muted class="camera-source"></video>
		<div
			bind:this={canvasWrapper}
			class="canvas-wrapper"
			role="button"
			aria-disabled={!isStreaming}
			tabindex={isStreaming && !calibrationMode && !zoneCalibrationMode ? 0 : -1}
			onkeydown={handleViewKey}
			aria-label="Camera view. Press Enter for zoom controls. Use plus and minus to zoom, and arrow keys to pan."
			style="transform: scale({cameraZoom}) translate({cameraPanX / cameraZoom}px, {cameraPanY /
				cameraZoom}px); transform-origin: 0 0; width: 100%; height: 100%; overflow: hidden;"
			onmousedown={handleMouseDown}
			onmousemove={handleMouseMove}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseLeave}
			onwheel={handleZoom}
		>
			<canvas bind:this={canvasElement} class="camera-canvas"></canvas>
		</div>
		{#if calibrationMode || zoneCalibrationMode}
			<div
				class="calibration-input"
				onclick={handleCanvasClick}
				ontouchstart={handleCanvasClick}
				ontouchend={(event) => event.preventDefault()}
				onkeydown={handleCalibrationKey}
				role="button"
				tabindex="0"
				aria-label="Select target corner. Use arrow keys to move and Enter to select."
			>
				<span class="keyboard-cursor" style="left:{keyboardX * 100}%;top:{keyboardY * 100}%"></span>
			</div>
		{/if}
		{#if !isStreaming}
			<div class="camera-empty">
				<svg class="target-illustration" viewBox="0 0 280 180" fill="none" aria-hidden="true"
					><path
						d="M26 48V24h28m172 0h28v24M26 132v24h28m172 0h28v-24"
						stroke="#75899b"
						stroke-width="1.5"
					/><path
						d="M116 25h48l28 30v74l-28 29h-48l-28-29V55l28-30Z"
						fill="#293e50"
						stroke="#91a5b5"
						stroke-width="1.5"
					/><path d="M125 48h30l16 18v52l-16 18h-30l-16-18V66l16-18Z" stroke="#9eb3c4" /><rect
						x="126"
						y="71"
						width="28"
						height="42"
						rx="3"
						stroke="#c6d3dc"
					/><path d="M140 79v26m-13-13h26" stroke="#c6d3dc" /><circle
						cx="146"
						cy="85"
						r="3"
						fill="#83a5ff"
					/><path d="M61 90h13m132 0h13" stroke="#75899b" /></svg
				>
				<strong
					>{starting ? 'Connecting to your camera…' : 'A little space. A little practice.'}</strong
				>
				<p>
					{starting
						? 'Allow camera access in your browser to continue.'
						: 'Your camera view will appear here.'}
				</p>
			</div>
		{/if}
		{#if isStreaming && !calibrationMode && !zoneCalibrationMode}
			{#if waitingForClear || callOutTarget}<div class="camera-callout">
					{waitingForClear ? 'Clear and fire again' : callOutTarget}
				</div>{/if}
		{/if}
		{#if isStreaming && (calibrationMode || zoneCalibrationMode)}<div class="frame-badge">
				{hasFrozenCalibrationFrame
					? 'Frozen frame'
					: zoneCalibrationMode
						? `${zoneCalibrationMode} zone`
						: 'Select corners'}
			</div>{/if}
	</div>
	{#if calibrationMode || zoneCalibrationMode}
		<div class="calibration-guidance" aria-live="polite">
			<span class="corner-progress"
				>{(zoneCalibrationMode ? zoneCalibrationPoints.length : calibrationPoints.length) + 1}<small
					>/4</small
				></span
			>
			<div>
				<strong
					>{zoneCalibrationMode ? `${zoneCalibrationMode} zone: ` : ''}Tap the {[
						'top-left',
						'top-right',
						'bottom-right',
						'bottom-left'
					][zoneCalibrationMode ? zoneCalibrationPoints.length : calibrationPoints.length]} corner</strong
				>
				<p>
					{hasFrozenCalibrationFrame
						? 'The image is paused. Your camera can stay in place.'
						: 'Work clockwise around the area you want to mark.'}
				</p>
			</div>
		</div>
		<div class="camera-toolbar calibration-toolbar">
			{#if calibrationMode}<button class="btn" onclick={() => dispatch('retakeCalibrationFrame')}
					><Icon name="refresh" size={17} />Retake</button
				><button
					class="btn"
					disabled={!calibrationPoints.length}
					onclick={() => dispatch('undoCalibrationPoint')}
					><Icon name="undo" size={17} />Undo</button
				>{/if}
			<button
				class="btn btn-quiet"
				onclick={() =>
					dispatch(zoneCalibrationMode ? 'cancelZoneCalibration' : 'cancelCalibration')}
				>Cancel</button
			>
			<button
				class="icon-button expand-button"
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Enlarge camera'}
				onclick={() => dispatch('toggleFullscreen')}><Icon name="expand" size={19} /></button
			>
		</div>
	{:else if isStreaming}
		<div class="camera-toolbar">
			<button
				id="btn-set-background"
				class="camera-tool"
				class:filter-set={hasBackground}
				disabled={!isStreaming}
				onclick={() => dispatch('toggleBackground')}
				><Icon name={hasBackground ? 'check' : 'light'} size={17} />{hasBackground
					? 'Room filter set'
					: 'Room filter'}</button
			>
			<div class="camera-tools-right">
				<button
					class="icon-button"
					disabled={!isStreaming}
					aria-label="Zoom controls"
					aria-expanded={showZoomControls}
					onclick={() => (showZoomControls = !showZoomControls)}
					><Icon name="zoom" size={19} /></button
				><button
					class="icon-button"
					disabled={!isStreaming}
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Enlarge camera'}
					onclick={() => dispatch('toggleFullscreen')}><Icon name="expand" size={19} /></button
				>{#if isStreaming}<button
						class="icon-button stop-camera"
						aria-label="Stop camera"
						onclick={() => dispatch('stopCamera')}><Icon name="stop" size={17} /></button
					>{/if}
			</div>
		</div>
	{/if}
	{#if showZoomControls && isStreaming}<div class="zoom-controls">
			<label for="camera-zoom">Zoom <strong>{currentZoomLevel.toFixed(1)}×</strong></label><input
				id="camera-zoom"
				type="range"
				min={zoomCapabilities.min}
				max={zoomCapabilities.max}
				step={zoomCapabilities.step}
				value={currentZoomLevel}
				oninput={handleSliderZoom}
			/><button
				class="btn btn-quiet"
				onclick={() => handleSliderZoom({ currentTarget: { value: 1 } })}>Reset</button
			>
		</div>{/if}
</div>

<style>
	.camera-viewport-container {
		overflow: hidden;
		border-radius: 14px;
		background: white;
		border: 1px solid #d9e1eb;
	}
	.camera-caption {
		padding: 13px 18px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		font-size: 0.78rem;
		color: #5b6d80;
	}
	.camera-state {
		display: inline-flex;
		gap: 7px;
		align-items: center;
		color: #18324b;
	}
	.camera-state > span {
		width: 7px;
		height: 7px;
		background: #9faebb;
		border-radius: 50%;
	}
	.camera-state > span.connected {
		background: #237651;
	}
	.camera-surface {
		position: relative;
		background: #203342;
		aspect-ratio: 16/10;
		overflow: hidden;
	}
	.camera-source {
		display: none;
	}
	.camera-canvas {
		height: 100%;
		width: 100%;
		object-fit: contain;
		display: block;
		touch-action: none;
	}
	.camera-empty {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px;
		text-align: center;
		color: #e4edf6;
	}
	.target-illustration {
		width: min(60%, 280px);
		max-height: 55%;
		margin-bottom: 18px;
	}
	.camera-empty strong {
		font-size: 1rem;
		font-weight: 500;
	}
	.camera-empty p {
		font-size: 0.8rem;
		color: #a9bbcc;
		margin-top: 8px;
	}
	.camera-toolbar {
		padding: 9px 12px;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 62px;
	}
	.camera-tool {
		display: flex;
		align-items: center;
		gap: 7px;
		min-height: 44px;
		padding: 8px;
		font-size: 0.8rem;
	}
	.filter-set {
		color: #237651;
	}
	.camera-tools-right {
		display: flex;
		margin-left: auto;
		gap: 2px;
	}
	.stop-camera {
		color: #b73841;
	}
	.calibration-input {
		position: absolute;
		inset: 0;
		cursor: crosshair;
		z-index: 2;
		touch-action: none;
	}
	.keyboard-cursor {
		position: absolute;
		width: 18px;
		height: 18px;
		border: 2px solid white;
		outline: 1px solid #315de3;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		opacity: 0;
	}
	.calibration-input:focus-visible .keyboard-cursor {
		opacity: 1;
	}
	.frame-badge {
		position: absolute;
		left: 12px;
		top: 12px;
		background: #fff4df;
		color: #794109;
		padding: 7px 11px;
		border-radius: 6px;
		font-size: 0.75rem;
		pointer-events: none;
	}
	.calibration-guidance {
		padding: 17px 18px 8px;
		display: flex;
		align-items: center;
		gap: 13px;
	}
	.corner-progress {
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-size: 2rem;
		font-weight: 600;
		color: #315de3;
	}
	.corner-progress small {
		font-size: 1rem;
		color: #8293a8;
		margin-left: 2px;
	}
	.calibration-guidance strong {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.calibration-guidance p {
		font-size: 0.75rem;
		color: #5b6d80;
		margin-top: 3px;
	}
	.calibration-toolbar {
		flex-wrap: wrap;
		padding-top: 7px;
	}
	.calibration-toolbar .btn {
		min-height: 44px;
		font-size: 0.8rem;
		padding: 8px 12px;
	}
	.expand-button {
		margin-left: auto;
	}
	.zoom-controls {
		border-top: 1px solid #d9e1eb;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 18px;
		font-size: 0.8rem;
	}
	.zoom-controls label {
		white-space: nowrap;
	}
	.zoom-controls input {
		min-width: 0;
	}
	.camera-callout {
		pointer-events: none;
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 16px;
		background: #f1f4f8;
		color: #18324b;
		border-left: 4px solid #315de3;
		padding: 12px 18px;
		font-family: 'Barlow Semi Condensed', sans-serif;
		font-size: clamp(1.6rem, 4vw, 3rem);
		font-weight: 600;
	}
	.camera-viewport-container:fullscreen {
		border-radius: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #203342;
	}
	.camera-viewport-container:fullscreen .camera-caption,
	.camera-viewport-container:fullscreen .camera-toolbar,
	.camera-viewport-container:fullscreen .calibration-guidance,
	.camera-viewport-container:fullscreen .zoom-controls {
		background: white;
	}
	.camera-viewport-container:fullscreen .camera-surface {
		flex: 1;
		min-height: 0;
		aspect-ratio: auto;
	}
	@media (max-width: 480px) {
		.camera-empty {
			padding: 15px;
		}
		.target-illustration {
			margin-bottom: 12px;
			max-height: 50%;
		}
		.camera-empty strong {
			font-size: 0.9rem;
		}
		.camera-empty p {
			margin-top: 5px;
			font-size: 0.75rem;
		}
		.camera-caption {
			padding: 11px 14px;
		}
	}
</style>
