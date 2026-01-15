<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { createEventDispatcher } from 'svelte';

	let {
		videoElement = $bindable(null),
		canvasElement = $bindable(null),
		stream = null,
		isStreaming = false,
		isSetupComplete = false,
		calibrationMode = false,
		calibrationPoints = [],
		zoneCalibrationMode = null,
		zoneCalibrationPoints = [],
		zones = {},
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
/*  */	let isDragging = false;
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

		const wrapper = canvasElement.parentElement;
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

		const adjustedX = clientX - wrapperRect.left - offsetX;
		const adjustedY = clientY - wrapperRect.top - offsetY;

		const untransformedX = adjustedX / cameraZoom - cameraPanX / cameraZoom;
		const untransformedY = adjustedY / cameraZoom - cameraPanY / cameraZoom;

		const scaleX = canvasElement.width / displayedWidth;
		const scaleY = canvasElement.height / displayedHeight;
		const actualX = untransformedX * scaleX;
		const actualY = untransformedY * scaleY;

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
		zoomStartDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
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
</script>

<div
	class="camera-viewport-container relative w-full bg-card rounded-xl overflow-hidden border border-border aspect-[4/3]"
>
	<!-- Camera Feed -->
	<div class="relative bg-black rounded-lg overflow-hidden shadow-lg h-full w-full">
		<video
			bind:this={videoElement}
			autoplay
			playsinline
			muted
			class="w-full h-full object-contain hidden"
		></video>
		<div
			bind:this={canvasWrapper}
			class="canvas-wrapper"
			style="transform: scale({cameraZoom}) translate({cameraPanX / cameraZoom}px, {cameraPanY /
				cameraZoom}px); transform-origin: 0 0; width: 100%; height: 100%; overflow: hidden;"
			on:mousedown={handleMouseDown}
			on:mousemove={handleMouseMove}
			on:mouseup={handleMouseUp}
			on:mouseleave={handleMouseLeave}
			on:wheel={handleZoom}
		>
			<canvas
				bind:this={canvasElement}
				class="w-full h-full object-contain"
				style="touch-action: none; display: block;"
			></canvas>
		</div>
		{#if calibrationMode || zoneCalibrationMode}
			<div
				class="absolute inset-0 cursor-crosshair z-10"
				on:click={handleCanvasClick}
				on:touchstart={handleCanvasClick}
				on:touchend={(e) => e.preventDefault()}
				on:keydown={(e) => e.key === 'Enter' && handleCanvasClick(e)}
				role="button"
				tabindex="0"
				style="touch-action: none;"
			></div>
		{/if}
		{#if calibrationMode}
			<div
				class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-500/50 backdrop-blur-sm text-black px-4 py-2 rounded font-semibold text-center w-[75%]"
			>
				{#if calibrationPoints.length === 0}
					Tap corners CLOCKWISE: Start with top-left corner
				{:else if calibrationPoints.length === 1}
					Tap top-right corner (clockwise)
				{:else if calibrationPoints.length === 2}
					Tap bottom-right corner (clockwise)
				{:else if calibrationPoints.length === 3}
					Tap bottom-left corner (clockwise) - last one!
				{/if}
			</div>
		{/if}
		{#if zoneCalibrationMode}
			<div
				class="absolute bottom-4 left-1/2 transform -translate-x-1/2 backdrop-blur-sm px-4 py-2 rounded font-semibold text-center w-[75%]"
				style="background-color: {zones[zoneCalibrationMode].color}80; color: #000;"
			>
				{#if zoneCalibrationPoints.length === 0}
					Define {zoneCalibrationMode}-zone: Tap corners CLOCKWISE (start top-left)
				{:else if zoneCalibrationPoints.length === 1}
					{zoneCalibrationMode}-zone: Tap top-right corner (clockwise)
				{:else if zoneCalibrationPoints.length === 2}
					{zoneCalibrationMode}-zone: Tap bottom-right corner (clockwise)
				{:else if zoneCalibrationPoints.length === 3}
					{zoneCalibrationMode}-zone: Tap bottom-left corner (clockwise) - last one!
				{/if}
			</div>
			<button
				on:click={() => dispatch('cancelZoneCalibration')}
				class="absolute top-4 right-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold z-20"
			>
				Cancel
			</button>
		{/if}
		{#if !isStreaming}
			<div class="absolute inset-0 flex items-center justify-center bg-card">
				<div class="text-center space-y-4 p-8">
					<div
						class="w-16 h-16 mx-auto rounded-full bg-secondary/50 flex items-center justify-center border-2 border-dashed border-muted-foreground/30"
					>
						<svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
					</div>
					<div>
						<p class="text-muted-foreground text-sm font-medium">Camera inactive</p>
						<p class="text-muted-foreground/60 text-xs mt-1">Tap Start to begin</p>
					</div>
					<button
						on:click={() => dispatch('startCamera')}
						class="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 mx-auto"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						Start
					</button>
				</div>
			</div>
		{/if}

		<!-- Camera Overlay Controls (when streaming) -->
		{#if isStreaming && isSetupComplete}
			<!-- Calibrated Badge -->
			{#if targets.length > 0}
				<div
					class="absolute top-3 left-3 glass px-3 py-1.5 rounded-full flex items-center gap-2 text-xs border border-success/20"
				>
					<div class="w-2 h-2 rounded-full bg-success pulse-active"></div>
					<span class="text-success font-medium">{targets.length} Target{targets.length > 1 ? 's' : ''}</span>
				</div>
			{/if}

			<!-- Malfunction Overlay -->
			{#if waitingForClear}
				<div class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
					<div class="bg-red-600/90 text-white px-8 py-6 rounded-xl text-4xl font-black animate-pulse border-4 border-white shadow-2xl transform -rotate-6 backdrop-blur-sm">
						MALFUNCTION!
					</div>
				</div>
			{/if}

			<!-- Call-Out Overlay -->
			{#if callOutTarget}
				<div class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
					<div class="bg-blue-600/90 text-white px-8 py-6 rounded-xl text-4xl font-black animate-pulse border-4 border-white shadow-2xl transform rotate-0 backdrop-blur-sm text-center">
						{callOutTarget}
					</div>
				</div>
			{/if}

			<!-- Top Right Controls -->
			<div class="absolute top-3 right-3 z-20 flex gap-2">
				<!-- Background Button -->
				<button
					on:click={() => dispatch('toggleBackground')}
					class="glass border-0 hover:bg-secondary/50 p-2 rounded-lg transition-colors {hasBackground ? 'text-green-400 bg-green-400/10' : ''}"
					aria-label="Set Background"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</button>

				<!-- Fullscreen Button -->
				<button
					on:click={() => dispatch('toggleFullscreen')}
					class="glass border-0 hover:bg-secondary/50 p-2 rounded-lg transition-colors"
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				>
					{#if isFullscreen}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12M4 8h4m0 0v4m0-4l5 5m7-5h-4m0 0v4m0-4l-5 5M4 16h4m0 0v4m0-4l5-5m7 5h-4m0 0v4m0-4l-5-5"
							/>
						</svg>
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
							/>
						</svg>
					{/if}
				</button>
			</div>

			<!-- Stop Button - Top Left -->
			<div class="absolute top-3 left-3 z-10">
				<button
					on:click={() => dispatch('stopCamera')}
					class="glass border-0 backdrop-blur-xl shadow-lg px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v4H9z" />
					</svg>
					Stop
				</button>
			</div>

			<!-- Zoom Slider -->
			<div class="absolute bottom-20 right-4 z-20 flex flex-col items-end gap-2">
				{#if showZoomControls}
					<div class="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-2 rounded-full border border-white/10 shadow-lg animate-fade-in">
						{#if currentZoomLevel > 1}
							<button
								class="text-xs font-medium text-white/80 hover:text-white px-1"
								on:click={() => {
									if (hasHardwareZoom && stream) {
										const track = stream.getVideoTracks()[0];
										if (track) track.applyConstraints({ advanced: [{ zoom: 1 }] });
										currentZoomLevel = 1;
									} else {
										cameraZoom = 1;
										cameraPanX = 0;
										cameraPanY = 0;
										currentZoomLevel = 1;
									}
								}}>Reset</button>
							<div class="w-px h-4 bg-white/20 mx-1"></div>
						{/if}
						<span class="text-xs font-medium text-white/80 w-8 text-right">{(currentZoomLevel).toFixed(1)}x</span>
						<input
							type="range"
							min={zoomCapabilities.min}
							max={zoomCapabilities.max}
							step={zoomCapabilities.step}
							value={currentZoomLevel}
							on:input={handleSliderZoom}
							class="w-24 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
						/>
					</div>
				{/if}
				<button
					on:click={() => showZoomControls = !showZoomControls}
					class="glass border-0 bg-black/60 backdrop-blur-md p-3 rounded-full shadow-lg hover:bg-black/80 transition-all {showZoomControls ? 'text-primary' : 'text-white'}"
					aria-label="Toggle Zoom Controls"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
</div>