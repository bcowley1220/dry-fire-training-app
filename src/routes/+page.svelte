<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	// State
	let videoElement;
	let canvasElement;
	let canvasWrapper = null; // Reference to canvas wrapper for touch events
	let videoStream = null;
	let isStreaming = $state(false);
	let hits = $state([]);
	let calibrationMode = $state(false);
	let calibrationPoints = $state([]);
	let targetBoundary = $state(null);
	let detectionActive = $state(false);
	let animationFrameId = null;
	let lastHitTime = $state(0);
	let hitDebounceMs = 100; // Ignore hits within 100ms of previous hit

	// Detection parameters
	const RED_THRESHOLD = {
		r: 150,  // Balanced threshold - bright enough to avoid false positives
		g: 70,   // Lower green threshold to ensure red dominance
		b: 70    // Lower blue threshold to ensure red dominance
	};
	const GREEN_THRESHOLD = {
		r: 70,   // Lower red threshold to ensure green dominance
		g: 150,  // Balanced threshold - bright enough to avoid false positives
		b: 70    // Lower blue threshold to ensure green dominance
	};
	const CLUSTER_RADIUS = 10; // pixels
	const MIN_LASER_SIZE = 2; // Require at least 2 pixels to reduce noise
	const MIN_COLOR_DOMINANCE = 30; // Minimum difference between dominant color and other channels
	const MIN_BRIGHTNESS = 100; // Minimum total brightness (r+g+b) to avoid dim false positives

	// Default zone definitions (IPSC-style, normalized coordinates 0-1)
	const DEFAULT_ZONES = {
		A: {
			name: 'A',
			points: 5,
			color: '#4ade80', // green
			bounds: { x: [0.3, 0.7], y: [0.25, 0.75] }
		},
		C: {
			name: 'C',
			points: 3,
			color: '#fbbf24', // yellow
			bounds: { x: [0.15, 0.85], y: [0.1, 0.9] }
		},
		D: {
			name: 'D',
			points: 1,
			color: '#f87171', // red
			bounds: { x: [0, 1], y: [0, 1] }
		}
	};

	// Target mode and configuration
	let targetMode = $state('custom'); // 'preloaded' | 'custom' | 'freeform'
	let selectedTemplate = $state('ipsc-classic');
	let showTargetModeSelection = $state(false);
	let isSetupComplete = $state(false); // Track if setup is complete
	let isTemplateDropdownOpen = $state(false);
	let actionBarExpanded = $state(false);
	
	// Template definitions
	const templates = {
		'ipsc-classic': {
			name: 'IPSC Classic',
			size: '18" x 30"',
			recommendedDistance: '15-20 feet',
			zones: [
				{
					name: 'A',
					points: 5,
					normalized: { minX: 0.3, maxX: 0.7, minY: 0.25, maxY: 0.75 },
					color: '#4ade80' // green
				},
				{
					name: 'C',
					points: 3,
					normalized: { minX: 0.15, maxX: 0.85, minY: 0.1, maxY: 0.9 },
					color: '#fbbf24' // yellow
				},
				{
					name: 'D',
					points: 1,
					normalized: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
					color: '#f87171' // red
				}
			]
		},
		'ipsc-mini': {
			name: 'IPSC Mini',
			size: '8.5" x 11"',
			recommendedDistance: '10-15 feet',
			zones: [
				{
					name: 'A',
					points: 5,
					normalized: { minX: 0.3, maxX: 0.7, minY: 0.25, maxY: 0.75 },
					color: '#4ade80'
				},
				{
					name: 'C',
					points: 3,
					normalized: { minX: 0.15, maxX: 0.85, minY: 0.1, maxY: 0.9 },
					color: '#fbbf24'
				},
				{
					name: 'D',
					points: 1,
					normalized: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
					color: '#f87171'
				}
			]
		},
		'precision-grid': {
			name: 'Precision Grid',
			size: '8.5" x 11"',
			recommendedDistance: '10-15 feet',
			grid: {
				rows: 6,
				cols: 8
			},
			zones: [] // Generated dynamically
		},
		'diagnostic-target': {
			name: 'Diagnostic Target',
			size: '8.5" x 11" (or any size)',
			recommendedDistance: '10-15 feet',
			zones: [
				{
					name: 'Bullseye',
					points: 10,
					normalized: { minX: 0.4, maxX: 0.6, minY: 0.4, maxY: 0.6 },
					color: '#000000' // black center
				},
				{
					name: 'Pushing',
					points: 0,
					normalized: { minX: 0, maxX: 0.4, minY: 0, maxY: 0.4 },
					color: '#ef4444',
					label: 'PUSHING\nANTICIPATING RECOIL'
				},
				{
					name: 'Breaking Wrist Up',
					points: 0,
					normalized: { minX: 0.4, maxX: 0.6, minY: 0, maxY: 0.3 },
					color: '#f59e0b',
					label: 'BREAKING\nWRIST UP'
				},
				{
					name: 'Heeling',
					points: 0,
					normalized: { minX: 0.6, maxX: 1, minY: 0, maxY: 0.4 },
					color: '#ef4444',
					label: 'HEELING\nANTICIPATING RECOIL'
				},
				{
					name: 'Thumbing',
					points: 0,
					normalized: { minX: 0.7, maxX: 1, minY: 0.3, maxY: 0.6 },
					color: '#f59e0b',
					label: 'THUMBING'
				},
				{
					name: 'Squeezing Whole Hand',
					points: 0,
					normalized: { minX: 0.6, maxX: 1, minY: 0.6, maxY: 1 },
					color: '#ef4444',
					label: 'SQUEEZING\nWHOLE HAND'
				},
				{
					name: 'Breaking Wrist Down',
					points: 0,
					normalized: { minX: 0.4, maxX: 0.6, minY: 0.7, maxY: 1 },
					color: '#f59e0b',
					label: 'BREAKING\nWRIST DOWN'
				},
				{
					name: 'Jerking',
					points: 0,
					normalized: { minX: 0, maxX: 0.3, minY: 0.7, maxY: 1 },
					color: '#ef4444',
					label: 'JERKING'
				},
				{
					name: 'Squeezing Fingertips',
					points: 0,
					normalized: { minX: 0, maxX: 0.3, minY: 0.5, maxY: 0.7 },
					color: '#f59e0b',
					label: 'SQUEEZING\nFINGER TIPS'
				},
				{
					name: 'Trigger Finger',
					points: 0,
					normalized: { minX: 0, maxX: 0.4, minY: 0.3, maxY: 0.5 },
					color: '#f59e0b',
					label: 'TOO MUCH/TOO LITTLE\nTRIGGER FINGER'
				}
			]
		}
	};

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
		mode: 'draw',
		randomDelayMin: 2000, // ms
		randomDelayMax: 5000, // ms
		beepVolume: 0.3,
		beepFrequency: 1000, // Hz
		autoNextRound: false, // Enable automatic next round
		roundCount: 10, // Number of rounds to shoot
		resetDuration: 3000 // ms between rounds
	});
	let shotTimerSession = $state({
		reps: [],
		startedAt: null
	});
	let shotTimerDelayTimeout = null;
	let shotTimerAutoNextTimeout = null; // Timeout for automatic next round
	let audioContext = null;
	let showShotTimer = $state(false);
	let showSessionStats = $state(false);
	let timerDisplayUpdate = $state(0); // Force reactivity for timer display
	let shotTimerCooldownUntil = $state(null); // Cooldown period after timer stops
	let currentRound = $state(0); // Current round number (1-indexed)
	let autoNextCountdown = $state(null); // Countdown remaining for auto-advance (ms)
	let lastCalibrationClickTime = 0; // Debounce calibration clicks
	const CALIBRATION_CLICK_DEBOUNCE_MS = 300; // Prevent double-firing

	// Camera Zoom State
	let cameraZoom = $state(1.0); // Zoom level (1.0 = no zoom)
	let cameraPanX = $state(0); // Pan offset X
	let cameraPanY = $state(0); // Pan offset Y
	let isZooming = $state(false);
	let zoomStartDistance = 0;
	let zoomStartZoom = 1.0;
	let zoomStartPanX = 0;
	let zoomStartPanY = 0;
	let lastTouchCenterX = 0;
	let lastTouchCenterY = 0;

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
				if (isSetupComplete && !targetBoundary && targetMode !== 'freeform') {
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

		// Clear debug pixels for this frame
		if (showDebugOverlay) {
			window.debugPixels = [];
		}

		// Detect laser dots
		const detectedHits = detectLaserDots(pixels, canvas.width, canvas.height);

		// Process detected hits
		for (const hit of detectedHits) {
			// Check if we're in shot timer cooldown period
			if (shotTimerCooldownUntil && performance.now() < shotTimerCooldownUntil) {
				continue; // Skip this hit - still in cooldown period after timer stopped
			}

			// Detect zone for this hit
			const zoneInfo = detectZone(hit.x, hit.y, targetBoundary);

			// Freeform mode: log all hits (zoneInfo.zone will be 'Hit', not 'Miss')
			// For other modes: skip hits outside calibrated boundary
			if (targetBoundary && zoneInfo.zone === 'Miss' && targetMode !== 'freeform') {
				continue;
			}
			
			// For zone-based modes without calibration, skip (can't detect zones)
			if (!targetBoundary && targetMode !== 'freeform' && zoneInfo.zone === 'Miss') {
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
					shotNumber: sessionShotCounter,
					displayUntil: now + 2000 // Show marker for 2 seconds
				};
				
				// Check if shot timer is active
				if (shotTimerActive) {
					const consumed = handleTimerHit(newHit);
					// If timer consumed the hit (first shot), don't add to regular hit log
					if (consumed && shotTimerPhase === 'complete') {
						lastHitTime = now;
						continue; // Skip normal hit logging
					}
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

	function detectLaserDots(pixels, width, height) {
		const hits = [];
		const visited = new Set();
		const debugPixels = showDebugOverlay ? [] : null; // Store pixels that match criteria for debug overlay

		// Scan for bright red or green pixels
		for (let y = 0; y < height; y += 1) {
			// Sample every pixel for better detection of small laser dots
			for (let x = 0; x < width; x += 1) {
				const idx = (y * width + x) * 4;
				const r = pixels[idx];
				const g = pixels[idx + 1];
				const b = pixels[idx + 2];
				const brightness = r + g + b;

				// Skip dim pixels to avoid false positives
				if (brightness < MIN_BRIGHTNESS) continue;

				// Check for red laser - require both threshold match AND significant color dominance
				const redMatch = r > RED_THRESHOLD.r && g < RED_THRESHOLD.g && b < RED_THRESHOLD.b;
				const redDominant = r > g && r > b && r > RED_THRESHOLD.r;
				const redDominanceDiff = Math.min(r - g, r - b); // How much more red than other channels
				
				// Require strict threshold match OR (dominant with significant difference)
				if (redMatch || (redDominant && redDominanceDiff >= MIN_COLOR_DOMINANCE)) {
					if (showDebugOverlay && debugPixels) {
						debugPixels.push({ x, y, r, g, b, color: 'red', matched: redMatch, dominant: redDominant });
					}
					const cluster = findCluster(x, y, pixels, width, height, 'red', visited);
					if (cluster && cluster.size >= MIN_LASER_SIZE) {
						if (showDebugOverlay) {
							console.log(`Red laser detected at (${cluster.centerX}, ${cluster.centerY}), size: ${cluster.size}, RGB: (${r}, ${g}, ${b})`);
						}
						hits.push({ x: cluster.centerX, y: cluster.centerY, color: 'red' });
					}
				}
				// Check for green laser - require both threshold match AND significant color dominance
				else {
					const greenMatch = g > GREEN_THRESHOLD.g && r < GREEN_THRESHOLD.r && b < GREEN_THRESHOLD.b;
					const greenDominant = g > r && g > b && g > GREEN_THRESHOLD.g;
					const greenDominanceDiff = Math.min(g - r, g - b); // How much more green than other channels
					
					// Require strict threshold match OR (dominant with significant difference)
					if (greenMatch || (greenDominant && greenDominanceDiff >= MIN_COLOR_DOMINANCE)) {
						if (showDebugOverlay && debugPixels) {
							debugPixels.push({ x, y, r, g, b, color: 'green', matched: greenMatch, dominant: greenDominant });
						}
						const cluster = findCluster(x, y, pixels, width, height, 'green', visited);
						if (cluster && cluster.size >= MIN_LASER_SIZE) {
							if (showDebugOverlay) {
								console.log(`Green laser detected at (${cluster.centerX}, ${cluster.centerY}), size: ${cluster.size}, RGB: (${r}, ${g}, ${b})`);
							}
							hits.push({ x: cluster.centerX, y: cluster.centerY, color: 'green' });
						}
					}
				}
			}
		}

		// Store debug pixels for overlay drawing
		if (showDebugOverlay && debugPixels) {
			window.debugPixels = debugPixels;
		}

		return hits;
	}

	function findCluster(startX, startY, pixels, width, height, color, visited) {
		const cluster = [];
		const queue = [[startX, startY]];
		const key = `${startX},${startY}`;
		if (visited.has(key)) return null;
		visited.add(key);

		const threshold = color === 'red' ? RED_THRESHOLD : GREEN_THRESHOLD;
		let minX = startX,
			maxX = startX,
			minY = startY,
			maxY = startY;

		while (queue.length > 0) {
			const [x, y] = queue.shift();
			if (x < 0 || x >= width || y < 0 || y >= height) continue;

			const idx = (y * width + x) * 4;
			const r = pixels[idx];
			const g = pixels[idx + 1];
			const b = pixels[idx + 2];

			// More selective matching: require strict threshold OR dominant with significant difference
			const brightness = r + g + b;
			let isMatch;
			if (color === 'red') {
				const strictMatch = r > threshold.r && g < threshold.g && b < threshold.b;
				const dominantMatch = r > g && r > b && r > threshold.r;
				const dominanceDiff = Math.min(r - g, r - b);
				isMatch = (strictMatch || (dominantMatch && dominanceDiff >= MIN_COLOR_DOMINANCE)) && brightness >= MIN_BRIGHTNESS;
			} else {
				const strictMatch = g > threshold.g && r < threshold.r && b < threshold.b;
				const dominantMatch = g > r && g > b && g > threshold.g;
				const dominanceDiff = Math.min(g - r, g - b);
				isMatch = (strictMatch || (dominantMatch && dominanceDiff >= MIN_COLOR_DOMINANCE)) && brightness >= MIN_BRIGHTNESS;
			}

			if (isMatch) {
				cluster.push([x, y]);
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);

				// Check neighbors
				for (const [dx, dy] of [
					[-1, -1],
					[-1, 0],
					[-1, 1],
					[0, -1],
					[0, 1],
					[1, -1],
					[1, 0],
					[1, 1]
				]) {
					const nx = x + dx;
					const ny = y + dy;
					const nKey = `${nx},${ny}`;
					if (!visited.has(nKey) && Math.abs(nx - startX) < CLUSTER_RADIUS && Math.abs(ny - startY) < CLUSTER_RADIUS) {
						visited.add(nKey);
						queue.push([nx, ny]);
					}
				}
			}
		}

		if (cluster.length === 0) return null;

		return {
			size: cluster.length,
			centerX: Math.round((minX + maxX) / 2),
			centerY: Math.round((minY + maxY) / 2)
		};
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
		}

		// Draw target boundary and zones if calibrated
		if (targetBoundary) {
			const bbox = getTargetBoundingBox(targetBoundary);
			const targetWidth = bbox.maxX - bbox.minX;
			const targetHeight = bbox.maxY - bbox.minY;

			// Helper function to convert hex to rgba with opacity
			function hexToRgba(hex, opacity) {
				const r = parseInt(hex.slice(1, 3), 16);
				const g = parseInt(hex.slice(3, 5), 16);
				const b = parseInt(hex.slice(5, 7), 16);
				return `rgba(${r}, ${g}, ${b}, ${opacity})`;
			}

			// Draw grid overlay if grid mode
			if (targetMode === 'preloaded' && templates[selectedTemplate]?.grid) {
				drawGridOverlay(ctx, targetBoundary, templates[selectedTemplate].grid);
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
					
					if (customZoneBounds[zoneName]) {
						// Draw custom polygon zone
						ctx.fillStyle = hexToRgba(zone.color, 0.2);
						ctx.beginPath();
						ctx.moveTo(customZoneBounds[zoneName].x1, customZoneBounds[zoneName].y1);
						ctx.lineTo(customZoneBounds[zoneName].x2, customZoneBounds[zoneName].y2);
						ctx.lineTo(customZoneBounds[zoneName].x3, customZoneBounds[zoneName].y3);
						ctx.lineTo(customZoneBounds[zoneName].x4, customZoneBounds[zoneName].y4);
						ctx.closePath();
						ctx.fill();
					} else {
						// Draw normalized rectangle zone
						ctx.fillStyle = hexToRgba(zone.color, 0.2);
						ctx.fillRect(
							bbox.minX + targetWidth * zone.bounds.x[0],
							bbox.minY + targetHeight * zone.bounds.y[0],
							targetWidth * (zone.bounds.x[1] - zone.bounds.x[0]),
							targetHeight * (zone.bounds.y[1] - zone.bounds.y[0])
						);
					}
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

	function detectZone(x, y, boundary) {
		// Freeform mode: no zone detection, just return hit info
		if (targetMode === 'freeform') {
			return { zone: 'Hit', points: null, color: '#3b82f6' };
		}

		// Grid mode: detect grid cell
		if (targetMode === 'preloaded' && templates[selectedTemplate]?.grid) {
			return getGridCellForHit(x, y, boundary);
		}

		if (!boundary) {
			return { zone: 'Miss', points: 0, color: '#6b7280' };
		}

		// Check if hit is within target boundary
		if (!isPointInBoundary(x, y, boundary)) {
			return { zone: 'Miss', points: 0, color: '#6b7280' };
		}

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
					return { zone: zone.name, points: zone.points, color: zone.color };
				}
			}
			return { zone: 'Miss', points: 0, color: '#6b7280' };
		}

		// Custom mode: check zones from innermost to outermost (A → C → D)
		// If custom bounds exist, use point-in-polygon test, otherwise use normalized bounds
		for (const zoneName of ['A', 'C', 'D']) {
			if (customZoneBounds[zoneName]) {
				// Use custom polygon bounds
				if (isPointInBoundary(x, y, customZoneBounds[zoneName])) {
					return { zone: zones[zoneName].name, points: zones[zoneName].points, color: zones[zoneName].color };
				}
			} else {
				// Use normalized bounds
				const normalized = normalizeHitCoordinates(x, y, boundary);
				if (
					normalized.x >= zones[zoneName].bounds.x[0] &&
					normalized.x <= zones[zoneName].bounds.x[1] &&
					normalized.y >= zones[zoneName].bounds.y[0] &&
					normalized.y <= zones[zoneName].bounds.y[1]
				) {
					return { zone: zones[zoneName].name, points: zones[zoneName].points, color: zones[zoneName].color };
				}
			}
		}

		return { zone: 'Miss', points: 0, color: '#6b7280' };
	}

	function handleCanvasClick(event) {
		if (zoneCalibrationMode) {
			handleZoneCalibrationClick(event);
			return;
		}

		if (!calibrationMode || !canvasElement) return;

		// Prevent double-firing: debounce rapid events
		const now = Date.now();
		if (event.type === 'touchstart') {
			event.preventDefault();
			// If we just handled a touch, ignore the next click event
			lastCalibrationClickTime = now;
		} else if (event.type === 'click') {
			// If this is a click event and we recently handled a touch, ignore it
			if (now - lastCalibrationClickTime < CALIBRATION_CLICK_DEBOUNCE_MS) {
				event.preventDefault();
				return;
			}
			lastCalibrationClickTime = now;
		}

		// Handle both mouse and touch events
		let clientX, clientY;
		if (event.touches && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else if (event.changedTouches && event.changedTouches.length > 0) {
			// Handle touch events that may not have touches array (touchend)
			clientX = event.changedTouches[0].clientX;
			clientY = event.changedTouches[0].clientY;
		} else {
			clientX = event.clientX;
			clientY = event.clientY;
		}

		// Get wrapper element (parent of canvas) which has the transform
		const wrapper = canvasElement.parentElement;
		if (!wrapper || !canvasElement) return;
		
		const wrapperRect = wrapper.getBoundingClientRect();
		const canvasRect = canvasElement.getBoundingClientRect();
		
		// Get click position relative to wrapper (which has the transform)
		const wrapperX = clientX - wrapperRect.left;
		const wrapperY = clientY - wrapperRect.top;
		
		// Calculate actual displayed canvas size (accounting for object-contain)
		// Canvas has object-contain, so it maintains aspect ratio and may not fill wrapper
		const videoAspect = canvasElement.width / canvasElement.height;
		const wrapperAspect = wrapperRect.width / wrapperRect.height;
		
		let displayedWidth, displayedHeight, offsetX, offsetY;
		
		if (videoAspect > wrapperAspect) {
			// Video is wider - fit to width
			displayedWidth = wrapperRect.width;
			displayedHeight = wrapperRect.width / videoAspect;
			offsetX = 0;
			offsetY = (wrapperRect.height - displayedHeight) / 2;
		} else {
			// Video is taller - fit to height
			displayedHeight = wrapperRect.height;
			displayedWidth = wrapperRect.height * videoAspect;
			offsetX = (wrapperRect.width - displayedWidth) / 2;
			offsetY = 0;
		}
		
		// Adjust click coordinates for the actual displayed canvas area
		const adjustedX = wrapperX - offsetX;
		const adjustedY = wrapperY - offsetY;
		
		// Reverse the CSS transform: scale(zoom) translate(panX, panY)
		// CSS transforms apply right-to-left: translate then scale
		// To reverse: divide by zoom, then subtract pan
		const untransformedX = (adjustedX / cameraZoom) - (cameraPanX / cameraZoom);
		const untransformedY = (adjustedY / cameraZoom) - (cameraPanY / cameraZoom);
		
		// Convert from displayed canvas size to actual canvas pixel size
		const scaleX = canvasElement.width / displayedWidth;
		const scaleY = canvasElement.height / displayedHeight;
		const actualX = untransformedX * scaleX;
		const actualY = untransformedY * scaleY;

		calibrationPoints = [...calibrationPoints, { x: actualX, y: actualY }];

		if (calibrationPoints.length === 4) {
			// Set target boundary
			targetBoundary = {
				x1: calibrationPoints[0].x,
				y1: calibrationPoints[0].y,
				x2: calibrationPoints[1].x,
				y2: calibrationPoints[1].y,
				x3: calibrationPoints[2].x,
				y3: calibrationPoints[2].y,
				x4: calibrationPoints[3].x,
				y4: calibrationPoints[3].y
			};
			calibrationMode = false;
			calibrationPoints = [];
			
			// Load template zones if pre-loaded mode
			if (targetMode === 'preloaded') {
				loadTemplateZones(selectedTemplate);
			}
		}
	}

	function handleZoneCalibrationClick(event) {
		if (!canvasElement || !targetBoundary) return;

		// Handle both mouse and touch events
		let clientX, clientY;
		if (event.touches && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else {
			clientX = event.clientX;
			clientY = event.clientY;
		}

		// Get wrapper element (parent of canvas) which has the transform
		const wrapper = canvasElement.parentElement;
		if (!wrapper) return;
		
		const wrapperRect = wrapper.getBoundingClientRect();
		const canvasRect = canvasElement.getBoundingClientRect();
		
		// Get click position relative to wrapper (which has the transform)
		const wrapperX = clientX - wrapperRect.left;
		const wrapperY = clientY - wrapperRect.top;
		
		// Calculate actual displayed canvas size (accounting for object-contain)
		const videoAspect = canvasElement.width / canvasElement.height;
		const wrapperAspect = wrapperRect.width / wrapperRect.height;
		
		let displayedWidth, displayedHeight, offsetX, offsetY;
		
		if (videoAspect > wrapperAspect) {
			// Video is wider - fit to width
			displayedWidth = wrapperRect.width;
			displayedHeight = wrapperRect.width / videoAspect;
			offsetX = 0;
			offsetY = (wrapperRect.height - displayedHeight) / 2;
		} else {
			// Video is taller - fit to height
			displayedHeight = wrapperRect.height;
			displayedWidth = wrapperRect.height * videoAspect;
			offsetX = (wrapperRect.width - displayedWidth) / 2;
			offsetY = 0;
		}
		
		// Adjust click coordinates for the actual displayed canvas area
		const adjustedX = wrapperX - offsetX;
		const adjustedY = wrapperY - offsetY;
		
		// Reverse the CSS transform: scale(zoom) translate(panX, panY)
		// CSS transforms apply right-to-left: translate then scale
		// To reverse: divide by zoom, then subtract pan
		const untransformedX = (adjustedX / cameraZoom) - (cameraPanX / cameraZoom);
		const untransformedY = (adjustedY / cameraZoom) - (cameraPanY / cameraZoom);
		
		// Convert from displayed canvas size to actual canvas pixel size
		const scaleX = canvasElement.width / displayedWidth;
		const scaleY = canvasElement.height / displayedHeight;
		const actualX = untransformedX * scaleX;
		const actualY = untransformedY * scaleY;

		zoneCalibrationPoints = [...zoneCalibrationPoints, { x: actualX, y: actualY }];

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
		targetBoundary = null;
		calibrationPoints = [];
		calibrationMode = false;
		customZoneBounds = { A: null, C: null, D: null };
		zoneCalibrationMode = null;
		zoneCalibrationPoints = [];
	}

	// Camera Zoom Functions
	function resetZoom() {
		cameraZoom = 1.0;
		cameraPanX = 0;
		cameraPanY = 0;
	}

	function handleZoom(event) {
		if (!canvasElement) return;
		
		// Prevent default zoom behavior
		event.preventDefault();
		
		// Get zoom delta
		let delta = 0;
		if (event.deltaY) {
			// Mouse wheel
			delta = -event.deltaY * 0.001;
		}
		
		// Get center point for zoom
		const wrapper = canvasElement.parentElement;
		if (!wrapper) return;
		const wrapperRect = wrapper.getBoundingClientRect();
		
		let centerX = event.clientX ? event.clientX - wrapperRect.left : wrapperRect.width / 2;
		let centerY = event.clientY ? event.clientY - wrapperRect.top : wrapperRect.height / 2;
		
		// Calculate zoom
		const newZoom = Math.max(1.0, Math.min(5.0, cameraZoom + delta));
		const zoomFactor = newZoom / cameraZoom;
		
		// Adjust pan to zoom towards the center point
		// Formula: newPan = oldPan - center * oldZoom * (zoomFactor - 1)
		// This keeps the center point visually in the same place
		cameraPanX = cameraPanX - centerX * cameraZoom * (zoomFactor - 1);
		cameraPanY = cameraPanY - centerY * cameraZoom * (zoomFactor - 1);
		
		cameraZoom = newZoom;
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
		
		lastTouchCenterX = ((touch1.clientX + touch2.clientX) / 2) - wrapperRect.left;
		lastTouchCenterY = ((touch1.clientY + touch2.clientY) / 2) - wrapperRect.top;
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
		
		const centerX = ((touch1.clientX + touch2.clientX) / 2) - wrapperRect.left;
		const centerY = ((touch1.clientY + touch2.clientY) / 2) - wrapperRect.top;
		
		// Adjust pan based on zoom and center point
		// Formula: newPan = oldPan - center * oldZoom * (zoomFactor - 1)
		const zoomDelta = newZoom / zoomStartZoom;
		cameraPanX = zoomStartPanX - centerX * zoomStartZoom * (zoomDelta - 1);
		cameraPanY = zoomStartPanY - centerY * zoomStartZoom * (zoomDelta - 1);
		
		cameraZoom = newZoom;
		lastTouchCenterX = centerX;
		lastTouchCenterY = centerY;
	}

	function handlePinchEnd(event) {
		isZooming = false;
	}

	// Wrapper functions for touch events (needed for passive: false)
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

	function handlePan(event) {
		if (isZooming || cameraZoom <= 1.0 || !canvasElement) return;
		
		if (event.touches && event.touches.length === 1) {
			// Single touch pan
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
		}
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

	function updateZoneBounds(zoneName, axis, index, value) {
		const numValue = parseFloat(value);
		if (isNaN(numValue) || numValue < 0 || numValue > 1) return;
		
		zones[zoneName].bounds[axis][index] = numValue;
		// Ensure min < max
		if (index === 0 && zones[zoneName].bounds[axis][0] >= zones[zoneName].bounds[axis][1]) {
			zones[zoneName].bounds[axis][0] = zones[zoneName].bounds[axis][1] - 0.01;
		}
		if (index === 1 && zones[zoneName].bounds[axis][1] <= zones[zoneName].bounds[axis][0]) {
			zones[zoneName].bounds[axis][1] = zones[zoneName].bounds[axis][0] + 0.01;
		}
		zones = { ...zones }; // Trigger reactivity
	}

	function updateZonePoints(zoneName, value) {
		const numValue = parseInt(value);
		if (isNaN(numValue) || numValue < 0) return;
		zones[zoneName].points = numValue;
		zones = { ...zones }; // Trigger reactivity
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
		
		// Calculate random delay
		const delayRange = shotTimerConfig.randomDelayMax - shotTimerConfig.randomDelayMin;
		const delay = shotTimerConfig.randomDelayMin + (Math.random() * delayRange);
		
		console.log(`Round ${currentRound}/${shotTimerConfig.roundCount} - Random delay: ${(delay / 1000).toFixed(2)}s`);
		
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

	function cancelDrill() {
		if (shotTimerDelayTimeout) {
			clearTimeout(shotTimerDelayTimeout);
			shotTimerDelayTimeout = null;
		}
		if (shotTimerAutoNextTimeout) {
			clearTimeout(shotTimerAutoNextTimeout);
			shotTimerAutoNextTimeout = null;
		}
		shotTimerActive = false;
		shotTimerPhase = 'idle';
		shotTimerStartTime = null;
		shotTimerFirstHitTime = null;
		shotTimerCooldownUntil = null; // Reset cooldown on cancel
		autoNextCountdown = null; // Reset countdown on cancel
		console.log('Drill cancelled');
	}

	function handleTimerHit(hit) {
		// Check for false start (hit before beep)
		if (shotTimerPhase === 'waiting') {
			console.warn('False start detected - hit before beep!');
			alert('False start! Wait for the beep before shooting.');
			return false; // Don't count this hit
		}
		
		// Check if this is the first hit
		if (shotTimerPhase === 'active' && shotTimerFirstHitTime === null) {
			// Record hit time
			shotTimerFirstHitTime = performance.now() - shotTimerStartTime;
			shotTimerPhase = 'complete';
			
			// Store rep result
			const repResult = {
				id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				timestamp: Date.now(),
				drawTime: shotTimerFirstHitTime,
				hit: {
					x: hit.x,
					y: hit.y,
					zone: hit.zone,
					points: hit.points,
					zoneColor: hit.zoneColor
				},
				falseStart: false
			};
			
			shotTimerSession.reps = [...shotTimerSession.reps, repResult];
			
			console.log(`Draw time: ${(repResult.drawTime / 1000).toFixed(3)}s, Zone: ${hit.zone}`);
			
			// Set cooldown period (ignore hits for 1 second after timer stops)
			shotTimerCooldownUntil = performance.now() + 1000;
			
			// Timer is no longer active (drill complete)
			shotTimerActive = false;
			
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
			
			// Open drawer to show results
			
			return true; // Hit was consumed by timer
		}
		
		return false; // Hit not consumed
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
		shotTimerCooldownUntil = null; // Reset cooldown
		if (shotTimerAutoNextTimeout) {
			clearTimeout(shotTimerAutoNextTimeout);
			shotTimerAutoNextTimeout = null;
		}
		startDrill();
	}

	function formatTime(ms) {
		return (ms / 1000).toFixed(2);
	}

	function getCurrentElapsed() {
		if (!shotTimerStartTime) return 0;
		return performance.now() - shotTimerStartTime;
	}

	function calculateAverage() {
		const reps = shotTimerSession.reps;
		if (reps.length === 0) return 0;
		const sum = reps.reduce((acc, rep) => acc + rep.drawTime, 0);
		return sum / reps.length;
	}

	function calculateBest() {
		const reps = shotTimerSession.reps;
		if (reps.length === 0) return 0;
		return Math.min(...reps.map(rep => rep.drawTime));
	}

	function calculateWorst() {
		const reps = shotTimerSession.reps;
		if (reps.length === 0) return 0;
		return Math.max(...reps.map(rep => rep.drawTime));
	}

	function calculateAccuracyByZone() {
		const reps = shotTimerSession.reps;
		const zoneCounts = {};
		
		reps.forEach(rep => {
			const zone = rep.hit.zone;
			if (!zoneCounts[zone]) {
				zoneCounts[zone] = {
					name: zone,
					color: rep.hit.zoneColor,
					count: 0
				};
			}
			zoneCounts[zone].count++;
		});
		
		return Object.values(zoneCounts).map(zone => ({
			...zone,
			percentage: Math.round((zone.count / reps.length) * 100)
		}));
	}

	// Shot Sequence Visualization Functions
	function calculateShotGrouping(hits) {
		if (hits.length < 2) return null;
		
		// Calculate center of group
		const centerX = hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length;
		const centerY = hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length;
		
		// Calculate average distance from center (group size)
		const distances = hits.map(hit => 
			Math.sqrt(Math.pow(hit.x - centerX, 2) + Math.pow(hit.y - centerY, 2))
		);
		const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
		
		// Calculate max spread (extreme shot distances)
		const maxDistance = Math.max(...distances);
		
		return {
			centerX,
			centerY,
			avgDistance: avgDistance.toFixed(1),
			maxSpread: (maxDistance * 2).toFixed(1), // Diameter
			groupSize: `${(avgDistance * 2).toFixed(1)}px`
		};
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

	// Add touch event listeners when canvasWrapper is available
	$effect(() => {
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

	onMount(() => {
		// Don't auto-start camera - let user start it manually
		
		// Listen for fullscreen changes (only in browser)
		if (browser) {
			document.addEventListener('fullscreenchange', handleFullscreenChange);
			document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
			document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
			document.addEventListener('MSFullscreenChange', handleFullscreenChange); // IE/Edge
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
	<header class="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-30">
		<div class="flex items-center gap-3">
			<div class="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
				<span class="text-primary font-bold text-base">🎯</span>
			</div>
			<div>
				<h1 class="font-semibold text-sm">Dry-Fire Trainer</h1>
				<p class="text-xs text-muted-foreground">Laser Detection</p>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<button class="p-2 hover:bg-secondary/50 rounded-lg transition-colors">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</button>
			<button class="p-2 hover:bg-secondary/50 rounded-lg transition-colors">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</button>
		</div>
	</header>

	<main class="flex-1 flex flex-col p-4 pb-36 space-y-4 max-w-7xl mx-auto w-full">
		{#if !isSetupComplete}
			<!-- Setup Mode -->
			<div class="space-y-4 animate-fade-in">
				<!-- Target Mode Selector -->
				<div class="bg-card rounded-xl border border-border p-4 space-y-4">
					<h2 class="font-semibold text-base">Select Target Mode</h2>
					
					<div class="space-y-2">
						<!-- Pre-loaded Template -->
						<!-- <button
							onclick={() => targetMode = 'preloaded'}
							class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode === 'preloaded' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
						>
							<div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode === 'preloaded' ? 'bg-primary/20' : 'bg-secondary'}">
								<svg class="w-5 h-5 {targetMode === 'preloaded' ? 'text-primary' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<div class="flex-1 text-left min-w-0">
								<p class="font-medium text-sm">Pre-loaded Template</p>
								<p class="text-xs text-muted-foreground">Quick Setup</p>
							</div>
							{#if targetMode === 'preloaded'}
								<svg class="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button> -->

						<!-- Custom Target -->
						<button
							onclick={() => targetMode = 'custom'}
							class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
						>
							<div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode === 'custom' ? 'bg-primary/20' : 'bg-secondary'}">
								<svg class="w-5 h-5 {targetMode === 'custom' ? 'text-primary' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
								</svg>
							</div>
							<div class="flex-1 text-left min-w-0">
								<p class="font-medium text-sm">Custom Target</p>
								<p class="text-xs text-muted-foreground">Manual Zones</p>
							</div>
							{#if targetMode === 'custom'}
								<svg class="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>

						<!-- Free Training -->
						<button
							onclick={() => targetMode = 'freeform'}
							class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 {targetMode === 'freeform' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 hover:bg-secondary text-foreground'}"
						>
							<div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {targetMode === 'freeform' ? 'bg-primary/20' : 'bg-secondary'}">
								<svg class="w-5 h-5 {targetMode === 'freeform' ? 'text-primary' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<div class="flex-1 text-left min-w-0">
								<p class="font-medium text-sm">Free Training</p>
								<p class="text-xs text-muted-foreground">No Zones</p>
							</div>
							{#if targetMode === 'freeform'}
								<svg class="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>
					</div>

					{#if targetMode === 'preloaded'}
						<!-- Template Selector -->
						<div class="space-y-2 pt-2 border-t border-border">
							<label class="text-xs text-muted-foreground font-medium">Select Template</label>
							<button
								onclick={() => isTemplateDropdownOpen = !isTemplateDropdownOpen}
								class="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary transition-colors"
							>
								<div class="text-left">
									<p class="font-medium text-sm">{templates[selectedTemplate]?.name || 'Select template'}</p>
									<p class="text-xs text-muted-foreground">{templates[selectedTemplate]?.size}, {templates[selectedTemplate]?.recommendedDistance}</p>
								</div>
								<svg class="w-5 h-5 text-muted-foreground transition-transform {isTemplateDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>

							{#if isTemplateDropdownOpen}
								<div class="bg-secondary rounded-lg border border-border overflow-hidden animate-fade-in">
									{#each Object.entries(templates) as [id, template]}
										{#if !template.grid}
											<button
												onclick={() => { selectedTemplate = id; isTemplateDropdownOpen = false; }}
												class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 {selectedTemplate === id ? 'bg-primary/10' : ''}"
											>
												<div class="text-left">
													<p class="font-medium text-sm">{template.name}</p>
													<p class="text-xs text-muted-foreground">{template.size}, {template.recommendedDistance}</p>
												</div>
												{#if selectedTemplate === id}
													<svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
													</svg>
												{/if}
											</button>
										{/if}
									{/each}
								</div>
							{/if}

							<div class="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
								<span class="shrink-0 text-warning text-base">💡</span>
								<span class="text-xs text-warning/90">Position camera {templates[selectedTemplate]?.recommendedDistance || '15-20 feet'} from target. Target should fill 30-50% of frame.</span>
							</div>
						</div>
					{/if}

					<button
						onclick={async () => {
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
						}}
						class="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold transition-colors"
					>
						Continue
					</button>

					<p class="text-xs text-muted-foreground text-center pt-2">
						You'll calibrate by tapping the 4 corners <span class="text-primary font-medium">clockwise</span>
					</p>
				</div>

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
				<!-- Camera Viewport -->
				<div class="camera-viewport-container relative w-full bg-card rounded-xl overflow-hidden border border-border aspect-[4/3]">
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
				style="transform: scale({cameraZoom}) translate({cameraPanX / cameraZoom}px, {cameraPanY / cameraZoom}px); transform-origin: 0 0; width: 100%; height: 100%; overflow: hidden;"
				onwheel={handleZoom}
			>
				<canvas
					bind:this={canvasElement}
					class="w-full h-full object-contain"
					style="touch-action: none; display: block;"
				></canvas>
			</div>
			{#if calibrationMode}
				<div
					class="absolute inset-0 cursor-crosshair z-10"
					onclick={handleCanvasClick}
					ontouchstart={handleCanvasClick}
					ontouchend={(e) => {
						// Prevent click event from firing after touch
						e.preventDefault();
					}}
					onkeydown={(e) => e.key === 'Enter' && handleCanvasClick(e)}
					role="button"
					tabindex="0"
					style="touch-action: none;"
				></div>
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
					class="absolute inset-0 cursor-crosshair z-10"
					onclick={handleCanvasClick}
					ontouchstart={handleCanvasClick}
					ontouchend={(e) => {
						// Prevent click event from firing after touch
						e.preventDefault();
					}}
					onkeydown={(e) => e.key === 'Enter' && handleCanvasClick(e)}
					role="button"
					tabindex="0"
					style="touch-action: none;"
				></div>
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
					onclick={cancelZoneCalibration}
					class="absolute top-4 right-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold z-20"
				>
					Cancel
				</button>
			{/if}
			{#if !isStreaming}
				<div class="absolute inset-0 flex items-center justify-center bg-card">
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
				</div>
			{/if}
	
			<!-- Camera Overlay Controls (when streaming) -->
			{#if isStreaming && isSetupComplete}
				<!-- Calibrated Badge -->
		{#if targetBoundary}
					<div class="absolute top-3 left-3 glass px-3 py-1.5 rounded-full flex items-center gap-2 text-xs border border-success/20">
						<div class="w-2 h-2 rounded-full bg-success pulse-active"></div>
						<span class="text-success font-medium">Calibrated</span>
	</div>
		{/if}
		
				<!-- Fullscreen Button -->
				<button 
					onclick={toggleFullscreen}
					class="absolute top-3 right-3 glass border-0 hover:bg-secondary/50 p-2 rounded-lg transition-colors z-20"
					aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
				>
					{#if isFullscreen}
						<!-- Exit fullscreen icon -->
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12M4 8h4m0 0v4m0-4l5 5m7-5h-4m0 0v4m0-4l-5 5M4 16h4m0 0v4m0-4l5-5m7 5h-4m0 0v4m0-4l-5-5" />
						</svg>
					{:else}
						<!-- Enter fullscreen icon -->
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
						</svg>
					{/if}
			</button>
	
			<!-- Stop Button - Top Left -->
			<div class="absolute top-3 left-3 z-10">
		<button 
					onclick={stopCamera}
					class="glass border-0 backdrop-blur-xl shadow-lg px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v4H9z" />
					</svg>
					Stop
		</button>
			</div>
			
			<!-- Bottom Controls -->
			<div class="absolute bottom-3 left-3 right-3 flex justify-center gap-2 z-10">
				{#if !calibrationMode}
		<button 
			onclick={startCalibration}
						class="glass border-0 backdrop-blur-xl shadow-lg px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary"
		>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Calibrate
		</button>
	{/if}
</div>
			{/if}
		</div>
	</div>
	
				<!-- Status Pills -->
				<div class="flex flex-wrap gap-2 justify-center">
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {isStreaming ? 'bg-success/20 text-success border-success/30' : 'bg-secondary/50 text-foreground border-border'}">
						{#if isStreaming}
							<span class="w-2 h-2 rounded-full bg-success pulse-active shrink-0"></span>
						{/if}
						<span class="text-muted-foreground/80 font-medium">Status</span>
						<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Inactive'}</span>
					</div>
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs bg-secondary/50 text-foreground border-border">
						<span class="text-muted-foreground/80 font-medium">Hits</span>
						<span class="font-mono font-semibold">{hits.length}</span>
					</div>
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {targetBoundary ? 'bg-success/20 text-success border-success/30' : 'bg-warning/20 text-warning border-warning/30'}">
						<span class="w-2 h-2 rounded-full {targetBoundary ? 'bg-success' : 'bg-warning'} shrink-0"></span>
						<span class="text-muted-foreground/80 font-medium">Calibrated</span>
						<span class="font-mono font-semibold">{targetBoundary ? 'Yes' : 'No'}</span>
					</div>
					<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs {isStreaming ? 'bg-success/20 text-success border-success/30' : 'bg-secondary/50 text-foreground border-border'}">
						{#if isStreaming}
							<span class="w-2 h-2 rounded-full bg-success shrink-0"></span>
						{/if}
						<span class="text-muted-foreground/80 font-medium">Detection</span>
						<span class="font-mono font-semibold">{isStreaming ? 'Active' : 'Off'}</span>
					</div>
				</div>

				<!-- Hits List -->
				<div class="bg-card rounded-xl border border-border p-4 min-h-[200px] flex flex-col">
					{#if hits.length === 0}
						<div class="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-8">
							<div class="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
								<svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<div>
								<p class="text-muted-foreground text-sm font-medium">No hits detected yet</p>
								<p class="text-muted-foreground/60 text-xs mt-1">Point your laser at the target</p>
							</div>
						</div>
					{:else}
						<div class="space-y-2">
							<div class="flex items-center justify-between mb-3">
								<h3 class="text-sm font-semibold">Hit History</h3>
								<span class="text-xs text-muted-foreground">{hits.length} {hits.length === 1 ? 'hit' : 'hits'}</span>
							</div>
							<div class="space-y-1.5 max-h-[300px] overflow-y-auto">
								{#each hits.slice().reverse() as hit (hit.id)}
									<div class="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
										<div class="flex items-center gap-2">
											<div class="w-2 h-2 rounded-full {hit.zone === 'A' ? 'bg-success' : hit.zone === 'C' ? 'bg-warning' : hit.zone === 'D' ? 'bg-destructive' : 'bg-muted-foreground'}"></div>
											<span class="text-xs font-medium">Zone {hit.zone || 'Miss'}</span>
											{#if hit.points !== undefined}
												<span class="text-xs text-muted-foreground">({hit.points} pts)</span>
											{/if}
										</div>
										<span class="text-xs text-muted-foreground">{new Date(hit.timestamp).toLocaleTimeString()}</span>
									</div>
							{/each}
							</div>
						</div>
						{/if}
				</div>
					</div>
				{/if}
	</main>

	<!-- Bottom Action Bar -->
	{#if isSetupComplete}
		<div class="fixed bottom-0 left-0 right-0 z-40 safe-area-pb">
			<div class="glass border-t border-border transition-all duration-300 ease-out {actionBarExpanded ? 'pb-4' : 'pb-0'}">
				<!-- Toggle Handle -->
					<button
					onclick={() => actionBarExpanded = !actionBarExpanded}
					class="w-full py-2 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
				>
					<svg class="w-5 h-5 transition-transform duration-300 {actionBarExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
					</svg>
					<span class="text-xs font-medium">{actionBarExpanded ? 'Hide Controls' : 'More Controls'}</span>
					</button>

				<!-- Main Quick Actions -->
				<div class="px-4 pb-3 flex justify-center gap-3">
				<button
					onclick={startCalibration}
						disabled={calibrationMode || !isStreaming}
						class="flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-200 active:scale-95 bg-primary/20 hover:bg-primary/30 text-primary border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
				>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-xs font-medium">Calibrate</span>
				</button>
				<button
						onclick={() => showZoneSettings = !showZoneSettings}
						class="flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-200 active:scale-95 bg-secondary hover:bg-secondary/80 text-foreground border-border"
				>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
						</svg>
						<span class="text-xs font-medium">Zones</span>
				</button>
				<button
						onclick={() => showShotTimer = !showShotTimer}
						class="flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-200 active:scale-95 bg-warning/20 hover:bg-warning/30 text-warning border-warning/30"
				>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-xs font-medium">Timer</span>
				</button>
					<button
						onclick={clearHits}
						disabled={hits.length === 0}
						class="flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-200 active:scale-95 bg-destructive/20 hover:bg-destructive/30 text-destructive border-destructive/30 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						<span class="text-xs font-medium">Clear</span>
					</button>
				</div>

				<!-- Expanded Controls -->
				{#if actionBarExpanded}
					<div class="px-4 pt-3 border-t border-border/50 animate-fade-in">
						<div class="grid grid-cols-4 gap-3 max-w-md mx-auto">
				<button
								onclick={clearCalibration}
								disabled={!targetBoundary}
								class="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all duration-200 active:scale-95 bg-secondary hover:bg-secondary/80 text-foreground border-border disabled:opacity-50 disabled:cursor-not-allowed"
				>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
								<span class="text-[10px] font-medium">Reset Cal</span>
				</button>
				<button
								onclick={() => { isSetupComplete = false; }}
								class="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all duration-200 active:scale-95 bg-secondary hover:bg-secondary/80 text-foreground border-border"
				>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span class="text-[10px] font-medium">Target</span>
				</button>
				<button
					onclick={() => showVisualizationControls = !showVisualizationControls}
								class="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all duration-200 active:scale-95 bg-secondary hover:bg-secondary/80 text-foreground border-border"
				>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
								</svg>
								<span class="text-[10px] font-medium">Sequence</span>
				</button>
				<button
								onclick={() => {}}
								class="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all duration-200 active:scale-95 bg-secondary hover:bg-secondary/80 text-foreground border-border"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								</svg>
								<span class="text-[10px] font-medium">Settings</span>
				</button>
						</div>

						<!-- Debug Section -->
						<div class="mt-4 pt-3 border-t border-border/50 flex justify-center gap-3">
				<button
								onclick={() => showDiagnosticOverlay = !showDiagnosticOverlay}
								class="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
				>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
								</svg>
								Diagnostic
				</button>
				<button
								onclick={() => showDebugOverlay = !showDebugOverlay}
								class="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
				>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
								</svg>
								Debug
				</button>
		</div>
					</div>
				{/if}

				<!-- Zone Settings Panel - Mobile (in bottom action bar) -->
		{#if showZoneSettings}
					<div class="px-4 pt-3 border-t border-border/50 animate-fade-in max-h-[50vh] overflow-y-auto md:hidden">
						<div class="bg-secondary/50 rounded-lg p-4 mb-4">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold">Custom Zone Settings</h3>
					<button
									onclick={() => showZoneSettings = false}
									class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
									aria-label="Close zone settings"
					>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
					</button>
				</div>
				<div class="space-y-6">
					{#each ['A', 'C', 'D'] as zoneName}
						{@const zone = zones[zoneName]}
									<div class="border border-border rounded-lg p-4 bg-background/50">
							<div class="flex items-center gap-3 mb-3">
								<div
									class="w-6 h-6 rounded border-2"
									style="background-color: {zone.color}; border-color: {zone.color};"
								></div>
								<h4 class="text-md font-semibold" style="color: {zone.color}">
									{zoneName}-zone ({zone.points} pts)
								</h4>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<!-- Points -->
								<div>
												<label for="points-{zoneName}-mobile" class="block text-sm text-muted-foreground mb-1">Points</label>
									<input
													id="points-{zoneName}-mobile"
										type="number"
										min="0"
										max="10"
										value={zone.points}
										oninput={(e) => updateZonePoints(zoneName, e.target.value)}
													class="w-full bg-background border border-border rounded px-3 py-2 text-foreground"
									/>
								</div>
								<!-- X-axis bounds -->
								<div>
												<div class="block text-sm text-muted-foreground mb-1">
										X-axis: {zone.bounds.x[0].toFixed(2)} - {zone.bounds.x[1].toFixed(2)}
									</div>
									<div class="space-y-2">
										<div>
														<label for="x-min-{zoneName}-mobile" class="text-xs text-muted-foreground">Min X:</label>
											<input
															id="x-min-{zoneName}-mobile"
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={zone.bounds.x[0]}
												oninput={(e) => updateZoneBounds(zoneName, 'x', 0, e.target.value)}
												class="w-full"
											/>
										</div>
										<div>
														<label for="x-max-{zoneName}-mobile" class="text-xs text-muted-foreground">Max X:</label>
											<input
															id="x-max-{zoneName}-mobile"
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={zone.bounds.x[1]}
												oninput={(e) => updateZoneBounds(zoneName, 'x', 1, e.target.value)}
												class="w-full"
											/>
										</div>
									</div>
								</div>
								<!-- Y-axis bounds -->
								<div>
												<div class="block text-sm text-muted-foreground mb-1">
										Y-axis: {zone.bounds.y[0].toFixed(2)} - {zone.bounds.y[1].toFixed(2)}
									</div>
									<div class="space-y-2">
										<div>
														<label for="y-min-{zoneName}-mobile" class="text-xs text-muted-foreground">Min Y:</label>
											<input
															id="y-min-{zoneName}-mobile"
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={zone.bounds.y[0]}
												oninput={(e) => updateZoneBounds(zoneName, 'y', 0, e.target.value)}
												class="w-full"
											/>
										</div>
										<div>
														<label for="y-max-{zoneName}-mobile" class="text-xs text-muted-foreground">Max Y:</label>
											<input
															id="y-max-{zoneName}-mobile"
												type="range"
												min="0"
												max="1"
												step="0.01"
												value={zone.bounds.y[1]}
												oninput={(e) => updateZoneBounds(zoneName, 'y', 1, e.target.value)}
												class="w-full"
											/>
										</div>
									</div>
								</div>
								<!-- Zone preview info -->
											<div class="text-xs text-muted-foreground">
									<p>Zone covers:</p>
									<p>
										{((zone.bounds.x[1] - zone.bounds.x[0]) * 100).toFixed(0)}% width ×{' '}
										{((zone.bounds.y[1] - zone.bounds.y[0]) * 100).toFixed(0)}% height
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
							<div class="flex items-center justify-between mt-4 pt-4 border-t border-border">
								<p class="text-xs text-muted-foreground">
					💡 Tip: Zones are checked from innermost (A) to outermost (D). Make sure A-zone is inside C-zone,
					and C-zone is inside D-zone for best results.
				</p>
								<button
									onclick={resetZonesToDefaults}
									class="bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
								>
									Reset to Defaults
								</button>
			</div>
							</div>
						</div>
					{/if}
					
				<!-- Shot Timer Panel - Mobile (in bottom action bar) -->
				{#if showShotTimer}
					<div class="px-4 pt-3 border-t border-border/50 animate-fade-in max-h-[50vh] overflow-y-auto md:hidden">
						<div class="bg-secondary/50 rounded-lg p-4 mb-4">
							<div class="flex items-center justify-between mb-4">
								<h3 class="text-lg font-semibold">Shot Timer</h3>
						<button
									onclick={() => showShotTimer = false}
									class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
									aria-label="Close shot timer"
						>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
						</button>
				</div>
				
				{#if !shotTimerActive && shotTimerPhase === 'idle'}
					<!-- Timer Controls -->
					<div class="space-y-4">
						<!-- Random Delay Settings -->
						<div>
										<div class="block text-sm text-muted-foreground mb-2">Random Delay (seconds):</div>
							<div class="flex items-center gap-3">
								<input
												id="delay-min-mobile"
									type="number"
									min="1"
									max="10"
									value={shotTimerConfig.randomDelayMin / 1000}
									oninput={(e) => {
										const val = parseFloat(e.target.value) * 1000;
										if (!isNaN(val) && val > 0 && val <= shotTimerConfig.randomDelayMax) {
											shotTimerConfig.randomDelayMin = val;
											shotTimerConfig = { ...shotTimerConfig };
										}
									}}
												class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
								/>
											<span class="text-muted-foreground">to</span>
								<input
												id="delay-max-mobile"
									type="number"
									min="1"
									max="10"
									value={shotTimerConfig.randomDelayMax / 1000}
									oninput={(e) => {
										const val = parseFloat(e.target.value) * 1000;
										if (!isNaN(val) && val > 0 && val >= shotTimerConfig.randomDelayMin) {
											shotTimerConfig.randomDelayMax = val;
											shotTimerConfig = { ...shotTimerConfig };
										}
									}}
												class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
								/>
							</div>
										<p class="text-xs text-muted-foreground mt-1">Timer will beep randomly between these times</p>
						</div>
						
						<!-- Volume Control -->
						<div>
										<label for="beep-volume-mobile" class="block text-sm text-muted-foreground mb-2">
								Beep Volume: {Math.round(shotTimerConfig.beepVolume * 100)}%
							</label>
							<input
											id="beep-volume-mobile"
								type="range"
								min="0"
								max="100"
								value={shotTimerConfig.beepVolume * 100}
								oninput={(e) => {
									shotTimerConfig.beepVolume = e.target.value / 100;
									shotTimerConfig = { ...shotTimerConfig };
								}}
								class="w-full"
							/>
						</div>
						
						<!-- Auto Next Round Settings -->
									<div class="border-t border-border pt-4 mt-4">
							<div class="flex items-center gap-3 mb-4">
								<input
												id="auto-next-round-mobile"
									type="checkbox"
									bind:checked={shotTimerConfig.autoNextRound}
									class="w-5 h-5"
								/>
											<label for="auto-next-round-mobile" class="text-sm font-semibold">
									Enable Automatic Next Round
								</label>
							</div>
							
							{#if shotTimerConfig.autoNextRound}
								<div class="space-y-3 ml-8">
									<!-- Round Count -->
									<div>
													<label for="round-count-mobile" class="block text-sm text-muted-foreground mb-2">
											Number of Rounds: {shotTimerConfig.roundCount}
										</label>
										<input
														id="round-count-mobile"
											type="number"
											min="1"
											max="100"
											value={shotTimerConfig.roundCount}
											oninput={(e) => {
												const val = parseInt(e.target.value);
												if (!isNaN(val) && val > 0 && val <= 100) {
													shotTimerConfig.roundCount = val;
													shotTimerConfig = { ...shotTimerConfig };
												}
											}}
														class="w-full bg-background border border-border rounded px-3 py-2 text-foreground"
										/>
									</div>
									
									<!-- Reset Duration -->
									<div>
													<label for="reset-duration-mobile" class="block text-sm text-muted-foreground mb-2">
											Reset Duration: {(shotTimerConfig.resetDuration / 1000).toFixed(1)}s
										</label>
										<input
														id="reset-duration-mobile"
											type="range"
											min="1"
											max="10"
											step="0.5"
											value={shotTimerConfig.resetDuration / 1000}
											oninput={(e) => {
												const val = parseFloat(e.target.value) * 1000;
												if (!isNaN(val) && val >= 1000 && val <= 10000) {
													shotTimerConfig.resetDuration = val;
													shotTimerConfig = { ...shotTimerConfig };
												}
											}}
											class="w-full"
										/>
													<p class="text-xs text-muted-foreground mt-1">Time between rounds before next drill starts</p>
									</div>
								</div>
							{/if}
						</div>
						
						<!-- Round Counter Display -->
						{#if shotTimerConfig.autoNextRound && currentRound > 0}
										<div class="mt-4 pt-4 border-t border-border">
											<p class="text-sm text-muted-foreground text-center">
									Round {currentRound} of {shotTimerConfig.roundCount}
								</p>
							</div>
						{/if}
						
						<!-- Start Button -->
						<button
							onclick={shotTimerSession.reps.length === 0 ? startSession : startDrill}
							disabled={shotTimerActive}
										class="w-full bg-primary hover:bg-primary/90 disabled:bg-secondary disabled:cursor-not-allowed px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
						>
							I'm Ready - Start Drill
						</button>
						
						{#if shotTimerSession.reps.length > 0}
										<div class="mt-4 pt-4 border-t border-border">
											<p class="text-sm text-muted-foreground mb-2">
									Session: {shotTimerSession.reps.length} rep{shotTimerSession.reps.length !== 1 ? 's' : ''} completed
								</p>
								<button
									onclick={() => showSessionStats = !showSessionStats}
												class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
								>
									{showSessionStats ? 'Hide' : 'View'} Session Stats
								</button>
							</div>
						{/if}
					</div>
				{:else if shotTimerPhase === 'waiting'}
					<!-- Waiting for beep -->
					<div class="text-center py-8">
						{#if shotTimerConfig.autoNextRound && currentRound > 0}
										<div class="text-sm text-muted-foreground mb-2">Round {currentRound} of {shotTimerConfig.roundCount}</div>
						{/if}
									<div class="inline-block w-3 h-3 bg-warning rounded-full animate-pulse mb-4"></div>
						<p class="text-lg font-semibold mb-4">Get ready... Timer will beep soon</p>
						<button
							onclick={cancelDrill}
										class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
						>
							Cancel Drill
						</button>
					</div>
				{:else if shotTimerPhase === 'active'}
					<!-- Timer active -->
					{@const _ = timerDisplayUpdate} <!-- Trigger reactivity -->
								<div class="text-center py-8 border-2 border-success rounded-lg">
						{#if shotTimerConfig.autoNextRound && currentRound > 0}
										<div class="text-sm text-muted-foreground mb-2">Round {currentRound} of {shotTimerConfig.roundCount}</div>
						{/if}
									<div class="text-5xl font-bold font-mono text-success mb-4">
							{formatTime(getCurrentElapsed())}s
						</div>
						<p class="text-xl font-semibold mb-4">⏱️ TIMER ACTIVE - SHOOT!</p>
						<button
							onclick={cancelDrill}
										class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
						>
							Cancel
						</button>
					</div>
				{:else if shotTimerPhase === 'complete'}
					<!-- Rep complete -->
					{@const lastRep = shotTimerSession.reps[shotTimerSession.reps.length - 1]}
					<div class="space-y-4">
						{#if shotTimerConfig.autoNextRound && currentRound > 0}
							<div class="text-center mb-2">
											<div class="text-sm text-muted-foreground">Round {currentRound} of {shotTimerConfig.roundCount}</div>
								{#if currentRound >= shotTimerConfig.roundCount}
												<div class="text-lg font-semibold text-success mt-2">Session Complete!</div>
								{/if}
							</div>
						{/if}
						<div class="text-center py-4">
										<div class="text-sm text-muted-foreground mb-2">Draw Time:</div>
										<div class="text-4xl font-bold font-mono text-success mb-4">
								{formatTime(lastRep.drawTime)}s
							</div>
							<div class="flex items-center justify-center gap-4 text-lg">
								<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
									{lastRep.hit.zone}
								</span>
								{#if lastRep.hit.points !== null}
												<span class="text-warning font-semibold">+{lastRep.hit.points} pts</span>
								{/if}
							</div>
						</div>
						
						{#if shotTimerConfig.autoNextRound && currentRound < shotTimerConfig.roundCount && autoNextCountdown !== null}
										<div class="bg-primary/20 border border-primary rounded-lg p-4 text-center">
											<div class="text-sm text-muted-foreground mb-2">Next round starting in:</div>
											<div class="text-3xl font-bold font-mono text-primary">
									{(autoNextCountdown / 1000).toFixed(1)}s
								</div>
							</div>
						{/if}
						
						<div class="flex gap-3">
							{#if !shotTimerConfig.autoNextRound || currentRound >= shotTimerConfig.roundCount}
								<button
									onclick={nextRep}
												class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
									disabled={shotTimerConfig.autoNextRound && currentRound >= shotTimerConfig.roundCount}
								>
									Next Rep
								</button>
							{/if}
							<button
								onclick={() => {
									showSessionStats = true;
									shotTimerPhase = 'idle';
									if (shotTimerAutoNextTimeout) {
										clearTimeout(shotTimerAutoNextTimeout);
										shotTimerAutoNextTimeout = null;
									}
									autoNextCountdown = null;
									// Reset round counter if session was completed
									if (shotTimerConfig.autoNextRound && currentRound >= shotTimerConfig.roundCount) {
										currentRound = 0;
									}
								}}
											class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
							>
								View Stats
							</button>
						</div>
			</div>
		{/if}

							<!-- Session Statistics - Mobile -->
		{#if showSessionStats && shotTimerSession.reps.length > 0}
								<div class="mt-6 pt-6 border-t border-border">
									<h4 class="text-lg font-semibold mb-4">Draw Timer Session</h4>
				
				<!-- Session Stats -->
									<div class="grid grid-cols-2 gap-4 mb-6">
										<div class="bg-background/50 rounded-lg p-4 text-center">
											<div class="text-sm text-muted-foreground mb-1">Reps</div>
						<div class="text-2xl font-bold font-mono">{shotTimerSession.reps.length}</div>
					</div>
										<div class="bg-background/50 rounded-lg p-4 text-center">
											<div class="text-sm text-muted-foreground mb-1">Average</div>
						<div class="text-2xl font-bold font-mono">{formatTime(calculateAverage())}s</div>
					</div>
										<div class="bg-background/50 rounded-lg p-4 text-center">
											<div class="text-sm text-muted-foreground mb-1">Best</div>
											<div class="text-2xl font-bold font-mono text-success">{formatTime(calculateBest())}s</div>
					</div>
										<div class="bg-background/50 rounded-lg p-4 text-center">
											<div class="text-sm text-muted-foreground mb-1">Worst</div>
											<div class="text-2xl font-bold font-mono text-destructive">{formatTime(calculateWorst())}s</div>
					</div>
				</div>
				
				<!-- Accuracy Breakdown -->
				{#if calculateAccuracyByZone().length > 0}
					<div class="mb-6">
											<h5 class="text-md font-semibold mb-3">Accuracy</h5>
						<div class="space-y-2">
							{#each calculateAccuracyByZone() as zone}
													<div class="flex justify-between items-center py-2 border-b border-border">
									<span style="color: {zone.color}; font-weight: 600;">{zone.name}</span>
														<span class="text-foreground">
										{zone.count}/{shotTimerSession.reps.length} ({zone.percentage}%)
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				
				<!-- Individual Reps List -->
				<div class="mb-6">
										<h5 class="text-md font-semibold mb-3">Individual Reps</h5>
										<div class="space-y-2 max-h-48 overflow-y-auto">
								{#each shotTimerSession.reps as rep, index}
												<div class="flex justify-between items-center py-2 px-3 bg-background/50 rounded text-sm">
													<div class="flex items-center gap-3">
														<span class="text-muted-foreground">#{index + 1}</span>
														<span class="font-mono">{formatTime(rep.drawTime)}s</span>
													</div>
													<div class="flex items-center gap-2">
														<span style="color: {rep.hit.zoneColor}; font-weight: 600;">{rep.hit.zone}</span>
														{#if rep.hit.points !== null}
															<span class="text-muted-foreground">+{rep.hit.points}</span>
														{/if}
													</div>
												</div>
								{/each}
					</div>
				</div>
				
				<!-- Session Actions -->
				<div class="flex gap-3">
					<button
						onclick={() => {
							showSessionStats = false;
												shotTimerCooldownUntil = null;
							startDrill();
						}}
											class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
					>
											Continue
					</button>
					<button
						onclick={() => {
							shotTimerSession = { reps: [], startedAt: null };
							showSessionStats = false;
							shotTimerPhase = 'idle';
						}}
											class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
					>
						End Session
					</button>
				</div>
			</div>
		{/if}
				</div>
			</div>
		{/if}

				<!-- Shot Sequence Visualization Panel - Mobile (in bottom action bar) -->
				{#if showVisualizationControls}
					<div class="px-4 pt-3 border-t border-border/50 animate-fade-in max-h-[50vh] overflow-y-auto md:hidden">
						<div class="bg-secondary/50 rounded-lg p-4 mb-4">
							<div class="flex items-center justify-between mb-4">
								<h3 class="text-lg font-semibold">Shot Sequence Visualization</h3>
								<button
									onclick={() => showVisualizationControls = false}
									class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
									aria-label="Close sequence controls"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
		</div>

						<div class="space-y-4">
								<!-- Toggle Controls -->
							<div class="flex items-center gap-3">
								<input
										id="show-shot-numbers-mobile"
										type="checkbox"
										checked={visualizationState.showShotNumbers}
										onchange={(e) => {
											visualizationState.showShotNumbers = e.target.checked;
											visualizationState = { ...visualizationState };
										}}
										class="w-5 h-5"
									/>
									<label for="show-shot-numbers-mobile" class="cursor-pointer">
										Show Shot Numbers
								</label>
							</div>
								
							<div class="flex items-center gap-3">
								<input
										id="show-sequence-lines-mobile"
										type="checkbox"
										checked={visualizationState.showSequenceLines}
										onchange={(e) => {
											visualizationState.showSequenceLines = e.target.checked;
											visualizationState = { ...visualizationState };
										}}
										class="w-5 h-5"
									/>
									<label for="show-sequence-lines-mobile" class="cursor-pointer">
										Show Sequence Lines
								</label>
							</div>
								
								<!-- Line Color Picker -->
							<div class="flex items-center gap-3">
									<label for="line-color-mobile" class="text-sm">Line Color:</label>
								<input
										id="line-color-mobile"
										type="color"
										value={visualizationState.lineColor}
										oninput={(e) => {
											visualizationState.lineColor = e.target.value;
											visualizationState = { ...visualizationState };
										}}
										class="w-16 h-8 border border-border rounded cursor-pointer"
									/>
						</div>

								<!-- Replay Mode Controls -->
								{#if hits.length > 0}
									<div class="pt-4 border-t border-border">
										<label for="replay-slider-mobile" class="block mb-2">
											Replay Mode:
										</label>
										<input
											id="replay-slider-mobile"
											type="range"
											min="0"
											max={hits.length}
											value={visualizationState.currentReplayShot}
											oninput={(e) => {
												const val = parseInt(e.target.value);
												visualizationState.currentReplayShot = val;
												visualizationState.showAllShots = val === 0;
												visualizationState = { ...visualizationState };
											}}
											class="w-full"
										/>
										<div class="text-center text-sm text-muted-foreground mt-1">
											{visualizationState.currentReplayShot === 0 
												? 'All Shots' 
												: `Shot ${visualizationState.currentReplayShot} of ${hits.length}`}
						</div>
					</div>
				{/if}

								<!-- Shot Group Analysis -->
								{#if hits.length >= 2}
									{@const grouping = calculateShotGrouping(hits)}
									{#if grouping}
										<div class="pt-4 border-t border-border">
											<h4 class="text-md font-semibold mb-3">Shot Group Analysis</h4>
											<div class="space-y-2">
												<div class="flex justify-between text-sm">
													<span class="text-muted-foreground">Group Size (avg):</span>
													<span class="font-semibold">{grouping.groupSize}</span>
												</div>
												<div class="flex justify-between text-sm">
													<span class="text-muted-foreground">Max Spread:</span>
													<span class="font-semibold">{grouping.maxSpread}px</span>
												</div>
												<div class="flex justify-between text-sm">
													<span class="text-muted-foreground">Total Shots:</span>
													<span class="font-semibold">{hits.length}</span>
												</div>
											</div>
						</div>
					{/if}
							{/if}
								
								<!-- Export Button -->
								{#if hits.length > 0}
						<button
										onclick={exportShotPattern}
										class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
						>
										📸 Export Shot Pattern
						</button>
					{/if}
							</div>
							</div>
						</div>
					{/if}
				</div>
		</div>
					{/if}
				</div>

	<!-- Zone Settings Panel - Desktop (side panel) -->
				{#if showZoneSettings}
		<div class="hidden md:block fixed top-0 right-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto">
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-xl font-semibold">Custom Zone Settings</h3>
							<button
						onclick={() => showZoneSettings = false}
						class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
						aria-label="Close zone settings"
							>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
							</button>
						</div>
						<div class="space-y-6">
							{#each ['A', 'C', 'D'] as zoneName}
								{@const zone = zones[zoneName]}
						<div class="border border-border rounded-lg p-4 bg-background/50">
									<div class="flex items-center gap-3 mb-3">
										<div
											class="w-6 h-6 rounded border-2"
											style="background-color: {zone.color}; border-color: {zone.color};"
										></div>
										<h4 class="text-md font-semibold" style="color: {zone.color}">
											{zoneName}-zone ({zone.points} pts)
										</h4>
									</div>
							<div class="space-y-4">
										<!-- Points -->
										<div>
									<label for="points-{zoneName}-desktop" class="block text-sm text-muted-foreground mb-1">Points</label>
											<input
												id="points-{zoneName}-desktop"
												type="number"
												min="0"
												max="10"
												value={zone.points}
												oninput={(e) => updateZonePoints(zoneName, e.target.value)}
										class="w-full bg-background border border-border rounded px-3 py-2 text-foreground"
											/>
										</div>
										<!-- X-axis bounds -->
										<div>
									<div class="block text-sm text-muted-foreground mb-1">
												X-axis: {zone.bounds.x[0].toFixed(2)} - {zone.bounds.x[1].toFixed(2)}
											</div>
											<div class="space-y-2">
												<div>
											<label for="x-min-{zoneName}-desktop" class="text-xs text-muted-foreground">Min X:</label>
													<input
														id="x-min-{zoneName}-desktop"
														type="range"
														min="0"
														max="1"
														step="0.01"
														value={zone.bounds.x[0]}
														oninput={(e) => updateZoneBounds(zoneName, 'x', 0, e.target.value)}
														class="w-full"
													/>
												</div>
												<div>
											<label for="x-max-{zoneName}-desktop" class="text-xs text-muted-foreground">Max X:</label>
													<input
														id="x-max-{zoneName}-desktop"
														type="range"
														min="0"
														max="1"
														step="0.01"
														value={zone.bounds.x[1]}
														oninput={(e) => updateZoneBounds(zoneName, 'x', 1, e.target.value)}
														class="w-full"
													/>
												</div>
											</div>
										</div>
										<!-- Y-axis bounds -->
										<div>
									<div class="block text-sm text-muted-foreground mb-1">
												Y-axis: {zone.bounds.y[0].toFixed(2)} - {zone.bounds.y[1].toFixed(2)}
											</div>
											<div class="space-y-2">
												<div>
											<label for="y-min-{zoneName}-desktop" class="text-xs text-muted-foreground">Min Y:</label>
													<input
														id="y-min-{zoneName}-desktop"
														type="range"
														min="0"
														max="1"
														step="0.01"
														value={zone.bounds.y[0]}
														oninput={(e) => updateZoneBounds(zoneName, 'y', 0, e.target.value)}
														class="w-full"
													/>
												</div>
												<div>
											<label for="y-max-{zoneName}-desktop" class="text-xs text-muted-foreground">Max Y:</label>
													<input
														id="y-max-{zoneName}-desktop"
														type="range"
														min="0"
														max="1"
														step="0.01"
														value={zone.bounds.y[1]}
														oninput={(e) => updateZoneBounds(zoneName, 'y', 1, e.target.value)}
														class="w-full"
													/>
												</div>
											</div>
										</div>
										<!-- Zone preview info -->
								<div class="text-xs text-muted-foreground">
											<p>Zone covers:</p>
											<p>
												{((zone.bounds.x[1] - zone.bounds.x[0]) * 100).toFixed(0)}% width ×{' '}
												{((zone.bounds.y[1] - zone.bounds.y[0]) * 100).toFixed(0)}% height
											</p>
										</div>
									</div>
								</div>
							{/each}
						</div>
				<div class="mt-6 pt-6 border-t border-border">
					<p class="text-xs text-muted-foreground mb-4">
							💡 Tip: Zones are checked from innermost (A) to outermost (D). Make sure A-zone is inside C-zone,
							and C-zone is inside D-zone for best results.
						</p>
					<button
						onclick={resetZonesToDefaults}
						class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
					>
						Reset to Defaults
					</button>
					</div>
									</div>
								</div>
							{/if}
							
	<!-- Shot Timer Panel - Desktop (side panel) -->
	{#if showShotTimer}
		<div class="hidden md:block fixed top-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto" style="right: {showZoneSettings ? '384px' : '0'}">
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-xl font-semibold">Shot Timer</h3>
								<button
						onclick={() => showShotTimer = false}
						class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
						aria-label="Close shot timer"
								>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
								</button>
						</div>
						
						{#if !shotTimerActive && shotTimerPhase === 'idle'}
							<!-- Timer Controls -->
							<div class="space-y-4">
								<!-- Random Delay Settings -->
								<div>
							<div class="block text-sm text-muted-foreground mb-2">Random Delay (seconds):</div>
									<div class="flex items-center gap-3">
										<input
											id="delay-min-desktop"
											type="number"
											min="1"
											max="10"
											value={shotTimerConfig.randomDelayMin / 1000}
											oninput={(e) => {
												const val = parseFloat(e.target.value) * 1000;
												if (!isNaN(val) && val > 0 && val <= shotTimerConfig.randomDelayMax) {
													shotTimerConfig.randomDelayMin = val;
													shotTimerConfig = { ...shotTimerConfig };
												}
											}}
									class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
										/>
								<span class="text-muted-foreground">to</span>
										<input
											id="delay-max-desktop"
											type="number"
											min="1"
											max="10"
											value={shotTimerConfig.randomDelayMax / 1000}
											oninput={(e) => {
												const val = parseFloat(e.target.value) * 1000;
												if (!isNaN(val) && val > 0 && val >= shotTimerConfig.randomDelayMin) {
													shotTimerConfig.randomDelayMax = val;
													shotTimerConfig = { ...shotTimerConfig };
												}
											}}
									class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
										/>
									</div>
							<p class="text-xs text-muted-foreground mt-1">Timer will beep randomly between these times</p>
								</div>
								
								<!-- Volume Control -->
								<div>
							<label for="beep-volume-desktop" class="block text-sm text-muted-foreground mb-2">
										Beep Volume: {Math.round(shotTimerConfig.beepVolume * 100)}%
									</label>
									<input
										id="beep-volume-desktop"
										type="range"
										min="0"
										max="100"
										value={shotTimerConfig.beepVolume * 100}
										oninput={(e) => {
											shotTimerConfig.beepVolume = e.target.value / 100;
											shotTimerConfig = { ...shotTimerConfig };
										}}
										class="w-full"
									/>
								</div>
								
								<!-- Auto Next Round Settings -->
						<div class="border-t border-border pt-4 mt-4">
									<div class="flex items-center gap-3 mb-4">
										<input
											id="auto-next-round-desktop"
											type="checkbox"
											bind:checked={shotTimerConfig.autoNextRound}
											class="w-5 h-5"
										/>
								<label for="auto-next-round-desktop" class="text-sm font-semibold">
											Enable Automatic Next Round
										</label>
									</div>
									
									{#if shotTimerConfig.autoNextRound}
										<div class="space-y-3 ml-8">
											<!-- Round Count -->
											<div>
										<label for="round-count-desktop" class="block text-sm text-muted-foreground mb-2">
													Number of Rounds: {shotTimerConfig.roundCount}
												</label>
												<input
													id="round-count-desktop"
													type="number"
													min="1"
													max="100"
													value={shotTimerConfig.roundCount}
													oninput={(e) => {
														const val = parseInt(e.target.value);
														if (!isNaN(val) && val > 0 && val <= 100) {
															shotTimerConfig.roundCount = val;
															shotTimerConfig = { ...shotTimerConfig };
														}
													}}
											class="w-full bg-background border border-border rounded px-3 py-2 text-foreground"
												/>
											</div>
											
											<!-- Reset Duration -->
											<div>
										<label for="reset-duration-desktop" class="block text-sm text-muted-foreground mb-2">
													Reset Duration: {(shotTimerConfig.resetDuration / 1000).toFixed(1)}s
												</label>
												<input
													id="reset-duration-desktop"
													type="range"
													min="1"
													max="10"
													step="0.5"
													value={shotTimerConfig.resetDuration / 1000}
													oninput={(e) => {
														const val = parseFloat(e.target.value) * 1000;
														if (!isNaN(val) && val >= 1000 && val <= 10000) {
															shotTimerConfig.resetDuration = val;
															shotTimerConfig = { ...shotTimerConfig };
														}
													}}
													class="w-full"
												/>
										<p class="text-xs text-muted-foreground mt-1">Time between rounds before next drill starts</p>
											</div>
										</div>
									{/if}
								</div>
								
								<!-- Round Counter Display -->
								{#if shotTimerConfig.autoNextRound && currentRound > 0}
							<div class="mt-4 pt-4 border-t border-border">
								<p class="text-sm text-muted-foreground text-center">
											Round {currentRound} of {shotTimerConfig.roundCount}
										</p>
									</div>
								{/if}
								
								<!-- Start Button -->
								<button
									onclick={shotTimerSession.reps.length === 0 ? startSession : startDrill}
									disabled={shotTimerActive}
							class="w-full bg-primary hover:bg-primary/90 disabled:bg-secondary disabled:cursor-not-allowed px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
								>
									I'm Ready - Start Drill
								</button>
								
								{#if shotTimerSession.reps.length > 0}
							<div class="mt-4 pt-4 border-t border-border">
								<p class="text-sm text-muted-foreground mb-2">
											Session: {shotTimerSession.reps.length} rep{shotTimerSession.reps.length !== 1 ? 's' : ''} completed
										</p>
										<button
											onclick={() => showSessionStats = !showSessionStats}
									class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
										>
											{showSessionStats ? 'Hide' : 'View'} Session Stats
										</button>
									</div>
								{/if}
							</div>
						{:else if shotTimerPhase === 'waiting'}
							<!-- Waiting for beep -->
							<div class="text-center py-8">
								{#if shotTimerConfig.autoNextRound && currentRound > 0}
							<div class="text-sm text-muted-foreground mb-2">Round {currentRound} of {shotTimerConfig.roundCount}</div>
								{/if}
						<div class="inline-block w-3 h-3 bg-warning rounded-full animate-pulse mb-4"></div>
								<p class="text-lg font-semibold mb-4">Get ready... Timer will beep soon</p>
								<button
									onclick={cancelDrill}
							class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
								>
									Cancel Drill
								</button>
							</div>
						{:else if shotTimerPhase === 'active'}
							<!-- Timer active -->
							{@const _ = timerDisplayUpdate} <!-- Trigger reactivity -->
					<div class="text-center py-8 border-2 border-success rounded-lg">
								{#if shotTimerConfig.autoNextRound && currentRound > 0}
							<div class="text-sm text-muted-foreground mb-2">Round {currentRound} of {shotTimerConfig.roundCount}</div>
								{/if}
						<div class="text-5xl font-bold font-mono text-success mb-4">
									{formatTime(getCurrentElapsed())}s
								</div>
								<p class="text-xl font-semibold mb-4">⏱️ TIMER ACTIVE - SHOOT!</p>
								<button
									onclick={cancelDrill}
							class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
								>
									Cancel
								</button>
							</div>
						{:else if shotTimerPhase === 'complete'}
							<!-- Rep complete -->
							{@const lastRep = shotTimerSession.reps[shotTimerSession.reps.length - 1]}
							<div class="space-y-4">
								{#if shotTimerConfig.autoNextRound && currentRound > 0}
									<div class="text-center mb-2">
								<div class="text-sm text-muted-foreground">Round {currentRound} of {shotTimerConfig.roundCount}</div>
										{#if currentRound >= shotTimerConfig.roundCount}
									<div class="text-lg font-semibold text-success mt-2">Session Complete!</div>
										{/if}
									</div>
								{/if}
								<div class="text-center py-4">
							<div class="text-sm text-muted-foreground mb-2">Draw Time:</div>
							<div class="text-4xl font-bold font-mono text-success mb-4">
										{formatTime(lastRep.drawTime)}s
									</div>
									<div class="flex items-center justify-center gap-4 text-lg">
										<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
											{lastRep.hit.zone}
										</span>
										{#if lastRep.hit.points !== null}
									<span class="text-warning font-semibold">+{lastRep.hit.points} pts</span>
										{/if}
									</div>
								</div>
								
								{#if shotTimerConfig.autoNextRound && currentRound < shotTimerConfig.roundCount && autoNextCountdown !== null}
							<div class="bg-primary/20 border border-primary rounded-lg p-4 text-center">
								<div class="text-sm text-muted-foreground mb-2">Next round starting in:</div>
								<div class="text-3xl font-bold font-mono text-primary">
											{(autoNextCountdown / 1000).toFixed(1)}s
										</div>
									</div>
								{/if}
								
								<div class="flex gap-3">
									{#if !shotTimerConfig.autoNextRound || currentRound >= shotTimerConfig.roundCount}
										<button
											onclick={nextRep}
									class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
											disabled={shotTimerConfig.autoNextRound && currentRound >= shotTimerConfig.roundCount}
										>
											Next Rep
										</button>
									{/if}
									<button
										onclick={() => {
											showSessionStats = true;
											shotTimerPhase = 'idle';
											if (shotTimerAutoNextTimeout) {
												clearTimeout(shotTimerAutoNextTimeout);
												shotTimerAutoNextTimeout = null;
											}
											autoNextCountdown = null;
											// Reset round counter if session was completed
											if (shotTimerConfig.autoNextRound && currentRound >= shotTimerConfig.roundCount) {
												currentRound = 0;
											}
										}}
								class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
									>
										View Stats
									</button>
								</div>
							</div>
						{/if}
			</div>
					</div>
				{/if}

	<!-- Session Statistics Panel - Desktop -->
				{#if showSessionStats && shotTimerSession.reps.length > 0}
		<div class="hidden md:block fixed top-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto" style="right: {(showZoneSettings ? 384 : 0) + (showShotTimer ? 384 : 0) + (showVisualizationControls ? 384 : 0)}px">
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-xl font-semibold">Draw Timer Session</h3>
					<button
						onclick={() => showSessionStats = false}
						class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
						aria-label="Close session stats"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
						
						<!-- Session Stats -->
				<div class="grid grid-cols-2 gap-4 mb-6">
					<div class="bg-secondary rounded-lg p-4 text-center">
						<div class="text-sm text-muted-foreground mb-1">Reps Completed</div>
								<div class="text-2xl font-bold font-mono">{shotTimerSession.reps.length}</div>
							</div>
					<div class="bg-secondary rounded-lg p-4 text-center">
						<div class="text-sm text-muted-foreground mb-1">Average Time</div>
								<div class="text-2xl font-bold font-mono">{formatTime(calculateAverage())}s</div>
							</div>
					<div class="bg-secondary rounded-lg p-4 text-center">
						<div class="text-sm text-muted-foreground mb-1">Best Time</div>
						<div class="text-2xl font-bold font-mono text-success">{formatTime(calculateBest())}s</div>
							</div>
					<div class="bg-secondary rounded-lg p-4 text-center">
						<div class="text-sm text-muted-foreground mb-1">Worst Time</div>
						<div class="text-2xl font-bold font-mono text-destructive">{formatTime(calculateWorst())}s</div>
							</div>
						</div>
						
						<!-- Accuracy Breakdown -->
						{#if calculateAccuracyByZone().length > 0}
							<div class="mb-6">
								<h4 class="text-lg font-semibold mb-3">Accuracy</h4>
								<div class="space-y-2">
									{#each calculateAccuracyByZone() as zone}
								<div class="flex justify-between items-center py-2 border-b border-border">
											<span style="color: {zone.color}; font-weight: 600;">{zone.name}</span>
									<span class="text-foreground">
												{zone.count}/{shotTimerSession.reps.length} ({zone.percentage}%)
											</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						
						<!-- Individual Reps List -->
						<div class="mb-6">
							<h4 class="text-lg font-semibold mb-3">Individual Reps</h4>
							<div class="overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
								<tr class="border-b border-border">
									<th class="text-left py-2 text-muted-foreground">#</th>
									<th class="text-left py-2 text-muted-foreground">Time</th>
									<th class="text-left py-2 text-muted-foreground">Zone</th>
									<th class="text-left py-2 text-muted-foreground">Points</th>
										</tr>
									</thead>
									<tbody>
										{#each shotTimerSession.reps as rep, index}
									<tr class="border-b border-border">
										<td class="py-2">{index + 1}</td>
										<td class="py-2 font-mono">{formatTime(rep.drawTime)}s</td>
												<td class="py-2" style="color: {rep.hit.zoneColor}; font-weight: 600;">{rep.hit.zone}</td>
										<td class="py-2">{rep.hit.points !== null ? `+${rep.hit.points}` : '-'}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
						
						<!-- Session Actions -->
						<div class="flex gap-3">
							<button
								onclick={() => {
									showSessionStats = false;
									shotTimerCooldownUntil = null;
									startDrill();
								}}
						class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
							>
								Continue Session
							</button>
							<button
								onclick={() => {
									shotTimerSession = { reps: [], startedAt: null };
									showSessionStats = false;
									shotTimerPhase = 'idle';
								}}
						class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
							>
								End Session
							</button>
				</div>
						</div>
					</div>
				{/if}

	<!-- Shot Sequence Visualization Panel - Desktop (side panel) -->
	{#if showVisualizationControls}
		<div class="hidden md:block fixed top-0 h-full w-96 bg-card border-l border-border z-50 shadow-2xl overflow-y-auto" style="right: {(showZoneSettings ? 384 : 0) + (showShotTimer ? 384 : 0)}px">
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-xl font-semibold">Shot Sequence Visualization</h3>
					<button
						onclick={() => showVisualizationControls = false}
						class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
						aria-label="Close sequence controls"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
						</div>
				
				<div class="space-y-4">
					<!-- Toggle Controls -->
					<div class="flex items-center gap-3">
						<input
							id="show-shot-numbers-desktop"
							type="checkbox"
							checked={visualizationState.showShotNumbers}
							onchange={(e) => {
								visualizationState.showShotNumbers = e.target.checked;
								visualizationState = { ...visualizationState };
							}}
							class="w-5 h-5"
						/>
						<label for="show-shot-numbers-desktop" class="cursor-pointer">
							Show Shot Numbers
						</label>
						</div>
					
					<div class="flex items-center gap-3">
						<input
							id="show-sequence-lines-desktop"
							type="checkbox"
							checked={visualizationState.showSequenceLines}
							onchange={(e) => {
								visualizationState.showSequenceLines = e.target.checked;
								visualizationState = { ...visualizationState };
							}}
							class="w-5 h-5"
						/>
						<label for="show-sequence-lines-desktop" class="cursor-pointer">
							Show Sequence Lines
						</label>
						</div>
					
					<!-- Line Color Picker -->
					<div class="flex items-center gap-3">
						<label for="line-color-desktop" class="text-sm">Line Color:</label>
						<input
							id="line-color-desktop"
							type="color"
							value={visualizationState.lineColor}
							oninput={(e) => {
								visualizationState.lineColor = e.target.value;
								visualizationState = { ...visualizationState };
							}}
							class="w-16 h-8 border border-border rounded cursor-pointer"
						/>
				</div>

					<!-- Replay Mode Controls -->
				{#if hits.length > 0}
						<div class="pt-4 border-t border-border">
							<label for="replay-slider-desktop" class="block mb-2">
								Replay Mode:
							</label>
							<input
								id="replay-slider-desktop"
								type="range"
								min="0"
								max={hits.length}
								value={visualizationState.currentReplayShot}
								oninput={(e) => {
									const val = parseInt(e.target.value);
									visualizationState.currentReplayShot = val;
									visualizationState.showAllShots = val === 0;
									visualizationState = { ...visualizationState };
								}}
								class="w-full"
							/>
							<div class="text-center text-sm text-muted-foreground mt-1">
								{visualizationState.currentReplayShot === 0 
									? 'All Shots' 
									: `Shot ${visualizationState.currentReplayShot} of ${hits.length}`}
									</div>
								</div>
							{/if}
					
					<!-- Shot Group Analysis -->
					{#if hits.length >= 2}
						{@const grouping = calculateShotGrouping(hits)}
						{#if grouping}
							<div class="pt-4 border-t border-border">
								<h4 class="text-md font-semibold mb-3">Shot Group Analysis</h4>
								<div class="space-y-2">
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">Group Size (avg):</span>
										<span class="font-semibold">{grouping.groupSize}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">Max Spread:</span>
										<span class="font-semibold">{grouping.maxSpread}px</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">Total Shots:</span>
										<span class="font-semibold">{hits.length}</span>
									</div>
									</div>
								</div>
							{/if}
				{/if}

					<!-- Export Button -->
					{#if hits.length > 0}
						<button
							onclick={exportShotPattern}
							class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
						>
							📸 Export Shot Pattern
						</button>
												{/if}
									</div>
								</div>
						</div>
					{/if}

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
