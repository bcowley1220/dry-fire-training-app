<script>
	import { onMount } from 'svelte';

	// Drawer state
	let drawerState = $state('closed'); // 'closed' | 'partial' | 'full'
	let drawerHeight = $state(0); // vh units
	let isDragging = false;
	let startY = 0;
	let currentY = 0;

	// Breakpoints
	const CLOSED_HEIGHT = 8; // Show handle when closed (8vh = ~60px on most phones)
	const PARTIAL_HEIGHT = 30;
	const FULL_HEIGHT = 90;
	const SNAP_THRESHOLD = 10; // vh units for snapping

	// Device detection
	let isMobile = $state(false);
	let isTablet = $state(false);
	let isDesktop = $state(false);

	let drawerElement;

	onMount(() => {
		updateDeviceType();
		window.addEventListener('resize', updateDeviceType);

		return () => {
			window.removeEventListener('resize', updateDeviceType);
		};
	});

	function updateDeviceType() {
		const width = window.innerWidth;
		isMobile = width < 768;
		isTablet = width >= 768 && width < 1024;
		isDesktop = width >= 1024;

		// Reset drawer on desktop/tablet
		if (!isMobile) {
			drawerState = 'closed';
			drawerHeight = 0; // Actually hide on desktop/tablet
		} else {
			// On mobile, ensure drawer handle is visible
			if (drawerState === 'closed') {
				drawerHeight = CLOSED_HEIGHT;
			}
		}
	}

	// Drawer control functions (exposed via bind:this)
	export function openDrawer(state = 'partial') {
		if (!isMobile) return;

		if (state === 'partial') {
			drawerState = 'partial';
			drawerHeight = PARTIAL_HEIGHT;
		} else if (state === 'full') {
			drawerState = 'full';
			drawerHeight = FULL_HEIGHT;
		}
	}

	export function closeDrawer() {
		if (!isMobile) return;
		drawerState = 'closed';
		drawerHeight = CLOSED_HEIGHT;
	}

	function toggleDrawer() {
		if (!isMobile) return;

		if (drawerState === 'closed') {
			openDrawer('partial');
		} else if (drawerState === 'partial') {
			openDrawer('full');
		} else {
			closeDrawer();
		}
	}

	// Touch/drag handlers
	function handleTouchStart(e) {
		if (!isMobile) return;
		isDragging = true;
		startY = e.touches[0].clientY;
		currentY = startY;
	}

	function handleTouchMove(e) {
		if (!isDragging || !isMobile) return;
		e.preventDefault();

		currentY = e.touches[0].clientY;
		const deltaY = startY - currentY;
		const deltaVH = (deltaY / window.innerHeight) * 100;

		// Calculate new height (swipe up = positive delta)
		let newHeight = drawerHeight - deltaVH;

		// Clamp between 0 and 90
		newHeight = Math.max(CLOSED_HEIGHT, Math.min(FULL_HEIGHT, newHeight));

		drawerHeight = newHeight;
		startY = currentY;
	}

	function handleTouchEnd() {
		if (!isDragging || !isMobile) return;
		isDragging = false;

		// Snap to nearest state
		if (drawerHeight < (CLOSED_HEIGHT + PARTIAL_HEIGHT) / 2) {
			closeDrawer();
		} else if (drawerHeight < (PARTIAL_HEIGHT + FULL_HEIGHT) / 2) {
			openDrawer('partial');
		} else {
			openDrawer('full');
		}
	}

	// Mouse handlers for desktop testing
	function handleMouseDown(e) {
		if (isMobile) return;
		isDragging = true;
		startY = e.clientY;
		currentY = startY;
	}

	function handleMouseMove(e) {
		if (!isDragging || !isMobile) return;
		handleTouchMove({ touches: [{ clientY: e.clientY }], preventDefault: () => {} });
	}

	function handleMouseUp() {
		if (isDragging) {
			handleTouchEnd();
		}
	}

	// Backdrop click handler
	function handleBackdropClick() {
		if (drawerState === 'full') {
			openDrawer('partial');
		}
	}
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<div
	class="layout-container"
	class:mobile={isMobile}
	class:tablet={isTablet}
	class:desktop={isDesktop}
