<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { detectLaserDots, CLUSTER_RADIUS } from '$lib/utils/detection.js';
	import { DEFAULT_ZONES, templates } from '../lib/utils/zones.js';
	import DrillsPanel from '$lib/components/DrillsPanel.svelte';
	import ZoneSettingsPanel from '$lib/components/ZoneSettingsPanel.svelte';
	import VisualizationPanel from '$lib/components/VisualizationPanel.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import TargetSetup from '$lib/components/TargetSetup.svelte';
	import Header from '$lib/components/Header.svelte';
	import CameraStage from '$lib/components/CameraStage.svelte';
	import HitsList from '$lib/components/HitsList.svelte';
	import StatusPills from '../lib/components/StatusPills.svelte';
	import { driver } from 'driver.js';
	import 'driver.js/dist/driver.css';

	// State
	let canvasWrapper = null; // Reference to canvas wrapper for touch events
	let videoElement = $state(null);
	let canvasElement = $state(null);
	let videoStream = $state(null);
	let isStreaming = $state(false);
	let hits = $state([]);
	let calibrationMode = $state(false);
	let calibrationPoints = $state([]);
	let targets = $state([]); // Array of { id, name, boundary }
	let targetBoundary = $derived(targets.length > 0 ? targets[targets.length - 1].boundary : null); // Backward compatibility
	let detectionActive = $state(false);
	let backgroundSnapshot = $state(null);
	const backgroundThreshold = 100; // Sensitivity for change detection. Higher is less sensitive.
	let animationFrameId = null;
	let lastHitTime = $state(0);
	let hitDebounceMs = 100; // Ignore hits within 100ms of previous hit

	// Target mode and configuration
	let targetMode = $state('custom'); // 'preloaded' | 'custom' | 'freeform'
	let selectedTemplate = $state('ipsc-classic');
	let showTargetModeSelection = $state(false);
	let isSetupComplete = $state(false); // Track if setup is complete
	let isTemplateDropdownOpen = $state(false);
	let actionBarExpanded = $state(false);
	
	// Customizable zones (start with defaults)
	let zones = $state(JSON.parse(JSON.stringify(DEFAULT_ZONES)));
	let showZoneSettings = $state(false);
	let zoneCalibrationMode = $state(null); // 'A', 'C', 'D', or null
	let zoneCalibrationPoints = $state([]);
	let customZoneBounds = $state({
		A: null, // Will store {x1, y1, x2, y2, x3, y3, x4, y4}
		C: null,
		D: null
	});

	// Shot Timer State
	let shotTimerActive = $state(false);
	let shotTimerPhase = $state('idle'); // 'idle' | 'waiting' | 'active' | 'complete'
	let shotTimerStartTime = $state(null);
	let shotTimerFirstHitTime = $state(null);
	let shotTimerConfig = $state({
		drillType: 'draw',
		mode: 'draw',
		randomDelayMin: 2000, // ms
		randomDelayMax: 5000, // ms
		beepVolume: 0.3,
		beepFrequency: 1000, // Hz
		autoNextRound: false, // Enable automatic next round
		roundCount: 10, // Number of rounds to shoot
		resetDuration: 3000, // ms between rounds
		malfunctionMode: false,
		malfunctionProbability: 0.1
	});
	let shotTimerSession = $state({
		reps: [],
		startedAt: null
	});
	let shotTimerDelayTimeout = null;
	let shotTimerAutoNextTimeout = null; // Timeout for automatic next round
	let audioContext = null;
	let showDrills = $state(false);
	let showSessionStats = $state(false);
	let timerDisplayUpdate = $state(0); // Force reactivity for timer display
	let shotTimerCooldownUntil = $state(null); // Cooldown period after timer stops
	let currentRound = $state(0); // Current round number (1-indexed)
	let autoNextCountdown = $state(null); // Countdown remaining for auto-advance (ms)
	let lastCalibrationClickTime = 0; // Debounce calibration clicks
	let waitingForClear = $state(false); // Malfunction state
	let tempDrillData = $state({}); // Intermediate drill data for multi-stage drills
	let consecutiveMalfunctions = 0; // Track consecutive malfunctions to prevent bad luck streaks
	const CALIBRATION_CLICK_DEBOUNCE_MS = 300; // Prevent double-firing

	// Shot Sequence Visualization State
	let sessionShotCounter = $state(0); // Sequential shot number counter
	let visualizationState = $state({
		showShotNumbers: true,
		showSequenceLines: true,
		showAllShots: true,
		currentReplayShot: 0,
		lineColor: '#60a5fa',
		numberColor: '#ffffff',
		lineWidth: 2,
		numberSize: 16
	});
	let showVisualizationControls = $state(false);
	let showDiagnosticOverlay = $state(false);
	let showDebugOverlay = $state(false); // Debug mode to show detection pixels
	let isFullscreen = $state(false);

	// Onboarding State
	let driverObj = null;
	let tourSeen = $state(false);

	const driverConfig = {
		showProgress: true,
		animate: true,
		allowClose: true,
		doneBtnText: 'Done',
		closeBtnText: 'Skip',
		nextBtnText: 'Next',
		prevBtnText: 'Back',
		onDestroyed: () => {
			if (browser) {
				localStorage.setItem('tour_seen', 'true');
				tourSeen = true;
			}
			driverObj = null;
		}
	};

	// Initialize camera
	async function startCamera() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					facingMode: 'environment' // Use rear camera on mobile
				}
			});

			videoStream = stream;
			if (videoElement) {
				videoElement.srcObject = stream;
				await videoElement.play();
				isStreaming = true;
				startDetection();
				
				// Auto-start calibration if setup is complete and calibration is needed (unless freeform mode)
				if (isSetupComplete && targets.length === 0 && targetMode !== 'freeform') {
					startCalibration();
				}
			}
		} catch (error) {
			console.error('Error accessing camera:', error);
			alert('Unable to access camera. Please ensure you grant camera permissions.');
		}
	}

	function stopCamera() {
		if (videoStream) {
			videoStream.getTracks().forEach((track) => track.stop());
			videoStream = null;
		}
		if (videoElement) {
			videoElement.srcObject = null;
		}
		isStreaming = false;
		stopDetection();
	}

	function startDetection() {
		if (detectionActive) return;
		detectionActive = true;
		processFrames();
	}

	function stopDetection() {
		detectionActive = false;
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	function processFrames() {
		if (!detectionActive || !videoElement || !canvasElement) return;

		const video = videoElement;
		const canvas = canvasElement;
		const ctx = canvas.getContext('2d');

		// Wait for video to be ready
		if (!video.videoWidth || !video.videoHeight) {
			animationFrameId = requestAnimationFrame(processFrames);
			return;
		}

		// Set canvas size to match video
		if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
		}

		// Draw video frame to canvas
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

		// Get image data for processing
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const pixels = imageData.data;

		// Reset snapshot if video dimensions change
		if (
			backgroundSnapshot &&
			(backgroundSnapshot.width !== canvas.width || backgroundSnapshot.height !== canvas.height)
		) {
			console.warn('Video dimensions changed. Clearing background snapshot.');
			backgroundSnapshot = null;
		}

		// Clear debug pixels for this frame
		if (showDebugOverlay) {
			window.debugPixels = [];
		}

		// Calculate ROI (Region of Interest) if target is calibrated
		// We calculate the union of all target bounding boxes
		let roi = null;
		if (targets.length > 0) {
			let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
			targets.forEach(t => {
				const bbox = getTargetBoundingBox(t.boundary);
				minX = Math.min(minX, bbox.minX);
				maxX = Math.max(maxX, bbox.maxX);
				minY = Math.min(minY, bbox.minY);
				maxY = Math.max(maxY, bbox.maxY);
			});
			
			roi = {
				minX: Math.max(0, Math.floor(minX)),
				maxX: Math.min(canvas.width, Math.ceil(maxX)),
				minY: Math.max(0, Math.floor(minY)),
				maxY: Math.min(canvas.height, Math.ceil(maxY))
			};
		}

		// Detect laser dots
		const detectedHits = detectLaserDots(pixels, canvas.width, canvas.height, showDebugOverlay, backgroundSnapshot, backgroundThreshold, roi);
		// Process detected hits
		for (const hit of detectedHits) {
			// Check if we're in shot timer cooldown period
			if (shotTimerCooldownUntil && performance.now() < shotTimerCooldownUntil) {
				continue; // Skip this hit - still in cooldown period after timer stopped
			}

			// Detect zone for this hit
			const zoneInfo = detectZone(hit.x, hit.y);

			// Freeform mode: log all hits (zoneInfo.zone will be 'Hit', not 'Miss')
			// For other modes: skip hits outside calibrated boundary
			if (targets.length > 0 && zoneInfo.zone === 'Miss' && targetMode !== 'freeform') {
				continue;
			}
			
			// For zone-based modes without calibration, skip (can't detect zones)
			if (targets.length === 0 && targetMode !== 'freeform' && zoneInfo.zone === 'Miss') {
				continue;
			}

			// Debounce: ignore hits too close in time and space
			const now = Date.now();
			const timeSinceLastHit = now - lastHitTime;
			const isDuplicate = hits.some(
				(existingHit) =>
					Math.abs(existingHit.x - hit.x) < CLUSTER_RADIUS * 2 &&
					Math.abs(existingHit.y - hit.y) < CLUSTER_RADIUS * 2 &&
					now - existingHit.timestamp < hitDebounceMs
			);

			if (!isDuplicate && timeSinceLastHit >= hitDebounceMs) {
				// Increment shot counter for this session
				sessionShotCounter++;
				
				const newHit = {
					id: crypto.randomUUID(),
					x: hit.x,
					y: hit.y,
					timestamp: now,
					color: hit.color,
					zone: zoneInfo.zone,
					points: zoneInfo.points,
					zoneColor: zoneInfo.color || '#3b82f6',
					targetId: zoneInfo.targetId,
					shotNumber: sessionShotCounter,
					displayUntil: now + 2000 // Show marker for 2 seconds
				};
				
				// Check if shot timer is active
				if (shotTimerActive) {
					const consumed = handleTimerHit(newHit);
				}
				
				hits = [...hits, newHit];
				lastHitTime = now;
			}
		}

		// Draw overlays
		drawOverlays(ctx, canvas.width, canvas.height);

		// Update timer display if active (trigger reactivity for real-time display)
		if (shotTimerPhase === 'active' && shotTimerStartTime) {
			// Update reactive variable to trigger UI refresh
			timerDisplayUpdate = performance.now();
		}

		// Continue processing
		animationFrameId = requestAnimationFrame(processFrames);
	}

	function drawSequenceLines(ctx, visibleHits) {
		if (!visualizationState.showSequenceLines || visibleHits.length < 2) {
			return;
		}
		
		ctx.strokeStyle = visualizationState.lineColor;
		ctx.lineWidth = visualizationState.lineWidth;
		ctx.setLineDash([5, 5]); // Dashed line
		
		// Draw lines between consecutive shots
		for (let i = 0; i < visibleHits.length - 1; i++) {
			const currentHit = visibleHits[i];
			const nextHit = visibleHits[i + 1];
			
			ctx.beginPath();
			ctx.moveTo(currentHit.x, currentHit.y);
			ctx.lineTo(nextHit.x, nextHit.y);
			ctx.stroke();
		}
		
		ctx.setLineDash([]); // Reset to solid line
	}

	function drawHitMarker(ctx, hit, skipExpiryCheck = false) {
		const now = Date.now();
		// Skip expiry check in replay mode
		if (!skipExpiryCheck && now >= hit.displayUntil) return;
		
		// Draw hit circle
		ctx.strokeStyle = hit.color === 'red' ? '#ff0000' : '#00ff00';
		ctx.fillStyle = hit.color === 'red' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.3)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(hit.x, hit.y, 20, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		
		// Draw shot number if enabled
		if (visualizationState.showShotNumbers && hit.shotNumber) {
			// Draw background circle for better readability
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.beginPath();
			ctx.arc(hit.x, hit.y, 12, 0, Math.PI * 2);
			ctx.fill();
			
			// Draw number
			ctx.fillStyle = visualizationState.numberColor;
			ctx.font = `bold ${visualizationState.numberSize}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(hit.shotNumber.toString(), hit.x, hit.y);
		}
	}

	function drawDiagnosticOverlay(ctx, width, height) {
		// Draw diagnostic target overlay centered on canvas
		const centerX = width / 2;
		const centerY = height / 2;
		const radius = Math.min(width, height) * 0.4; // 40% of smaller dimension
		
		// Save context
		ctx.save();
		
		// Draw semi-transparent background circle
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
		ctx.fill();
		
		// Draw concentric rings (bullseye)
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 2;
		for (let i = 1; i <= 4; i++) {
			const ringRadius = radius * (1 - i * 0.15);
			ctx.beginPath();
			ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
			ctx.stroke();
		}
		
		// Draw center bullseye
		ctx.fillStyle = '#000000';
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius * 0.1, 0, Math.PI * 2);
		ctx.fill();
		
		// Draw radial lines dividing the pie segments
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 1;
		const segments = [
			{ start: -Math.PI * 0.75, end: -Math.PI * 0.25, label: 'PUSHING\nANTICIPATING RECOIL', x: centerX - radius * 0.6, y: centerY - radius * 0.6 },
			{ start: -Math.PI * 0.25, end: Math.PI * 0.25, label: 'BREAKING\nWRIST UP', x: centerX, y: centerY - radius * 0.7 },
			{ start: Math.PI * 0.25, end: Math.PI * 0.75, label: 'HEELING\nANTICIPATING RECOIL', x: centerX + radius * 0.6, y: centerY - radius * 0.6 },
			{ start: Math.PI * 0.75, end: Math.PI * 1.25, label: 'THUMBING', x: centerX + radius * 0.7, y: centerY },
			{ start: Math.PI * 1.25, end: Math.PI * 1.75, label: 'SQUEEZING\nWHOLE HAND', x: centerX + radius * 0.6, y: centerY + radius * 0.6 },
			{ start: Math.PI * 1.75, end: -Math.PI * 1.75, label: 'BREAKING\nWRIST DOWN', x: centerX, y: centerY + radius * 0.7 },
			{ start: -Math.PI * 1.75, end: -Math.PI * 1.25, label: 'JERKING', x: centerX - radius * 0.7, y: centerY + radius * 0.6 },
			{ start: -Math.PI * 1.25, end: -Math.PI * 0.75, label: 'SQUEEZING\nFINGER TIPS', x: centerX - radius * 0.6, y: centerY + radius * 0.3 },
			{ start: -Math.PI * 0.5, end: -Math.PI * 0.25, label: 'TOO MUCH/TOO LITTLE\nTRIGGER FINGER', x: centerX - radius * 0.6, y: centerY - radius * 0.2 }
		];
		
		// Draw pie segments with labels
		for (const segment of segments) {
			// Draw segment arc
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.arc(centerX, centerY, radius, segment.start, segment.end);
			ctx.closePath();
			ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // Light red
			ctx.fill();
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 1;
			ctx.stroke();
			
			// Draw label
			ctx.fillStyle = '#000000';
			ctx.font = 'bold 12px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			const lines = segment.label.split('\n');
			lines.forEach((line, i) => {
				ctx.fillText(line, segment.x, segment.y + (i - (lines.length - 1) / 2) * 14);
			});
		}
		
		// Draw "RIGHT HANDED SHOOTER" label at bottom
		ctx.fillStyle = '#000000';
		ctx.font = 'bold 14px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('RIGHT HANDED SHOOTER', centerX, centerY + radius + 30);
		
		// Restore context
		ctx.restore();
	}

	function drawDebugOverlay(ctx, width, height) {
		// Draw debug pixels that match detection criteria
		if (!window.debugPixels || window.debugPixels.length === 0) return;
		
		ctx.save();
		
		// Draw each matching pixel
		for (const pixel of window.debugPixels) {
			// Draw a small circle at matching pixels
			ctx.fillStyle = pixel.color === 'red' 
				? (pixel.matched ? 'rgba(255, 0, 0, 0.5)' : 'rgba(255, 100, 100, 0.3)')
				: (pixel.matched ? 'rgba(0, 255, 0, 0.5)' : 'rgba(100, 255, 100, 0.3)');
			ctx.beginPath();
			ctx.arc(pixel.x, pixel.y, 2, 0, Math.PI * 2);
			ctx.fill();
		}
		
		// Draw RGB info for the brightest matching pixel
		if (window.debugPixels.length > 0) {
			const brightest = window.debugPixels.reduce((max, p) => {
				const brightness = p.r + p.g + p.b;
				const maxBrightness = max.r + max.g + max.b;
				return brightness > maxBrightness ? p : max;
			});
			
			ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
			ctx.fillRect(10, 10, 200, 60);
			ctx.fillStyle = '#ffffff';
			ctx.font = '12px monospace';
			ctx.textAlign = 'left';
			ctx.fillText(`Debug Mode: ${window.debugPixels.length} pixels`, 15, 25);
			ctx.fillText(`RGB: (${brightest.r}, ${brightest.g}, ${brightest.b})`, 15, 40);
			ctx.fillText(`Pos: (${brightest.x}, ${brightest.y})`, 15, 55);
		}
		
		ctx.restore();
	}

	function drawOverlays(ctx, width, height) {
		// Clear canvas (video is redrawn each frame)
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(videoElement, 0, 0, width, height);

		// Draw diagnostic overlay if enabled (draw before target zones so it's behind)
		if (showDiagnosticOverlay) {
			drawDiagnosticOverlay(ctx, width, height);
		}

		// Draw debug overlay if enabled (shows detected pixels)
		if (showDebugOverlay) {
			drawDebugOverlay(ctx, width, height);

			// Draw ROI bounding box in debug mode
			if (targets.length > 0) {
				// We can re-calculate ROI here or pass it from processFrames if we refactor, 
				// but for debug drawing, let's just draw individual target boxes
				ctx.strokeStyle = 'cyan';
				ctx.lineWidth = 1;
				targets.forEach(t => {
					const bbox = getTargetBoundingBox(t.boundary);
					ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
				});
			}
		}

		// Draw target boundary and zones if calibrated
		if (targets.length > 0) {
			// Helper function to convert hex to rgba with opacity
			function hexToRgba(hex, opacity) {
				const r = parseInt(hex.slice(1, 3), 16);
				const g = parseInt(hex.slice(3, 5), 16);
				const b = parseInt(hex.slice(5, 7), 16);
				return `rgba(${r}, ${g}, ${b}, ${opacity})`;
			}

			// Iterate through all targets
			targets.forEach((target, index) => {
				const bbox = getTargetBoundingBox(target.boundary);
				const targetWidth = bbox.maxX - bbox.minX;
				const targetHeight = bbox.maxY - bbox.minY;

				// Draw grid overlay if grid mode (only for first target for now or if template applied)
				if (targetMode === 'preloaded' && templates[selectedTemplate]?.grid) {
					drawGridOverlay(ctx, target.boundary, templates[selectedTemplate].grid);
				}
				// Draw template zones if pre-loaded template
				else if (targetMode === 'preloaded' && templates[selectedTemplate]?.zones) {
					const template = templates[selectedTemplate];
					// Draw zones from outermost to innermost
					for (let i = template.zones.length - 1; i >= 0; i--) {
						const zone = template.zones[i];
						const rect = {
							x: bbox.minX + targetWidth * zone.normalized.minX,
							y: bbox.minY + targetHeight * zone.normalized.minY,
							width: targetWidth * (zone.normalized.maxX - zone.normalized.minX),
							height: targetHeight * (zone.normalized.maxY - zone.normalized.minY)
						};
						
						ctx.fillStyle = hexToRgba(zone.color, 0.2);
						ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
						
						// Draw zone label
						ctx.fillStyle = zone.color;
						ctx.font = 'bold 24px sans-serif';
						ctx.fillText(zone.name, rect.x + 10, rect.y + 30);
					}
				}
				// Draw custom zones
				else if (targetMode === 'custom') {
					// Draw zones from outermost to innermost (D → C → A)
					for (const zoneName of ['D', 'C', 'A']) {
						const zone = zones[zoneName];
						if (!zone) continue;
						
						const rect = {
							x: bbox.minX + targetWidth * zone.bounds.x[0],
							y: bbox.minY + targetHeight * zone.bounds.y[0],
							width: targetWidth * (zone.bounds.x[1] - zone.bounds.x[0]),
							height: targetHeight * (zone.bounds.y[1] - zone.bounds.y[0])
						};
						
						ctx.fillStyle = hexToRgba(zone.color, 0.2);
						ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
					}

					// Label
					ctx.fillStyle = '#ffffff';
					ctx.font = 'bold 16px sans-serif';
					ctx.fillText(target.name, bbox.minX + 5, bbox.minY + 20);
				}

				// Draw target boundary outline
				ctx.strokeStyle = '#00ff00';
				ctx.lineWidth = 2;
				ctx.setLineDash([5, 5]);
				ctx.beginPath();
				ctx.moveTo(target.boundary.x1, target.boundary.y1);
				ctx.lineTo(target.boundary.x2, target.boundary.y2);
				ctx.lineTo(target.boundary.x3, target.boundary.y3);
				ctx.lineTo(target.boundary.x4, target.boundary.y4);
				ctx.closePath();
				ctx.stroke();
				ctx.setLineDash([]);
			});
		}

		// Determine which hits to display (for replay mode)
		const now = Date.now();
		let visibleHits;
		
		if (visualizationState.showAllShots) {
			// Normal mode: show all hits that haven't expired
			visibleHits = hits.filter(hit => now < hit.displayUntil);
		} else {
			// Replay mode: show hits up to currentReplayShot, regardless of displayUntil
			visibleHits = hits.slice(0, visualizationState.currentReplayShot);
		}
		
		// Draw sequence lines BEFORE hit markers (so lines are behind)
		drawSequenceLines(ctx, visibleHits);
		
		// Draw hit markers with numbers
		// Skip expiry check in replay mode (showAllShots = false)
		const skipExpiryCheck = !visualizationState.showAllShots;
		for (const hit of visibleHits) {
			drawHitMarker(ctx, hit, skipExpiryCheck);
		}

		// Draw calibration points if in calibration mode
		if (calibrationMode) {
			ctx.fillStyle = '#ffff00';
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 2;
			for (const point of calibrationPoints) {
				ctx.beginPath();
				ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}

		// Draw zone calibration points if in zone calibration mode
		if (zoneCalibrationMode) {
			ctx.fillStyle = zones[zoneCalibrationMode].color;
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 2;
			for (const point of zoneCalibrationPoints) {
				ctx.beginPath();
				ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}
	}

	function isPointInBoundary(x, y, boundary) {
		// Simple point-in-polygon test using ray casting
		const points = [
			[boundary.x1, boundary.y1],
			[boundary.x2, boundary.y2],
			[boundary.x3, boundary.y3],
			[boundary.x4, boundary.y4]
		];

		let inside = false;
		for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
			const [xi, yi] = points[i];
			const [xj, yj] = points[j];
			const intersect =
				yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		return inside;
	}

	function getTargetBoundingBox(boundary) {
		// Get bounding box of the quadrilateral
		const minX = Math.min(boundary.x1, boundary.x2, boundary.x3, boundary.x4);
		const maxX = Math.max(boundary.x1, boundary.x2, boundary.x3, boundary.x4);
		const minY = Math.min(boundary.y1, boundary.y2, boundary.y3, boundary.y4);
		const maxY = Math.max(boundary.y1, boundary.y2, boundary.y3, boundary.y4);
		return { minX, maxX, minY, maxY };
	}

	function drawGridOverlay(ctx, boundary, grid) {
		const bbox = getTargetBoundingBox(boundary);
		const width = bbox.maxX - bbox.minX;
		const height = bbox.maxY - bbox.minY;
		const cellWidth = width / grid.cols;
		const cellHeight = height / grid.rows;
		
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
		ctx.lineWidth = 1;
		
		// Draw vertical lines
		for (let i = 0; i <= grid.cols; i++) {
			const x = bbox.minX + (i * cellWidth);
			ctx.beginPath();
			ctx.moveTo(x, bbox.minY);
			ctx.lineTo(x, bbox.maxY);
			ctx.stroke();
		}
		
		// Draw horizontal lines
		for (let i = 0; i <= grid.rows; i++) {
			const y = bbox.minY + (i * cellHeight);
			ctx.beginPath();
			ctx.moveTo(bbox.minX, y);
			ctx.lineTo(bbox.maxX, y);
			ctx.stroke();
		}
		
		// Draw cell labels
		ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.font = '12px sans-serif';
		
		for (let row = 0; row < grid.rows; row++) {
			for (let col = 0; col < grid.cols; col++) {
				const x = bbox.minX + (col * cellWidth) + 5;
				const y = bbox.minY + (row * cellHeight) + 15;
				const colLabel = String.fromCharCode(65 + col);
				const rowLabel = row + 1;
				ctx.fillText(`${colLabel}${rowLabel}`, x, y);
			}
		}
	}

	function normalizeHitCoordinates(x, y, boundary) {
		// Convert hit coordinates to normalized coordinates (0-1) relative to target boundary
		const bbox = getTargetBoundingBox(boundary);
		const width = bbox.maxX - bbox.minX;
		const height = bbox.maxY - bbox.minY;
		
		// Normalize relative to bounding box
		const normalizedX = (x - bbox.minX) / width;
		const normalizedY = (y - bbox.minY) / height;
		
		return { x: normalizedX, y: normalizedY };
	}

	function detectZone(x, y) {
		// Freeform mode: no zone detection, just return hit info
		if (targetMode === 'freeform') {
			return { zone: 'Hit', points: null, color: '#3b82f6' };
		}

		// Grid mode: detect grid cell
		if (targetMode === 'preloaded' && templates[selectedTemplate]?.grid) {
			// For grid mode, we assume single target for now
			if (targets.length > 0) {
				return getGridCellForHit(x, y, targets[0].boundary);
			}
		}

		if (targets.length === 0) {
			return { zone: 'Miss', points: 0, color: '#6b7280' };
		}

		// Iterate through all targets
		for (const target of targets) {
			const boundary = target.boundary;
			
			// Check if hit is within this target
			if (isPointInBoundary(x, y, boundary)) {
				
				// Pre-loaded template mode: use template zones
				if (targetMode === 'preloaded' && templates[selectedTemplate]?.zones) {
					const template = templates[selectedTemplate];
					const normalized = normalizeHitCoordinates(x, y, boundary);
					
					// Check zones from innermost to outermost
					for (const zone of template.zones) {
						if (
							normalized.x >= zone.normalized.minX &&
							normalized.x <= zone.normalized.maxX &&
							normalized.y >= zone.normalized.minY &&
							normalized.y <= zone.normalized.maxY
						) {
							return { zone: zone.name, points: zone.points, color: zone.color, targetId: target.id };
						}
					}
					// Hit the target but missed defined zones? Count as generic hit or miss?
					// For now, let's say if it's in the boundary but not a zone, it's a "D" or similar, but sticking to template logic:
					return { zone: 'Hit', points: 1, color: '#3b82f6', targetId: target.id };
				}

				// Custom mode: check zones from innermost to outermost (A → C → D)
				// If custom bounds exist, use point-in-polygon test, otherwise use normalized bounds
				if (targetMode === 'custom') {
					const normalized = normalizeHitCoordinates(x, y, boundary);
					
					for (const zoneName of ['A', 'C', 'D']) {
						const zone = zones[zoneName];
						if (!zone) continue;
						
						if (normalized.x >= zone.bounds.x[0] && normalized.x <= zone.bounds.x[1] &&
							normalized.y >= zone.bounds.y[0] && normalized.y <= zone.bounds.y[1]) {
							return { zone: zone.name, points: zone.points, color: zone.color, targetId: target.id };
						}
					}
					
					return { zone: target.name, points: 0, color: '#3b82f6', targetId: target.id };
				}
			}
		}

		return { zone: 'Miss', points: 0, color: '#6b7280' };
	}

	function handleCanvasClick(e) {
		const { x, y, event } = e.detail;
		
		// Prevent double-firing: debounce rapid events
		const now = Date.now();
		if (event.type === 'touchstart') {
			event.preventDefault();
			lastCalibrationClickTime = now;
		} else if (event.type === 'click') {
			if (now - lastCalibrationClickTime < CALIBRATION_CLICK_DEBOUNCE_MS) {
				event.preventDefault();
				return;
			}
			lastCalibrationClickTime = now;
		}
		
		if (zoneCalibrationMode) {
			handleZoneCalibrationClick(x, y);
		} else if (calibrationMode) {
			handleTargetCalibrationClick(x, y);
		}
	}

	function handleTargetCalibrationClick(x, y) {
		calibrationPoints = [...calibrationPoints, { x, y }];

		if (calibrationPoints.length === 4) {
			// Create new target
			const newTarget = {
				id: crypto.randomUUID(),
				name: `Target ${targets.length + 1}`,
				boundary: {
				x1: calibrationPoints[0].x,
				y1: calibrationPoints[0].y,
				x2: calibrationPoints[1].x,
				y2: calibrationPoints[1].y,
				x3: calibrationPoints[2].x,
				y3: calibrationPoints[2].y,
				x4: calibrationPoints[3].x,
					y4: calibrationPoints[3].y
				}
			};
			
			targets = [...targets, newTarget];
			calibrationMode = false;
			calibrationPoints = [];
			
			// Load template zones if pre-loaded mode
			if (targetMode === 'preloaded') {
				loadTemplateZones(selectedTemplate);
			}
		}
	}

	function handleZoneCalibrationClick(x, y) {
		if (!targetBoundary) return;

		zoneCalibrationPoints = [...zoneCalibrationPoints, { x, y }];

		if (zoneCalibrationPoints.length === 4) {
			// Store the zone boundary
			customZoneBounds[zoneCalibrationMode] = {
				x1: zoneCalibrationPoints[0].x,
				y1: zoneCalibrationPoints[0].y,
				x2: zoneCalibrationPoints[1].x,
				y2: zoneCalibrationPoints[1].y,
				x3: zoneCalibrationPoints[2].x,
				y3: zoneCalibrationPoints[2].y,
				x4: zoneCalibrationPoints[3].x,
				y4: zoneCalibrationPoints[3].y
			};

			// Convert to normalized coordinates relative to target boundary
			convertZoneBoundsToNormalized(zoneCalibrationMode);

			// Move to next zone or finish
			const zoneOrder = ['A', 'C', 'D'];
			const currentIndex = zoneOrder.indexOf(zoneCalibrationMode);
			if (currentIndex < zoneOrder.length - 1) {
				zoneCalibrationMode = zoneOrder[currentIndex + 1];
				zoneCalibrationPoints = [];
			} else {
				zoneCalibrationMode = null;
				zoneCalibrationPoints = [];
			}
		}
	}

	function convertZoneBoundsToNormalized(zoneName) {
		if (!targetBoundary || !customZoneBounds[zoneName]) return;

		const zoneBounds = customZoneBounds[zoneName];
		const targetBbox = getTargetBoundingBox(targetBoundary);
		const zoneBbox = getTargetBoundingBox(zoneBounds);

		// Normalize relative to target boundary
		const targetWidth = targetBbox.maxX - targetBbox.minX;
		const targetHeight = targetBbox.maxY - targetBbox.minY;

		zones[zoneName].bounds.x[0] = (zoneBbox.minX - targetBbox.minX) / targetWidth;
		zones[zoneName].bounds.x[1] = (zoneBbox.maxX - targetBbox.minX) / targetWidth;
		zones[zoneName].bounds.y[0] = (zoneBbox.minY - targetBbox.minY) / targetHeight;
		zones[zoneName].bounds.y[1] = (zoneBbox.maxY - targetBbox.minY) / targetHeight;

		// Ensure values are within 0-1 range
		zones[zoneName].bounds.x[0] = Math.max(0, Math.min(1, zones[zoneName].bounds.x[0]));
		zones[zoneName].bounds.x[1] = Math.max(0, Math.min(1, zones[zoneName].bounds.x[1]));
		zones[zoneName].bounds.y[0] = Math.max(0, Math.min(1, zones[zoneName].bounds.y[0]));
		zones[zoneName].bounds.y[1] = Math.max(0, Math.min(1, zones[zoneName].bounds.y[1]));

		zones = { ...zones }; // Trigger reactivity
	}

	function startZoneCalibration() {
		if (!targetBoundary) {
			alert('Please calibrate the target boundary first!');
			return;
		}
		zoneCalibrationMode = 'A';
		zoneCalibrationPoints = [];
		customZoneBounds = { A: null, C: null, D: null };
	}

	function cancelZoneCalibration() {
		zoneCalibrationMode = null;
		zoneCalibrationPoints = [];
	}

	function loadTemplateZones(templateId) {
		const template = templates[templateId];
		if (!template || !template.zones || template.zones.length === 0) return;
		
		// Convert template zones to the zones format
		const newZones = {};
		for (const zone of template.zones) {
			newZones[zone.name] = {
				name: zone.name,
				points: zone.points,
				color: zone.color,
				bounds: {
					x: [zone.normalized.minX, zone.normalized.maxX],
					y: [zone.normalized.minY, zone.normalized.maxY]
				}
			};
		}
		zones = newZones;
		customZoneBounds = { A: null, C: null, D: null };
	}

	function getGridCellForHit(x, y, boundary) {
		if (!boundary || !targetBoundary) {
			return { name: 'Miss', points: null, color: '#6b7280' };
		}

		// Check if hit is within target boundary
		if (!isPointInBoundary(x, y, boundary)) {
			return { name: 'Miss', points: null, color: '#6b7280' };
		}

		const template = templates[selectedTemplate];
		if (!template || !template.grid) {
			return { name: 'Miss', points: null, color: '#6b7280' };
		}

		const normalized = normalizeHitCoordinates(x, y, boundary);
		const grid = template.grid;
		
		const col = Math.min(Math.floor(normalized.x * grid.cols), grid.cols - 1);
		const row = Math.min(Math.floor(normalized.y * grid.rows), grid.rows - 1);
		
		// Convert to battleship-style notation (A1, B2, C5, etc.)
		const colLabel = String.fromCharCode(65 + col); // A, B, C...
		const rowLabel = row + 1; // 1, 2, 3...
		
		return {
			name: `${colLabel}${rowLabel}`,
			points: null,
			color: '#3b82f6', // blue for grids
			cell: { row, col }
		};
	}

	// Drawer control helpers

	function startCalibration() {
		calibrationMode = true;
		calibrationPoints = [];
	}

	function clearCalibration() {
		targets = [];
		calibrationPoints = [];
		calibrationMode = false;
		customZoneBounds = { A: null, C: null, D: null };
		zoneCalibrationMode = null;
		zoneCalibrationPoints = [];
	}

	async function toggleFullscreen() {
		if (!browser) return;
		
		const cameraViewport = document.querySelector('.camera-viewport-container');
		if (!cameraViewport) return;
		
		try {
			if (!document.fullscreenElement) {
				// Enter fullscreen
				await cameraViewport.requestFullscreen();
				isFullscreen = true;
			} else {
				// Exit fullscreen
				await document.exitFullscreen();
				isFullscreen = false;
			}
		} catch (error) {
			console.error('Error toggling fullscreen:', error);
			// Fallback: try on document element
			try {
				if (!document.fullscreenElement) {
					await document.documentElement.requestFullscreen();
					isFullscreen = true;
				} else {
					await document.exitFullscreen();
					isFullscreen = false;
				}
			} catch (fallbackError) {
				console.error('Fallback fullscreen failed:', fallbackError);
			}
		}
	}

	// Listen for fullscreen changes (user might exit via ESC key)
	function handleFullscreenChange() {
		if (browser) {
			isFullscreen = !!document.fullscreenElement;
		}
	}

	function clearHits() {
		hits = [];
		lastHitTime = 0;
		sessionShotCounter = 0; // Reset shot counter
		visualizationState.currentReplayShot = 0;
		visualizationState = { ...visualizationState }; // Trigger reactivity
	}

	function formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 1
		});
	}

	function getRelativeTime(timestamp) {
		const now = Date.now();
		const seconds = ((now - timestamp) / 1000).toFixed(1);
		return `${seconds}s ago`;
	}

	function calculateScore() {
		// For freeform mode, no scoring
		if (targetMode === 'freeform') {
			const avgX = hits.length > 0 ? hits.reduce((sum, h) => sum + h.x, 0) / hits.length : 0;
			const avgY = hits.length > 0 ? hits.reduce((sum, h) => sum + h.y, 0) / hits.length : 0;
			return { 
				total: null, 
				breakdown: null,
				averagePosition: { x: avgX, y: avgY }
			};
		}

		// For grid mode, count by cell
		if (targetMode === 'preloaded' && templates[selectedTemplate]?.grid) {
			const cellCounts = {};
			for (const hit of hits) {
				const cell = hit.zone || 'Unknown';
				cellCounts[cell] = (cellCounts[cell] || 0) + 1;
			}
			return { total: null, breakdown: null, cellCounts };
		}

		// For zone-based modes
		const total = hits.reduce((sum, hit) => sum + (hit.points || 0), 0);
		const breakdown = {
			A: { count: 0, points: 0 },
			C: { count: 0, points: 0 },
			D: { count: 0, points: 0 },
			Miss: { count: 0, points: 0 }
		};

		for (const hit of hits) {
			const zone = hit.zone || 'Miss';
			if (breakdown[zone]) {
				breakdown[zone].count++;
				breakdown[zone].points += hit.points || 0;
			}
		}

		return { total, breakdown };
	}

	function getZoneColor(zone) {
		if (!zone) return '#9ca3af';
		
		// Grid cells (e.g., "A1", "B2", "C5")
		if (/^[A-Z]\d+$/.test(zone)) {
			return '#3b82f6'; // blue for grids
		}
		
		switch (zone) {
			case 'A':
				return zones.A?.color || '#4ade80';
			case 'C':
				return zones.C?.color || '#fbbf24';
			case 'D':
				return zones.D?.color || '#f87171';
			case 'Hit':
				return '#3b82f6';
			default:
				return '#9ca3af'; // gray for Miss
		}
	}

	function resetZonesToDefaults() {
		zones = JSON.parse(JSON.stringify(DEFAULT_ZONES));
		customZoneBounds = { A: null, C: null, D: null };
	}

	function takeBackgroundSnapshot() {
		if (!videoElement) return;
		const tempCanvas = document.createElement('canvas');
		const tempCtx = tempCanvas.getContext('2d');
		const width = videoElement.videoWidth;
		const height = videoElement.videoHeight;
		tempCanvas.width = width;
		tempCanvas.height = height;
		tempCtx.drawImage(videoElement, 0, 0, width, height);
		backgroundSnapshot = tempCtx.getImageData(0, 0, width, height);
		console.log('Background snapshot taken.');
	}

	// Shot Timer Functions
	function getAudioContext() {
		if (!audioContext) {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
		}
		return audioContext;
	}

	function playStartBeep() {
		try {
			const ctx = getAudioContext();
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();
			
			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);
			
			oscillator.type = 'sine';
			oscillator.frequency.value = shotTimerConfig.beepFrequency;
			gainNode.gain.value = shotTimerConfig.beepVolume;
			
			oscillator.start(ctx.currentTime);
			oscillator.stop(ctx.currentTime + 0.1); // 100ms beep
		} catch (error) {
			console.error('Error playing beep:', error);
		}
	}

	function playClickSound() {
		try {
			const ctx = getAudioContext();
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);

			// Mechanical click sound (square wave, fast decay)
			oscillator.type = 'square';
			oscillator.frequency.setValueAtTime(800, ctx.currentTime); // Higher pitch start for better audibility
			oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);

			gainNode.gain.setValueAtTime(1.0, ctx.currentTime); // Max volume
			gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

			oscillator.start(ctx.currentTime);
			oscillator.stop(ctx.currentTime + 0.05);
		} catch (error) {
			console.error('Error playing click:', error);
		}
	}

	function speak(text, callback) {
		if (!browser || !window.speechSynthesis) return;
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.rate = 1.1;
		if (callback) utterance.onend = callback;
		window.speechSynthesis.speak(utterance);
	}

	async function startDrill() {
		
		// If starting a new session (no reps or session was completed), reset round counter
		if (shotTimerSession.reps.length === 0 || 
		    (shotTimerConfig.autoNextRound && currentRound >= shotTimerConfig.roundCount)) {
			currentRound = 0;
		}
		
		// Increment round counter
		currentRound++;
		
		// Check if we've reached the round limit
		if (shotTimerConfig.autoNextRound && currentRound > shotTimerConfig.roundCount) {
			// Session complete
			currentRound = shotTimerConfig.roundCount;
			shotTimerActive = false;
			shotTimerPhase = 'idle';
			return;
		}
		
		// Reset state
		shotTimerActive = true;
		shotTimerPhase = 'waiting';
		shotTimerStartTime = null;
		shotTimerFirstHitTime = null;
		waitingForClear = false;
		
		// Calculate random delay
		const delayRange = shotTimerConfig.randomDelayMax - shotTimerConfig.randomDelayMin;
		const delay = shotTimerConfig.randomDelayMin + (Math.random() * delayRange);
		
		console.log(`Round ${currentRound}/${shotTimerConfig.roundCount} - Random delay: ${(delay / 1000).toFixed(2)}s`);
		
		if (shotTimerConfig.drillType === 'callout') {
			if (targets.length < 1) {
				alert("You need at least one target for Call-Out drills.");
				cancelDrill();
				return;
			}

			// Pick random target
			const target = targets[Math.floor(Math.random() * targets.length)];
			tempDrillData = { callOutTargetId: target.id, callOutTargetName: target.name };

			// Sequence: Shooter Ready -> Standby -> [Target Name]
			speak("Shooter Ready", () => {
				if (!shotTimerActive) return;
				setTimeout(() => {
					if (!shotTimerActive) return;
					speak("Standby", () => {
						if (!shotTimerActive) return;
						setTimeout(() => {
							if (!shotTimerActive) return;
							speak(target.name);
							shotTimerStartTime = performance.now();
							shotTimerPhase = 'active';
							console.log(`Call-out started: ${target.name}`);
						}, delay);
					});
				}, 1000);
			});
		} else {
			// Wait for random delay
			shotTimerDelayTimeout = setTimeout(() => {
				// Check if drill was cancelled during delay
				if (!shotTimerActive) return;
				
				// Play start beep
				playStartBeep();
				
				// Mark start time
				shotTimerStartTime = performance.now();
				shotTimerPhase = 'active';
				
				console.log('Timer started - waiting for first hit');
			}, delay);
		}
	}

	function cancelDrill() {
		if (shotTimerDelayTimeout) {
			clearTimeout(shotTimerDelayTimeout);
			shotTimerDelayTimeout = null;
		}
		if (shotTimerAutoNextTimeout) {
			clearTimeout(shotTimerAutoNextTimeout);
			shotTimerAutoNextTimeout = null;
		}
		if (browser && window.speechSynthesis) window.speechSynthesis.cancel();
		shotTimerActive = false;
		shotTimerPhase = 'idle';
		shotTimerStartTime = null;
		shotTimerFirstHitTime = null;
		shotTimerCooldownUntil = null; // Reset cooldown on cancel
		waitingForClear = false;
		autoNextCountdown = null; // Reset countdown on cancel
		tempDrillData = {}; // Reset temp data
		console.log('Drill cancelled');
	}

	function handleTimerHit(hit) {
		// Check for false start (hit before beep)
		if (shotTimerPhase === 'waiting') {
			console.warn('False start detected - hit before beep!');
			alert('False start! Wait for the beep before shooting.');
			return false; // Don't count this hit
		}

		if (shotTimerConfig.drillType === 'reload') {
			return handleReloadDrillHit(hit);
		} else if (shotTimerConfig.drillType === 'callout') {
			return handleCallOutDrillHit(hit);
		} else {
			return handleDrawDrillHit(hit);
		}
	}

	function handleDrawDrillHit(hit) {
		// Check if this is the first hit
		if (shotTimerPhase === 'active' && shotTimerFirstHitTime === null) {
			// Malfunction Logic
			if (shotTimerConfig.malfunctionMode && !waitingForClear) {
				// Prevent more than 2 malfunctions in a row
				const forceSafe = consecutiveMalfunctions >= 2;
				
				if (!forceSafe && Math.random() < shotTimerConfig.malfunctionProbability) {
					playClickSound();
					waitingForClear = true;
					consecutiveMalfunctions++;
					console.log('MALFUNCTION! CLEAR IT!');
					return true; // Hit consumed, timer continues
				}
				consecutiveMalfunctions = 0;
			}

			const isMalfunctionClear = waitingForClear;
			if (waitingForClear) waitingForClear = false;

			// Record hit time
			shotTimerFirstHitTime = performance.now() - shotTimerStartTime;
			shotTimerPhase = 'complete';
			
			// Store rep result
			const repResult = {
				id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				timestamp: Date.now(),
				drillType: 'draw',
				drawTime: shotTimerFirstHitTime,
				hit: {
					x: hit.x,
					y: hit.y,
					zone: hit.zone,
					points: hit.points,
					zoneColor: hit.zoneColor
				},
				falseStart: false,
				isMalfunction: isMalfunctionClear
			};
			
			shotTimerSession.reps = [...shotTimerSession.reps, repResult];
			
			console.log(`Draw time: ${(repResult.drawTime / 1000).toFixed(3)}s, Zone: ${hit.zone}`);
			
			// Set cooldown period (ignore hits for 1 second after timer stops)
			shotTimerCooldownUntil = performance.now() + 1000;
			
			// Timer is no longer active (drill complete)
			shotTimerActive = false;
			
			handleAutoNext();
			
			return true; // Hit was consumed by timer
		}
		
		return false; // Hit not consumed
	}

	function handleReloadDrillHit(hit) {
		if (shotTimerPhase === 'active') {
			// Malfunction Logic (only on first shot)
			if (shotTimerConfig.malfunctionMode && !waitingForClear) {
				// Prevent more than 2 malfunctions in a row
				const forceSafe = consecutiveMalfunctions >= 2;

				if (!forceSafe && Math.random() < shotTimerConfig.malfunctionProbability) {
					playClickSound();
					waitingForClear = true;
					consecutiveMalfunctions++;
					console.log('MALFUNCTION! CLEAR IT!');
					return true;
				}
				consecutiveMalfunctions = 0;
			}

			const isMalfunctionClear = waitingForClear;
			if (waitingForClear) waitingForClear = false;

			// First shot (Draw)
			const now = performance.now();
			shotTimerFirstHitTime = now - shotTimerStartTime;

			tempDrillData = {
				shot1: {
					time: shotTimerFirstHitTime,
					hit: { ...hit },
					isMalfunction: isMalfunctionClear
				}
			};

			shotTimerPhase = 'reloading';
			console.log(`Shot 1: ${(shotTimerFirstHitTime / 1000).toFixed(3)}s. RELOAD!`);
			return true;
		} else if (shotTimerPhase === 'reloading') {
			// Second shot (Reload + Fire)
			const now = performance.now();
			const totalTime = now - shotTimerStartTime;

			shotTimerPhase = 'complete';

			const repResult = {
				id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				timestamp: Date.now(),
				drillType: 'reload',
				drawTime: tempDrillData.shot1.time, // First shot time
				reloadTime: totalTime - tempDrillData.shot1.time, // Split time
				totalTime: totalTime, // Total time
				hits: [
					tempDrillData.shot1.hit,
					{
						x: hit.x,
						y: hit.y,
						zone: hit.zone,
						points: hit.points,
						zoneColor: hit.zoneColor
					}
				],
				// For backward compatibility with stats panel (which uses hit and drawTime)
				hit: hit, // Last hit
				falseStart: false,
				isMalfunction: tempDrillData.shot1.isMalfunction
			};

			shotTimerSession.reps = [...shotTimerSession.reps, repResult];

			console.log(`Reload Drill Complete. Total: ${(totalTime / 1000).toFixed(3)}s`);

			shotTimerCooldownUntil = performance.now() + 1000;
			shotTimerActive = false;
			tempDrillData = {};

			handleAutoNext();

			return true;
		}

		return false;
	}

	function handleCallOutDrillHit(hit) {
		if (shotTimerPhase === 'active') {
			// Record hit time
			shotTimerFirstHitTime = performance.now() - shotTimerStartTime;
			shotTimerPhase = 'complete';

			const isWrongTarget = hit.targetId !== tempDrillData.callOutTargetId;
			
			// Store rep result
			const repResult = {
				id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				timestamp: Date.now(),
				drillType: 'callout',
				drawTime: shotTimerFirstHitTime,
				calledTarget: tempDrillData.callOutTargetName,
				hit: {
					x: hit.x,
					y: hit.y,
					zone: hit.zone,
					points: hit.points,
					zoneColor: hit.zoneColor
				},
				falseStart: false,
				isFailure: isWrongTarget,
				isMalfunction: false
			};
			
			shotTimerSession.reps = [...shotTimerSession.reps, repResult];
			
			console.log(`Call-out time: ${(repResult.drawTime / 1000).toFixed(3)}s, Target: ${hit.zone}, Result: ${isWrongTarget ? 'FAIL' : 'PASS'}`);
			
			shotTimerCooldownUntil = performance.now() + 1000;
			shotTimerActive = false;
			tempDrillData = {};
			
			handleAutoNext();
			return true;
		}
		return false;
	}

	function handleAutoNext() {
		// Check if we should auto-advance to next round
		if (shotTimerConfig.autoNextRound && currentRound < shotTimerConfig.roundCount) {
			// Set up countdown
			const countdownStart = performance.now();
			autoNextCountdown = shotTimerConfig.resetDuration;

			// Update countdown every 100ms
			const countdownInterval = setInterval(() => {
				const elapsed = performance.now() - countdownStart;
				const remaining = Math.max(0, shotTimerConfig.resetDuration - elapsed);
				autoNextCountdown = remaining;

				if (remaining <= 0) {
					clearInterval(countdownInterval);
					autoNextCountdown = null;
				}
			}, 100);

			// Schedule automatic next round after reset duration
			shotTimerAutoNextTimeout = setTimeout(() => {
				clearInterval(countdownInterval);
				autoNextCountdown = null;
				nextRep();
			}, shotTimerConfig.resetDuration);
		} else {
			autoNextCountdown = null;
		}
	}

	function nextRep() {
		shotTimerCooldownUntil = null; // Reset cooldown
		autoNextCountdown = null; // Reset countdown
		if (shotTimerAutoNextTimeout) {
			clearTimeout(shotTimerAutoNextTimeout);
			shotTimerAutoNextTimeout = null;
		}
		startDrill();
	}

	function startSession() {
		shotTimerSession = {
			reps: [],
			startedAt: Date.now()
		};
		currentRound = 0; // Reset round counter (will be incremented in startDrill)
		consecutiveMalfunctions = 0; // Reset malfunction streak
		shotTimerCooldownUntil = null; // Reset cooldown
		if (shotTimerAutoNextTimeout) {
			clearTimeout(shotTimerAutoNextTimeout);
			shotTimerAutoNextTimeout = null;
		}
		startDrill();
	}

	function exportShotPattern() {
		if (!browser || !canvasElement || !videoElement) return;
		
		// Create a clean canvas with just the target and shots
		const exportCanvas = document.createElement('canvas');
		exportCanvas.width = videoElement.videoWidth || canvasElement.width;
		exportCanvas.height = videoElement.videoHeight || canvasElement.height;
		const ctx = exportCanvas.getContext('2d');
		
		// Draw current video frame as background
		if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
			ctx.drawImage(videoElement, 0, 0, exportCanvas.width, exportCanvas.height);
		} else {
			// Fallback: draw black background
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
		}
		
		// Draw target overlay if calibrated
		if (targetBoundary) {
			const bbox = getTargetBoundingBox(targetBoundary);
			const targetWidth = bbox.maxX - bbox.minX;
			const targetHeight = bbox.maxY - bbox.minY;
			
			// Draw zones
			if (targetMode === 'preloaded' && templates[selectedTemplate]?.zones) {
				const template = templates[selectedTemplate];
				for (let i = template.zones.length - 1; i >= 0; i--) {
					const zone = template.zones[i];
					const rect = {
						x: bbox.minX + targetWidth * zone.normalized.minX,
						y: bbox.minY + targetHeight * zone.normalized.minY,
						width: targetWidth * (zone.normalized.maxX - zone.normalized.minX),
						height: targetHeight * (zone.normalized.maxY - zone.normalized.minY)
					};
					
					function hexToRgba(hex, opacity) {
						const r = parseInt(hex.slice(1, 3), 16);
						const g = parseInt(hex.slice(3, 5), 16);
						const b = parseInt(hex.slice(5, 7), 16);
						return `rgba(${r}, ${g}, ${b}, ${opacity})`;
					}
					
					ctx.fillStyle = hexToRgba(zone.color, 0.2);
					ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
				}
			}
			
			// Draw target boundary outline
			ctx.strokeStyle = '#00ff00';
			ctx.lineWidth = 2;
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			ctx.moveTo(targetBoundary.x1, targetBoundary.y1);
			ctx.lineTo(targetBoundary.x2, targetBoundary.y2);
			ctx.lineTo(targetBoundary.x3, targetBoundary.y3);
			ctx.lineTo(targetBoundary.x4, targetBoundary.y4);
			ctx.closePath();
			ctx.stroke();
			ctx.setLineDash([]);
		}
		
		// Draw sequence lines
		drawSequenceLines(ctx, hits);
		
		// Draw hit markers
		hits.forEach(hit => drawHitMarker(ctx, hit));
		
		// Add session info overlay
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(10, 10, 250, 100);
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 16px sans-serif';
		ctx.fillText(`Shots: ${hits.length}`, 20, 35);
		ctx.fillText(`Date: ${new Date().toLocaleDateString()}`, 20, 60);
		
		if (targetMode === 'preloaded') {
			ctx.fillText(`Target: ${templates[selectedTemplate]?.name || 'Unknown'}`, 20, 85);
		}
		
		// Download as PNG
		exportCanvas.toBlob(blob => {
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `shot-pattern-${Date.now()}.png`;
			a.click();
			URL.revokeObjectURL(url);
		});
	}

	function startOnboarding() {
		driverObj = driver(driverConfig);

		if (!isSetupComplete) {
			// Phase 1: Setup
			driverObj.setSteps([
				{ 
					element: '#setup-container', 
					popover: { 
						title: 'Welcome to Dry-Fire Trainer', 
						description: 'Let\'s get your range set up. Select your target mode above, then click Continue to start the camera.',
						showButtons: [] // Hide buttons to force interaction with the UI
					} 
				}
			]);
			driverObj.drive();
		} else {
			// Phase 2: Active (resumed after setup)
			startActiveOnboarding();
		}
	}

	function startActiveOnboarding() {
		// Wait for DOM to update
		setTimeout(() => {
			if (!driverObj) driverObj = driver(driverConfig);
			
			driverObj.setSteps([
				{
					element: '#btn-calibrate',
					popover: {
						title: 'Calibrate Target',
						description: 'Click here to define your target area. You will tap the 4 corners of your target.'
					}
				},
				{
					element: '#btn-set-background',
					popover: {
						title: 'Environmental Nulling',
						description: 'If you have false positives from lights or reflections, use this to ignore the static background.'
					}
				},
				{
					element: '#btn-drills',
					popover: {
						title: 'Start Training',
						description: 'Open the Drills panel to select a drill and start your session.'
					}
				}
			]);
			driverObj.drive();
		}, 500);
	}
		function loadSettings() {
		if (!browser) return;
		
		try {
			const savedConfig = localStorage.getItem('shotTimerConfig');
			if (savedConfig) shotTimerConfig = { ...shotTimerConfig, ...JSON.parse(savedConfig) };
			
			const savedVis = localStorage.getItem('visualizationState');
			if (savedVis) visualizationState = { ...visualizationState, ...JSON.parse(savedVis) };
			
			const savedSession = localStorage.getItem('shotTimerSession');
			if (savedSession) {
				const session = JSON.parse(savedSession);
				// Only restore if it has reps, otherwise start fresh
				if (session.reps && session.reps.length > 0) {
					shotTimerSession = session;
					// Ensure timer is idle when restoring
					shotTimerPhase = 'idle';
					shotTimerActive = false;
				}
			}
		} catch (e) {
			console.error('Error loading settings:', e);
		}
	}

	function resetApp() {
		if (!browser) return;
		if (confirm('Reset all settings and data? This will clear your current session and preferences.')) {
			localStorage.clear();
			location.reload();
		}
	}

	$effect(() => {
		if (browser) {
			localStorage.setItem('shotTimerConfig', JSON.stringify(shotTimerConfig));
			localStorage.setItem('visualizationState', JSON.stringify(visualizationState));
			localStorage.setItem('shotTimerSession', JSON.stringify(shotTimerSession));
		}
	});

	onMount(() => {
		// Don't auto-start camera - let user start it manually
		
		// Listen for fullscreen changes (only in browser)
		if (browser) {
			document.addEventListener('fullscreenchange', handleFullscreenChange);
			document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
			document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
			document.addEventListener('MSFullscreenChange', handleFullscreenChange); // IE/Edge
		}

		// Check for first-time user
		if (browser) {
			if (!localStorage.getItem('tour_seen')) {
				startOnboarding();
			} else {
				tourSeen = true;
				loadSettings();
			}
		}
	});

	onDestroy(() => {
		stopCamera();
		
		// Remove fullscreen listeners (only in browser)
		if (browser) {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
			document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
			document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
		}
	});
</script>

<svelte:head>
	<title>Dry-Fire Trainer</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Header -->
	<Header on:help={startOnboarding} />

	<main class="flex-1 flex flex-col p-4 pb-36 space-y-4 max-w-7xl mx-auto w-full">
		{#if !isSetupComplete}
			<!-- Setup Mode -->
			<div class="space-y-4 animate-fade-in" id="setup-container">
				<!-- Target Mode Selector -->
				<TargetSetup
					bind:targetMode
					bind:selectedTemplate
					{isStreaming}
					on:complete={async () => {
							isSetupComplete = true;
							showTargetModeSelection = false;
							// Start camera if not already streaming
							if (!isStreaming) {
								await startCamera();
							}
							// Auto-start calibration if needed (unless freeform mode)
							if (isStreaming && !targetBoundary && targetMode !== 'freeform') {
								startCalibration();
							}
							// Continue onboarding if active
							if (driverObj && driverObj.isActive()) {
								driverObj.destroy(); // Close current step
								startActiveOnboarding(); // Start next phase
							}
						}}
				/>

				<!-- Camera Preview (Setup Mode) -->
				<div class="relative w-full bg-card rounded-xl overflow-hidden border border-border aspect-[4/3]">
					<div class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-card via-background to-card">
						{#if !isStreaming}
							<div class="text-center space-y-4 p-8">
								<div class="w-16 h-16 mx-auto rounded-full bg-secondary/50 flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
									<svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
									</svg>
								</div>
								<div>
									<p class="text-muted-foreground text-sm font-medium">Camera inactive</p>
									<p class="text-muted-foreground/60 text-xs mt-1">Tap Start to begin</p>
								</div>
								<button
									onclick={startCamera}
									class="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 mx-auto"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									Start
								</button>
							</div>
						{:else}
							<div class="absolute inset-0 flex items-center justify-center">
								<div class="text-center space-y-3">
									<div class="relative">
										<div class="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/30">
											<div class="w-3 h-3 rounded-full bg-primary pulse-active"></div>
										</div>
										<div class="absolute inset-0 flex items-center justify-center">
											<div class="w-12 h-12 rounded-full border-2 border-primary/20 pulse-active"></div>
										</div>
									</div>
									<p class="text-muted-foreground text-sm font-medium">Camera feed active</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Active Training Mode -->
			<div class="space-y-4 animate-fade-in">
				<CameraStage
					bind:videoElement
					bind:canvasElement
					stream={videoStream}
					{isStreaming}
					{isSetupComplete}
					{calibrationMode}
					{calibrationPoints}
					{zoneCalibrationMode}
					{zoneCalibrationPoints}
					{zones}
					{targets}
					{waitingForClear}
					callOutTarget={shotTimerActive && shotTimerConfig.drillType === 'callout' && shotTimerPhase === 'active' ? tempDrillData.callOutTargetName : null}
					hasBackground={!!backgroundSnapshot}
					bind:isFullscreen
					on:canvasClick={handleCanvasClick}
					on:startCamera={startCamera}
					on:stopCamera={stopCamera}
					on:toggleFullscreen={toggleFullscreen}
					on:cancelZoneCalibration={cancelZoneCalibration}
					on:toggleBackground={() => {
						if (backgroundSnapshot) {
							backgroundSnapshot = null;
							console.log('Background snapshot cleared.');
						} else {
							takeBackgroundSnapshot();
						}
					}}
				/>
	
				<!-- Status Pills -->
				<div class="flex flex-wrap items-center justify-center gap-2">
					<StatusPills {isStreaming} {hits} {targets} {backgroundSnapshot} />
				</div>

				<!-- Hits List -->
				<HitsList {hits} />
					</div>
				{/if}
	</main>

	<!-- Bottom Action Bar -->
	{#if isSetupComplete}
		<ActionBar
			{calibrationMode}
			{isStreaming}
			{targets}
			{hits}
			bind:showZoneSettings
			bind:showDrills
			bind:showVisualizationControls
			bind:showDiagnosticOverlay
			bind:showDebugOverlay
			bind:zones
			bind:shotTimerConfig
			bind:visualizationState
			shotTimerActive={shotTimerActive}
			shotTimerPhase={shotTimerPhase}
			shotTimerSession={shotTimerSession}
			currentRound={currentRound}
			autoNextCountdown={autoNextCountdown}
			shotTimerStartTime={shotTimerStartTime}
			timerDisplayUpdate={timerDisplayUpdate}
			on:startCalibration={startCalibration}
			on:clearCalibration={clearCalibration}
			on:removeTarget={(e) => removeTarget(e.detail)}
			on:renameTarget={(e) => renameTarget(e.detail.id, e.detail.name)}
			on:resetSetup={() => (isSetupComplete = false)}
			on:clearHits={clearHits}
			on:resetZones={resetZonesToDefaults}
			on:startDrill={shotTimerSession.reps.length === 0 ? startSession : startDrill}
			on:cancelDrill={cancelDrill}
			on:nextRep={nextRep}
			on:endSession={() => {
				shotTimerSession = { reps: [], startedAt: null };
				shotTimerPhase = 'idle';
			}}
			on:export={exportShotPattern}
			on:help={startOnboarding}
			on:resetApp={resetApp}
		/>
	{/if}

	<!-- Zone Settings Panel - Desktop (side panel) -->
				{#if showZoneSettings}
		<div class="hidden md:block fixed top-0 right-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto">
			<div class="p-6 h-full">
				<ZoneSettingsPanel
					bind:zones
					mobile={false}
					on:close={() => (showZoneSettings = false)}
					on:reset={resetZonesToDefaults}
				/>
			</div>
		</div>
	{/if}
							
	<!-- Shot Timer Panel - Desktop (side panel) -->
	{#if showDrills}
		<div class="hidden md:block fixed top-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto" style="right: {showZoneSettings ? '384px' : '0'}">
			<div class="p-6 h-full">
				<DrillsPanel
					mobile={false}
					active={shotTimerActive}
					phase={shotTimerPhase}
					bind:config={shotTimerConfig}
					session={shotTimerSession}
					{currentRound}
					{autoNextCountdown}
					startTime={shotTimerStartTime}
					{timerDisplayUpdate}
					on:start={shotTimerSession.reps.length === 0 ? startSession : startDrill}
					on:cancel={cancelDrill}
					on:next={nextRep}
					on:end={() => {
						shotTimerSession = { reps: [], startedAt: null };
						shotTimerPhase = 'idle';
					}}
					on:close={() => (showDrills = false)}
				/>
			</div>
		</div>
	{/if}

	<!-- Shot Sequence Visualization Panel - Desktop (side panel) -->
	{#if showVisualizationControls}
		<div class="hidden md:block fixed top-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto" style="right: {(showZoneSettings ? 384 : 0) + (showDrills ? 384 : 0)}px">
			<div class="p-6 h-full">
				<VisualizationPanel
					mobile={false}
					bind:visualizationState
					{hits}
					on:close={() => (showVisualizationControls = false)}
					on:export={exportShotPattern}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Mobile-specific styles */
	.camera-feed {
		width: 100%;
		height: 100%;
		position: relative;
	}
	
	.camera-feed video,
	.camera-feed canvas {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	
	/* Status Badges */
	.status-badge {
		display: inline-block;
		padding: 6px 12px;
		border-radius: 20px;
		font-size: 12px;
		font-weight: 600;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		backdrop-filter: blur(10px);
	}
	
	.status-badge.success {
		background: rgba(34, 197, 94, 0.9);
	}
	
	.status-badge.warning {
		background: rgba(251, 191, 36, 0.9);
	}
	
	.status-badge.active {
		background: rgba(59, 130, 246, 0.9);
		animation: pulse 2s ease-in-out infinite;
	}
	
	.status-badge.info {
		background: rgba(99, 102, 241, 0.9);
	}
	
	.status-badge.zoom-reset {
		background: rgba(139, 92, 246, 0.9);
		cursor: pointer;
		pointer-events: auto;
	}
	
	.status-badge.zoom-reset:active {
		transform: scale(0.95);
	}
	
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}
	
	/* Floating Action Buttons */
	.fab {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: none;
		font-size: 24px;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: transform 0.2s, box-shadow 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.fab:active {
		transform: scale(0.95);
	}
	
	.fab.primary {
		background: #3b82f6;
		color: white;
	}
	
	.fab.secondary {
		background: #8b5cf6;
		color: white;
	}
	
	/* Quick Actions Grid */
	.quick-actions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin-bottom: 16px;
	}
	
	.action-btn {
		padding: 16px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.1s, opacity 0.2s;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	
	.action-btn:active {
		transform: scale(0.98);
	}
	
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.action-btn.primary {
		background: #3b82f6;
		color: white;
	}
	
	.action-btn.secondary {
		background: #64748b;
		color: white;
	}
	
	.action-btn.success {
		background: #22c55e;
		color: white;
	}
	
	.action-btn.info {
		background: #8b5cf6;
		color: white;
	}
	
	.action-btn.warning {
		background: #f59e0b;
		color: white;
	}
	
	.action-btn.danger {
		background: #ef4444;
		color: white;
	}
	
	/* Full Controls Container */
	.full-controls-container {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	
	.mobile-tablet-only {
		display: block;
	}
	
	@media (min-width: 1024px) {
		.mobile-tablet-only {
			display: none;
		}
	}
	
	/* Ensure desktop layout has proper styling */
	:global(.desktop-layout) {
		background: #0f172a;
		min-height: 100vh;
	}
	
	:global(.desktop-layout) .min-h-screen {
		min-height: auto;
	}
	canvas {
		image-rendering: pixelated;
	}
</style>