>
	{#if isMobile}
		<!-- Mobile Layout: Full-screen camera + drawer -->
		<div class="mobile-layout">
			<!-- Camera Container -->
			<div class="camera-container" style="height: {100 - drawerHeight}vh">
				<slot name="camera" />

				<!-- Status Overlay (always visible) -->
				<div class="status-overlay">
					<slot name="status-badges" />
				</div>

				<!-- Floating Action Buttons (optional) -->
				<div class="fab-container">
					<slot name="fabs" />
				</div>
			</div>

			<!-- Backdrop (when drawer is full) -->
			{#if drawerState === 'full'}
				<div class="drawer-backdrop" onclick={handleBackdropClick}></div>
			{/if}

			<!-- Bottom Drawer -->
			<div
				bind:this={drawerElement}
				class="bottom-drawer {drawerState}"
				style="height: {drawerHeight}vh"
				ontouchstart={handleTouchStart}
				ontouchmove={handleTouchMove}
				ontouchend={handleTouchEnd}
				onmousedown={handleMouseDown}
			>
				<!-- Drag Handle - Always visible, even when closed -->
				<div
					class="drawer-handle"
					onclick={toggleDrawer}
					style="position: absolute; bottom: 0; left: 0; right: 0; z-index: 101;"
				>
					<div class="handle-bar"></div>
					<div class="handle-hint">
						{#if drawerState === 'closed'}
							Swipe up for controls
						{:else if drawerState === 'partial'}
							Swipe up for more
						{:else}
							Swipe down to close
						{/if}
					</div>
				</div>

				<!-- Drawer Content -->
				<div class="drawer-content">
					{#if drawerState === 'partial'}
						<slot name="quick-actions" />
					{:else if drawerState === 'full'}
						<slot name="full-controls" />
					{/if}
				</div>
			</div>
		</div>
	{:else if isTablet}
		<!-- Tablet Layout: Split view -->
		<div class="tablet-layout">
			<div class="camera-section">
				<slot name="camera" />
			</div>
			<div class="controls-sidebar">
				<slot name="full-controls" />
			</div>
		</div>
	{:else}
		<!-- Desktop Layout: Keep current design -->
		<div class="desktop-layout">
			<slot name="desktop" />
		</div>
	{/if}
</div>

<style>
	.layout-container {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		position: relative;
		background: #0f172a;
	}

	/* ===== MOBILE LAYOUT ===== */
	.mobile-layout {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.camera-container {
		width: 100%;
		position: relative;
		overflow: hidden;
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.status-overlay {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}

	.fab-container {
		position: absolute;
		right: 20px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* Bottom Drawer */
	.bottom-drawer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: #1e293b;
		border-radius: 20px 20px 0 0;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 100;
		display: flex;
		flex-direction: column;
		touch-action: pan-y;
	}

	.bottom-drawer.closed {
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
	}

	.drawer-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 99;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.drawer-handle {
		width: 100%;
		min-height: 50px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		user-select: none;
		padding: 12px 0;
		touch-action: none;
	}

	.handle-bar {
		width: 40px;
		height: 5px;
		background: #64748b;
		border-radius: 3px;
		margin-bottom: 8px;
	}

	.handle-hint {
		font-size: 12px;
		color: #94a3b8;
	}

	.drawer-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0 20px 20px;
		-webkit-overflow-scrolling: touch;
	}

	/* ===== TABLET LAYOUT ===== */
	.tablet-layout {
		display: flex;
		width: 100%;
		height: 100%;
	}

	.camera-section {
		flex: 0 0 70%;
		position: relative;
		overflow: hidden;
	}

	.controls-sidebar {
		flex: 0 0 30%;
		overflow-y: auto;
		background: #1e293b;
		padding: 20px;
		border-left: 1px solid #334155;
	}

	/* ===== DESKTOP LAYOUT ===== */
	.desktop-layout {
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}

	/* ===== RESPONSIVE UTILITIES ===== */
	@media (max-width: 767px) {
		.tablet-layout,
		.desktop-layout {
			display: none;
		}
	}

	@media (min-width: 768px) and (max-width: 1023px) {
		.mobile-layout,
		.desktop-layout {
			display: none;
		}
	}

	@media (min-width: 1024px) {
		.mobile-layout,
		.tablet-layout {
			display: none;
		}
	}
</style>
