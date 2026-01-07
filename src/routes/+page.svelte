<script>
	import { onMount, onDestroy } from 'svelte';
	import MobileLayout from '$lib/components/MobileLayout.svelte';

	// State
	let videoElement;
	let canvasElement;
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
		r: 200,
		g: 100,
		b: 100
	};
	const GREEN_THRESHOLD = {
		r: 100,
		g: 200,
		b: 100
	};
	const CLUSTER_RADIUS = 10; // pixels
	const MIN_LASER_SIZE = 3; // minimum pixels to consider a hit

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
	let targetMode = $state('preloaded'); // 'preloaded' | 'custom' | 'freeform'
	let selectedTemplate = $state('ipsc-classic');
	let showTargetModeSelection = $state(false);
	
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
		beepFrequency: 1000 // Hz
	});
	let shotTimerSession = $state({
		reps: [],
		startedAt: null
	});
	let shotTimerDelayTimeout = null;
	let audioContext = null;
	let showShotTimer = $state(false);
	let showSessionStats = $state(false);
	let timerDisplayUpdate = $state(0); // Force reactivity for timer display
	let shotTimerCooldownUntil = $state(null); // Cooldown period after timer stops
	let lastCalibrationClickTime = 0; // Debounce calibration clicks
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
	let drawerRef = null; // Reference to MobileLayout component

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

		// Scan for bright red or green pixels
		for (let y = 0; y < height; y += 2) {
			// Sample every 2nd pixel for performance
			for (let x = 0; x < width; x += 2) {
				const idx = (y * width + x) * 4;
				const r = pixels[idx];
				const g = pixels[idx + 1];
				const b = pixels[idx + 2];

				// Check for red laser
				if (r > RED_THRESHOLD.r && g < RED_THRESHOLD.g && b < RED_THRESHOLD.b) {
					const cluster = findCluster(x, y, pixels, width, height, 'red', visited);
					if (cluster && cluster.size >= MIN_LASER_SIZE) {
						hits.push({ x: cluster.centerX, y: cluster.centerY, color: 'red' });
					}
				}
				// Check for green laser
				else if (g > GREEN_THRESHOLD.g && r < GREEN_THRESHOLD.r && b < GREEN_THRESHOLD.b) {
					const cluster = findCluster(x, y, pixels, width, height, 'green', visited);
					if (cluster && cluster.size >= MIN_LASER_SIZE) {
						hits.push({ x: cluster.centerX, y: cluster.centerY, color: 'green' });
					}
				}
			}
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

			const isMatch =
				color === 'red'
					? r > threshold.r && g < threshold.g && b < threshold.b
					: g > threshold.g && r < threshold.r && b < threshold.b;

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

	function drawOverlays(ctx, width, height) {
		// Clear canvas (video is redrawn each frame)
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(videoElement, 0, 0, width, height);

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

		const rect = canvasElement.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;
		const scaleX = canvasElement.width / rect.width;
		const scaleY = canvasElement.height / rect.height;
		const actualX = x * scaleX;
		const actualY = y * scaleY;

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

		const rect = canvasElement.getBoundingClientRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;
		const scaleX = canvasElement.width / rect.width;
		const scaleY = canvasElement.height / rect.height;
		const actualX = x * scaleX;
		const actualY = y * scaleY;

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
	function autoCloseDrawer() {
		if (drawerRef) {
			drawerRef.closeDrawer();
		}
	}

	function autoOpenDrawer(state = 'partial') {
		if (drawerRef) {
			drawerRef.openDrawer(state);
		}
	}

	function startCalibration() {
		autoCloseDrawer(); // Close drawer for full camera view
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
		autoCloseDrawer(); // Close drawer during drill
		// Reset state
		shotTimerActive = true;
		shotTimerPhase = 'waiting';
		shotTimerStartTime = null;
		shotTimerFirstHitTime = null;
		
		// Calculate random delay
		const delayRange = shotTimerConfig.randomDelayMax - shotTimerConfig.randomDelayMin;
		const delay = shotTimerConfig.randomDelayMin + (Math.random() * delayRange);
		
		console.log(`Random delay: ${(delay / 1000).toFixed(2)}s`);
		
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
		shotTimerActive = false;
		shotTimerPhase = 'idle';
		shotTimerStartTime = null;
		shotTimerFirstHitTime = null;
		shotTimerCooldownUntil = null; // Reset cooldown on cancel
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
			
			// Open drawer to show results
			autoOpenDrawer('full');
			
			return true; // Hit was consumed by timer
		}
		
		return false; // Hit not consumed
	}

	function nextRep() {
		shotTimerCooldownUntil = null; // Reset cooldown
		startDrill();
	}

	function startSession() {
		shotTimerSession = {
			reps: [],
			startedAt: Date.now()
		};
		shotTimerCooldownUntil = null; // Reset cooldown
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
		if (!canvasElement || !videoElement) return;
		
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

	onMount(() => {
		// Auto-start camera on mount
		startCamera();
	});

	onDestroy(() => {
		stopCamera();
	});
</script>

<svelte:head>
	<title>Dry-Fire Laser Trainer (Spike)</title>
</svelte:head>

<MobileLayout bind:this={drawerRef}>
	
	<!-- Camera Feed (all layouts) -->
	<div slot="camera" class="camera-feed">
		<div class="relative bg-black rounded-lg overflow-hidden shadow-lg h-full w-full">
			<video
				bind:this={videoElement}
				autoplay
				playsinline
				muted
				class="w-full h-full object-contain hidden"
			></video>
			<canvas
				bind:this={canvasElement}
				class="w-full h-full object-contain"
				style="touch-action: none; display: block;"
			></canvas>
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
					class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded font-semibold text-center max-w-[90%]"
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
					class="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded font-semibold text-center max-w-[90%]"
					style="background-color: {zones[zoneCalibrationMode].color}; color: #000;"
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
				<div class="absolute inset-0 flex items-center justify-center bg-gray-800">
					<div class="text-center">
						<p class="mb-4">Camera not active</p>
						<button
							onclick={startCamera}
							class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
						>
							Start Camera
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
	
	<!-- Status Badges (mobile only) -->
	<div slot="status-badges">
		{#if targetBoundary}
			<span class="status-badge success">Calibrated ✓</span>
		{:else}
			<span class="status-badge warning">Not Calibrated</span>
		{/if}
		
		{#if shotTimerActive}
			<span class="status-badge active">Timer: Active</span>
		{/if}
		
		{#if hits.length > 0}
			<span class="status-badge info">Hits: {hits.length}</span>
		{/if}
	</div>
	
	<!-- Floating Action Buttons (mobile only) -->
	<div slot="fabs">
		{#if !targetBoundary && isStreaming}
			<button class="fab primary" onclick={startCalibration} title="Calibrate Target">
				📏
			</button>
		{/if}
		
		{#if targetBoundary && !shotTimerActive && isStreaming}
			<button class="fab secondary" onclick={() => { showShotTimer = true; autoOpenDrawer('full'); }} title="Shot Timer">
				⏱️
			</button>
		{/if}
	</div>
	
	<!-- Quick Actions (mobile partial drawer) -->
	<div slot="quick-actions">
		<div class="quick-actions-grid">
			<button 
				class="action-btn primary"
				onclick={startCalibration}
				disabled={!isStreaming || calibrationMode}
			>
				📏 Calibrate
			</button>
			
			<button 
				class="action-btn secondary"
				onclick={clearCalibration}
				disabled={!targetBoundary}
			>
				🗑️ Clear
			</button>
			
			<button 
				class="action-btn success"
				onclick={() => { showShotTimer = true; autoOpenDrawer('full'); }}
				disabled={!targetBoundary || !isStreaming}
			>
				⏱️ Timer
			</button>
			
			<button 
				class="action-btn info"
				onclick={() => { showVisualizationControls = true; autoOpenDrawer('full'); }}
			>
				🔢 Sequence
			</button>
			
			<button 
				class="action-btn warning"
				onclick={clearHits}
				disabled={hits.length === 0}
			>
				❌ Clear Hits
			</button>
			
			<button 
				class="action-btn danger"
				onclick={stopCamera}
				disabled={!isStreaming}
			>
				🛑 Stop
			</button>
		</div>
	</div>
	
	<!-- Full Controls (mobile full drawer & tablet sidebar) -->
	<div slot="full-controls">
		<div class="full-controls-container">
			<!-- Header (mobile/tablet only) -->
			<header class="mb-6 mobile-tablet-only">
				<h1 class="text-2xl md:text-3xl font-bold text-center mb-2">
					Dry-Fire Laser Trainer (Spike)
				</h1>
				<p class="text-sm text-gray-400 text-center">
					Camera-based laser detection for dry-fire training
				</p>
			</header>

			<!-- Target Mode Selection -->
			{#if showTargetModeSelection || !targetBoundary}
			<div class="bg-gray-800 rounded-lg p-6 mb-4">
				<h2 class="text-xl font-semibold mb-4">Select Target Mode</h2>
				<div class="space-y-4">
					<div class="flex items-center gap-3">
						<input
							type="radio"
							id="mode-preloaded"
							name="targetMode"
							value="preloaded"
							checked={targetMode === 'preloaded'}
							onchange={() => targetMode = 'preloaded'}
							class="w-4 h-4"
						/>
						<label for="mode-preloaded" class="text-lg cursor-pointer">
							Pre-loaded Template (Quick Setup)
						</label>
					</div>
					<div class="flex items-center gap-3">
						<input
							type="radio"
							id="mode-custom"
							name="targetMode"
							value="custom"
							checked={targetMode === 'custom'}
							onchange={() => targetMode = 'custom'}
							class="w-4 h-4"
						/>
						<label for="mode-custom" class="text-lg cursor-pointer">
							Custom Target (Manual Zones)
						</label>
					</div>
					<div class="flex items-center gap-3">
						<input
							type="radio"
							id="mode-freeform"
							name="targetMode"
							value="freeform"
							checked={targetMode === 'freeform'}
							onchange={() => targetMode = 'freeform'}
							class="w-4 h-4"
						/>
						<label for="mode-freeform" class="text-lg cursor-pointer">
							Free Training (No Zones)
						</label>
					</div>
				</div>

				{#if targetMode === 'preloaded'}
					<div class="mt-4 pt-4 border-t border-gray-700">
						<label for="template-select" class="block text-sm text-gray-400 mb-2">Select Template:</label>
						<select
							id="template-select"
							value={selectedTemplate}
							onchange={(e) => selectedTemplate = e.target.value}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
						>
							{#each Object.entries(templates) as [id, template]}
								<option value={id}>
									{template.name} ({template.size}, {template.recommendedDistance})
								</option>
							{/each}
						</select>
						{#if templates[selectedTemplate]}
							<p class="mt-2 text-sm text-gray-400">
								💡 For {templates[selectedTemplate].name} ({templates[selectedTemplate].size}), position camera {templates[selectedTemplate].recommendedDistance} from target. Target should fill 30-50% of frame.
							</p>
						{/if}
					</div>
				{/if}

				<div class="mt-4 flex gap-3">
					<button
						onclick={() => {
							showTargetModeSelection = false;
							// Auto-start calibration for modes that need it
							if (!targetBoundary && isStreaming) {
								if (targetMode === 'preloaded') {
									// Pre-loaded templates need calibration to load zones
									startCalibration();
								} else if (targetMode === 'custom') {
									// Custom mode needs calibration for zone detection
									startCalibration();
								}
								// Free training mode doesn't require calibration - can start immediately
							}
						}}
						class="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-semibold"
					>
						Done
					</button>
				</div>
				{#if targetMode === 'preloaded' && !targetBoundary}
					<p class="mt-3 text-sm text-blue-400">
						💡 After clicking Done, you'll be prompted to calibrate your target by tapping the 4 corners <strong>clockwise</strong> (top-left → top-right → bottom-right → bottom-left). Zones will automatically load after calibration.
					</p>
				{:else if targetMode === 'custom' && !targetBoundary}
					<p class="mt-3 text-sm text-blue-400">
						💡 After clicking Done, you'll be prompted to calibrate your target by tapping the 4 corners <strong>clockwise</strong> (top-left → top-right → bottom-right → bottom-left). Then use "Define Zones Visually" or "Zone Settings" to set up your scoring zones.
					</p>
				{:else if targetMode === 'freeform'}
					<p class="mt-3 text-sm text-blue-400">
						💡 Free Training mode logs all hits with coordinates. Calibration is optional - you can start training immediately, or calibrate to define a boundary.
					</p>
				{/if}
			</div>
		{/if}


			<!-- Controls -->
			<div class="flex flex-wrap gap-3 mb-4 justify-center">
			{#if isStreaming}
				<button
					onclick={startCalibration}
					disabled={calibrationMode}
					class="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Calibrate Target
				</button>
				<button
					onclick={clearCalibration}
					disabled={!targetBoundary}
					class="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Clear Calibration
				</button>
				<button
					onclick={startZoneCalibration}
					disabled={!targetBoundary || zoneCalibrationMode !== null}
					class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Define Zones Visually
				</button>
				{#if targetMode === 'custom'}
					<button
						onclick={() => showZoneSettings = !showZoneSettings}
						class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
					>
						{showZoneSettings ? 'Hide' : 'Zone'} Settings
					</button>
				{/if}
				<button
					onclick={() => showTargetModeSelection = !showTargetModeSelection}
					class="bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Target Mode
				</button>
				<button
					onclick={() => showShotTimer = !showShotTimer}
					class="bg-orange-600 hover:bg-orange-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Shot Timer
				</button>
				<button
					onclick={() => showVisualizationControls = !showVisualizationControls}
					class="bg-teal-600 hover:bg-teal-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Shot Sequence
				</button>
				<button
					onclick={clearHits}
					class="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Clear Hits
				</button>
				<button
					onclick={stopCamera}
					class="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Stop Camera
				</button>
			{:else}
				<button
					onclick={startCamera}
					class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
				>
					Start Camera
				</button>
			{/if}
		</div>

		<!-- Zone Settings Panel -->
		{#if showZoneSettings}
			<div class="bg-gray-800 rounded-lg p-4 mb-4">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold">Custom Zone Settings</h3>
					<button
						onclick={resetZonesToDefaults}
						class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold"
					>
						Reset to Defaults
					</button>
				</div>
				<div class="space-y-6">
					{#each ['A', 'C', 'D'] as zoneName}
						{@const zone = zones[zoneName]}
						<div class="border border-gray-700 rounded-lg p-4">
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
									<label for="points-{zoneName}" class="block text-sm text-gray-400 mb-1">Points</label>
									<input
										id="points-{zoneName}"
										type="number"
										min="0"
										max="10"
										value={zone.points}
										oninput={(e) => updateZonePoints(zoneName, e.target.value)}
										class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
									/>
								</div>
								<!-- X-axis bounds -->
								<div>
									<div class="block text-sm text-gray-400 mb-1">
										X-axis: {zone.bounds.x[0].toFixed(2)} - {zone.bounds.x[1].toFixed(2)}
									</div>
									<div class="space-y-2">
										<div>
											<label for="x-min-{zoneName}" class="text-xs text-gray-500">Min X:</label>
											<input
												id="x-min-{zoneName}"
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
											<label for="x-max-{zoneName}" class="text-xs text-gray-500">Max X:</label>
											<input
												id="x-max-{zoneName}"
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
									<div class="block text-sm text-gray-400 mb-1">
										Y-axis: {zone.bounds.y[0].toFixed(2)} - {zone.bounds.y[1].toFixed(2)}
									</div>
									<div class="space-y-2">
										<div>
											<label for="y-min-{zoneName}" class="text-xs text-gray-500">Min Y:</label>
											<input
												id="y-min-{zoneName}"
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
											<label for="y-max-{zoneName}" class="text-xs text-gray-500">Max Y:</label>
											<input
												id="y-max-{zoneName}"
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
								<div class="text-xs text-gray-400">
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
				<p class="text-xs text-gray-400 mt-4">
					💡 Tip: Zones are checked from innermost (A) to outermost (D). Make sure A-zone is inside C-zone,
					and C-zone is inside D-zone for best results.
				</p>
			</div>
		{/if}

		<!-- Shot Sequence Visualization Panel -->
		{#if showVisualizationControls}
			<div class="bg-gray-800 rounded-lg p-4 mb-4">
				<h3 class="text-lg font-semibold mb-4">Shot Sequence Visualization</h3>
				
				<div class="space-y-4">
					<!-- Toggle Controls -->
					<div class="flex items-center gap-3">
						<input
							id="show-shot-numbers"
							type="checkbox"
							checked={visualizationState.showShotNumbers}
							onchange={(e) => {
								visualizationState.showShotNumbers = e.target.checked;
								visualizationState = { ...visualizationState };
							}}
							class="w-5 h-5"
						/>
						<label for="show-shot-numbers" class="text-gray-300 cursor-pointer">
							Show Shot Numbers
						</label>
					</div>
					
					<div class="flex items-center gap-3">
						<input
							id="show-sequence-lines"
							type="checkbox"
							checked={visualizationState.showSequenceLines}
							onchange={(e) => {
								visualizationState.showSequenceLines = e.target.checked;
								visualizationState = { ...visualizationState };
							}}
							class="w-5 h-5"
						/>
						<label for="show-sequence-lines" class="text-gray-300 cursor-pointer">
							Show Sequence Lines
						</label>
					</div>
					
					<!-- Line Color Picker -->
					<div class="flex items-center gap-3">
						<label for="line-color" class="text-gray-300">Line Color:</label>
						<input
							id="line-color"
							type="color"
							value={visualizationState.lineColor}
							oninput={(e) => {
								visualizationState.lineColor = e.target.value;
								visualizationState = { ...visualizationState };
							}}
							class="w-16 h-8 border border-gray-600 rounded cursor-pointer"
						/>
					</div>
					
					<!-- Replay Mode Controls -->
					{#if hits.length > 0}
						<div class="pt-4 border-t border-gray-700">
							<label for="replay-slider" class="block text-gray-300 mb-2">
								Replay Mode:
							</label>
							<input
								id="replay-slider"
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
							<div class="text-center text-sm text-gray-400 mt-1">
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
							<div class="pt-4 border-t border-gray-700">
								<h4 class="text-md font-semibold mb-3 text-gray-300">Shot Group Analysis</h4>
								<div class="space-y-2">
									<div class="flex justify-between text-sm">
										<span class="text-gray-400">Group Size (avg):</span>
										<span class="text-gray-200 font-semibold">{grouping.groupSize}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-400">Max Spread:</span>
										<span class="text-gray-200 font-semibold">{grouping.maxSpread}px</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-400">Total Shots:</span>
										<span class="text-gray-200 font-semibold">{hits.length}</span>
									</div>
								</div>
							</div>
						{/if}
					{/if}
					
					<!-- Export Button -->
					{#if hits.length > 0}
						<button
							onclick={exportShotPattern}
							class="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold text-sm"
						>
							📸 Export Shot Pattern
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Shot Timer Panel -->
		{#if showShotTimer}
			<div class="bg-gray-800 rounded-lg p-4 mb-4">
				<h3 class="text-lg font-semibold mb-4">Shot Timer</h3>
				
				{#if !shotTimerActive && shotTimerPhase === 'idle'}
					<!-- Timer Controls -->
					<div class="space-y-4">
						<!-- Random Delay Settings -->
						<div>
							<div class="block text-sm text-gray-400 mb-2">Random Delay (seconds):</div>
							<div class="flex items-center gap-3">
								<input
									id="delay-min"
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
									class="w-20 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
								/>
								<span class="text-gray-400">to</span>
								<input
									id="delay-max"
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
									class="w-20 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
								/>
							</div>
							<p class="text-xs text-gray-500 mt-1">Timer will beep randomly between these times</p>
						</div>
						
						<!-- Volume Control -->
						<div>
							<label for="beep-volume" class="block text-sm text-gray-400 mb-2">
								Beep Volume: {Math.round(shotTimerConfig.beepVolume * 100)}%
							</label>
							<input
								id="beep-volume"
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
						
						<!-- Start Button -->
						<button
							onclick={shotTimerSession.reps.length === 0 ? startSession : startDrill}
							disabled={shotTimerActive}
							class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-semibold text-lg"
						>
							I'm Ready - Start Drill
						</button>
						
						{#if shotTimerSession.reps.length > 0}
							<div class="mt-4 pt-4 border-t border-gray-700">
								<p class="text-sm text-gray-400 mb-2">
									Session: {shotTimerSession.reps.length} rep{shotTimerSession.reps.length !== 1 ? 's' : ''} completed
								</p>
								<button
									onclick={() => showSessionStats = !showSessionStats}
									class="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold text-sm"
								>
									{showSessionStats ? 'Hide' : 'View'} Session Stats
								</button>
							</div>
						{/if}
					</div>
				{:else if shotTimerPhase === 'waiting'}
					<!-- Waiting for beep -->
					<div class="text-center py-8">
						<div class="inline-block w-3 h-3 bg-yellow-500 rounded-full animate-pulse mb-4"></div>
						<p class="text-lg font-semibold mb-4">Get ready... Timer will beep soon</p>
						<button
							onclick={cancelDrill}
							class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold"
						>
							Cancel Drill
						</button>
					</div>
				{:else if shotTimerPhase === 'active'}
					<!-- Timer active -->
					{@const _ = timerDisplayUpdate} <!-- Trigger reactivity -->
					<div class="text-center py-8 border-2 border-green-500 rounded-lg">
						<div class="text-5xl font-bold font-mono text-green-500 mb-4">
							{formatTime(getCurrentElapsed())}s
						</div>
						<p class="text-xl font-semibold mb-4">⏱️ TIMER ACTIVE - SHOOT!</p>
						<button
							onclick={cancelDrill}
							class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold"
						>
							Cancel
						</button>
					</div>
				{:else if shotTimerPhase === 'complete'}
					<!-- Rep complete -->
					{@const lastRep = shotTimerSession.reps[shotTimerSession.reps.length - 1]}
					<div class="space-y-4">
						<div class="text-center py-4">
							<div class="text-sm text-gray-400 mb-2">Draw Time:</div>
							<div class="text-4xl font-bold font-mono text-green-500 mb-4">
								{formatTime(lastRep.drawTime)}s
							</div>
							<div class="flex items-center justify-center gap-4 text-lg">
								<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
									{lastRep.hit.zone}
								</span>
								{#if lastRep.hit.points !== null}
									<span class="text-yellow-500 font-semibold">+{lastRep.hit.points} pts</span>
								{/if}
							</div>
						</div>
						<div class="flex gap-3">
							<button
								onclick={nextRep}
								class="flex-1 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
							>
								Next Rep
							</button>
							<button
								onclick={() => {
									showSessionStats = true;
									shotTimerPhase = 'idle';
								}}
								class="flex-1 bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
							>
								View Stats
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Session Statistics -->
		{#if showSessionStats && shotTimerSession.reps.length > 0}
			<div class="bg-gray-800 rounded-lg p-6 mb-4">
				<h3 class="text-xl font-semibold mb-4">Draw Timer Session</h3>
				
				<!-- Session Stats -->
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
					<div class="bg-gray-700 rounded-lg p-4 text-center">
						<div class="text-sm text-gray-400 mb-1">Reps Completed</div>
						<div class="text-2xl font-bold font-mono">{shotTimerSession.reps.length}</div>
					</div>
					<div class="bg-gray-700 rounded-lg p-4 text-center">
						<div class="text-sm text-gray-400 mb-1">Average Time</div>
						<div class="text-2xl font-bold font-mono">{formatTime(calculateAverage())}s</div>
					</div>
					<div class="bg-gray-700 rounded-lg p-4 text-center">
						<div class="text-sm text-gray-400 mb-1">Best Time</div>
						<div class="text-2xl font-bold font-mono text-green-500">{formatTime(calculateBest())}s</div>
					</div>
					<div class="bg-gray-700 rounded-lg p-4 text-center">
						<div class="text-sm text-gray-400 mb-1">Worst Time</div>
						<div class="text-2xl font-bold font-mono text-red-500">{formatTime(calculateWorst())}s</div>
					</div>
				</div>
				
				<!-- Accuracy Breakdown -->
				{#if calculateAccuracyByZone().length > 0}
					<div class="mb-6">
						<h4 class="text-lg font-semibold mb-3">Accuracy</h4>
						<div class="space-y-2">
							{#each calculateAccuracyByZone() as zone}
								<div class="flex justify-between items-center py-2 border-b border-gray-700">
									<span style="color: {zone.color}; font-weight: 600;">{zone.name}</span>
									<span class="text-gray-300">
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
								<tr class="border-b border-gray-700">
									<th class="text-left py-2 text-gray-400">#</th>
									<th class="text-left py-2 text-gray-400">Time</th>
									<th class="text-left py-2 text-gray-400">Zone</th>
									<th class="text-left py-2 text-gray-400">Points</th>
								</tr>
							</thead>
							<tbody>
								{#each shotTimerSession.reps as rep, index}
									<tr class="border-b border-gray-700">
										<td class="py-2 text-gray-300">{index + 1}</td>
										<td class="py-2 text-gray-300 font-mono">{formatTime(rep.drawTime)}s</td>
										<td class="py-2" style="color: {rep.hit.zoneColor}; font-weight: 600;">{rep.hit.zone}</td>
										<td class="py-2 text-gray-300">{rep.hit.points !== null ? `+${rep.hit.points}` : '-'}</td>
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
							shotTimerCooldownUntil = null; // Reset cooldown
							startDrill();
						}}
						class="flex-1 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
					>
						Continue Session
					</button>
					<button
						onclick={() => {
							shotTimerSession = { reps: [], startedAt: null };
							showSessionStats = false;
							shotTimerPhase = 'idle';
						}}
						class="flex-1 bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
					>
						End Session
					</button>
				</div>
			</div>
		{/if}

		<!-- Status -->
		<div class="bg-gray-800 rounded-lg p-4 mb-4">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
				<div>
					<span class="text-gray-400">Status:</span>
					<span class="ml-2 font-semibold">{isStreaming ? 'Active' : 'Inactive'}</span>
				</div>
				<div>
					<span class="text-gray-400">Hits Detected:</span>
					<span class="ml-2 font-semibold">{hits.length}</span>
				</div>
				<div>
					<span class="text-gray-400">Target Calibrated:</span>
					<span class="ml-2 font-semibold">{targetBoundary ? 'Yes' : 'No'}</span>
				</div>
				<div>
					<span class="text-gray-400">Detection:</span>
					<span class="ml-2 font-semibold">{detectionActive ? 'Active' : 'Inactive'}</span>
				</div>
			</div>
		</div>

		<!-- Score Display -->
		{#if hits.length > 0}
			{@const score = calculateScore()}
			<div class="bg-gray-800 rounded-lg p-4 mb-4">
				{#if targetMode === 'freeform'}
					<h2 class="text-xl font-semibold mb-3">
						Total Hits: {hits.length}
					</h2>
					{#if score.averagePosition}
						<p class="text-sm text-gray-400">
							Average position: x={score.averagePosition.x.toFixed(0)}, y={score.averagePosition.y.toFixed(0)}
						</p>
					{/if}
				{:else if targetMode === 'preloaded' && templates[selectedTemplate]?.grid}
					<h2 class="text-xl font-semibold mb-3">
						Total Hits: {hits.length}
					</h2>
					{#if score.cellCounts}
						<div class="text-sm">
							<p class="text-gray-400 mb-2">Cell Accuracy:</p>
							<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
								{#each Object.entries(score.cellCounts).slice(0, 8) as [cell, count]}
									<div>
										<span class="text-gray-400">{cell}:</span>
										<span class="ml-2 font-semibold">{count} hit{count !== 1 ? 's' : ''}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<h2 class="text-xl font-semibold mb-3">
						Total Score: {score.total} pts ({hits.length} hit{hits.length !== 1 ? 's' : ''})
					</h2>
					{#if score.breakdown}
						<div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
							<div>
								<span class="text-gray-400">A-zone:</span>
								<span class="ml-2 font-semibold" style="color: {zones.A?.color || '#4ade80'}">
									{score.breakdown.A.count} hit{score.breakdown.A.count !== 1 ? 's' : ''} ({score.breakdown.A.points} pts)
								</span>
							</div>
							<div>
								<span class="text-gray-400">C-zone:</span>
								<span class="ml-2 font-semibold" style="color: {zones.C?.color || '#fbbf24'}">
									{score.breakdown.C.count} hit{score.breakdown.C.count !== 1 ? 's' : ''} ({score.breakdown.C.points} pts)
								</span>
							</div>
							<div>
								<span class="text-gray-400">D-zone:</span>
								<span class="ml-2 font-semibold" style="color: {zones.D?.color || '#f87171'}">
									{score.breakdown.D.count} hit{score.breakdown.D.count !== 1 ? 's' : ''} ({score.breakdown.D.points} pts)
								</span>
							</div>
							<div>
								<span class="text-gray-400">Misses:</span>
								<span class="ml-2 font-semibold text-gray-400">
									{score.breakdown.Miss.count} ({score.breakdown.Miss.points} pts)
								</span>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Hit Log -->
		<div class="bg-gray-800 rounded-lg p-4">
			<h2 class="text-xl font-semibold mb-3">Hits Detected: {hits.length}</h2>
			{#if hits.length === 0}
				<p class="text-gray-400 text-sm">No hits detected yet. Point your laser at the target.</p>
			{:else}
				<div class="space-y-2 max-h-64 overflow-y-auto">
					{#each hits.slice().reverse() as hit (hit.id)}
						<div
							class="flex items-center justify-between p-2 bg-gray-700 rounded text-sm"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-4 h-4 rounded-full border-2"
									style="background-color: {hit.color === 'red' ? 'rgba(255,0,0,0.5)' : 'rgba(0,255,0,0.5)'}; border-color: {hit.color === 'red' ? '#ff0000' : '#00ff00'};"
								></div>
								<span>
									{#if targetMode === 'freeform'}
										Hit: x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
									{:else if targetMode === 'preloaded' && templates[selectedTemplate]?.grid}
										{#if hit.zone && hit.zone !== 'Miss'}
											<span style="color: {hit.zoneColor || '#3b82f6'}; font-weight: 600;">
												{hit.zone}:
											</span>
										{:else}
											<span style="color: #9ca3af; font-weight: 600;">Miss:</span>
										{/if}
										{' '}x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
									{:else}
										{#if hit.zone && hit.zone !== 'Miss' && hit.zone !== 'Hit'}
											<span style="color: {hit.zoneColor || getZoneColor(hit.zone)}; font-weight: 600;">
												{hit.zone}-zone:
											</span>
										{:else if hit.zone === 'Hit'}
											<span style="color: {hit.zoneColor || '#3b82f6'}; font-weight: 600;">Hit:</span>
										{:else}
											<span style="color: #9ca3af; font-weight: 600;">Miss:</span>
										{/if}
										{' '}x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
										{#if hit.points !== undefined && hit.points !== null}
											{' '}<span style="color: {hit.zoneColor || getZoneColor(hit.zone)};">(+{hit.points}pts)</span>
										{/if}
									{/if}
								</span>
							</div>
							<span class="text-gray-400 text-xs">{getRelativeTime(hit.timestamp)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

			<!-- Instructions -->
			<div class="mt-6 bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-sm">
				<h3 class="font-semibold mb-2">Instructions:</h3>
				<ul class="list-disc list-inside space-y-1 text-gray-300">
					<li>Grant camera permissions when prompted</li>
					<li>Point your laser training cartridge at a target</li>
					<li>Red and green lasers are automatically detected</li>
					<li>Calibrate target boundaries by tapping 4 corners <strong>clockwise</strong>: top-left → top-right → bottom-right → bottom-left</li>
					<li>Hits are logged with coordinates and timestamps</li>
				</ul>
			</div>
		</div>
	</div>
	
	<!-- Desktop Layout (unchanged) -->
	<div slot="desktop">
		<div class="min-h-screen bg-gray-900 text-white p-4">
			<div class="max-w-6xl mx-auto">
				<!-- Header -->
				<header class="mb-6">
					<h1 class="text-2xl md:text-3xl font-bold text-center mb-2">
						Dry-Fire Laser Trainer (Spike)
					</h1>
					<p class="text-sm text-gray-400 text-center">
						Camera-based laser detection for dry-fire training
					</p>
				</header>

				<!-- Target Mode Selection -->
				{#if showTargetModeSelection || !targetBoundary}
					<div class="bg-gray-800 rounded-lg p-6 mb-4">
						<h2 class="text-xl font-semibold mb-4">Select Target Mode</h2>
						<div class="space-y-4">
							<div class="flex items-center gap-3">
								<input
									type="radio"
									id="mode-preloaded-desktop"
									name="targetMode-desktop"
									value="preloaded"
									checked={targetMode === 'preloaded'}
									onchange={() => targetMode = 'preloaded'}
									class="w-4 h-4"
								/>
								<label for="mode-preloaded-desktop" class="text-lg cursor-pointer">
									Pre-loaded Template (Quick Setup)
								</label>
							</div>
							<div class="flex items-center gap-3">
								<input
									type="radio"
									id="mode-custom-desktop"
									name="targetMode-desktop"
									value="custom"
									checked={targetMode === 'custom'}
									onchange={() => targetMode = 'custom'}
									class="w-4 h-4"
								/>
								<label for="mode-custom-desktop" class="text-lg cursor-pointer">
									Custom Target (Manual Zones)
								</label>
							</div>
							<div class="flex items-center gap-3">
								<input
									type="radio"
									id="mode-freeform-desktop"
									name="targetMode-desktop"
									value="freeform"
									checked={targetMode === 'freeform'}
									onchange={() => targetMode = 'freeform'}
									class="w-4 h-4"
								/>
								<label for="mode-freeform-desktop" class="text-lg cursor-pointer">
									Free Training (No Zones)
								</label>
							</div>
						</div>

						{#if targetMode === 'preloaded'}
							<div class="mt-4 pt-4 border-t border-gray-700">
								<label for="template-select-desktop" class="block text-sm text-gray-400 mb-2">Select Template:</label>
								<select
									id="template-select-desktop"
									value={selectedTemplate}
									onchange={(e) => selectedTemplate = e.target.value}
									class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
								>
									{#each Object.entries(templates) as [id, template]}
										<option value={id}>
											{template.name} ({template.size}, {template.recommendedDistance})
										</option>
									{/each}
								</select>
								{#if templates[selectedTemplate]}
									<p class="mt-2 text-sm text-gray-400">
										💡 For {templates[selectedTemplate].name} ({templates[selectedTemplate].size}), position camera {templates[selectedTemplate].recommendedDistance} from target. Target should fill 30-50% of frame.
									</p>
								{/if}
							</div>
						{/if}

						<div class="mt-4 flex gap-3">
							<button
								onclick={() => {
									showTargetModeSelection = false;
									if (!targetBoundary && isStreaming) {
										if (targetMode === 'preloaded') {
											startCalibration();
										} else if (targetMode === 'custom') {
											startCalibration();
										}
									}
								}}
								class="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-semibold"
							>
								Done
							</button>
						</div>
						{#if targetMode === 'preloaded' && !targetBoundary}
							<p class="mt-3 text-sm text-blue-400">
								💡 After clicking Done, you'll be prompted to calibrate your target by tapping the 4 corners <strong>clockwise</strong> (top-left → top-right → bottom-right → bottom-left). Zones will automatically load after calibration.
							</p>
						{:else if targetMode === 'custom' && !targetBoundary}
							<p class="mt-3 text-sm text-blue-400">
								💡 After clicking Done, you'll be prompted to calibrate your target by tapping the 4 corners <strong>clockwise</strong> (top-left → top-right → bottom-right → bottom-left). Then use "Define Zones Visually" or "Zone Settings" to set up your scoring zones.
							</p>
						{:else if targetMode === 'freeform'}
							<p class="mt-3 text-sm text-blue-400">
								💡 Free Training mode logs all hits with coordinates. Calibration is optional - you can start training immediately, or calibrate to define a boundary.
							</p>
						{/if}
					</div>
				{/if}

				<!-- Video Container -->
				<div class="relative bg-black rounded-lg overflow-hidden mb-4 shadow-lg">
					<video
						bind:this={videoElement}
						autoplay
						playsinline
						muted
						class="w-full h-auto max-h-[60vh] object-contain hidden"
					></video>
					<canvas
						bind:this={canvasElement}
						class="w-full h-auto max-h-[60vh] object-contain"
						style="touch-action: none; display: block;"
					></canvas>
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
							class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded font-semibold text-center max-w-[90%]"
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
							class="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded font-semibold text-center max-w-[90%]"
							style="background-color: {zones[zoneCalibrationMode].color}; color: #000;"
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
						<div class="absolute inset-0 flex items-center justify-center bg-gray-800">
							<div class="text-center">
								<p class="mb-4">Camera not active</p>
								<button
									onclick={startCamera}
									class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
								>
									Start Camera
								</button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Controls -->
				<div class="flex flex-wrap gap-3 mb-4 justify-center">
					{#if isStreaming}
						<button
							onclick={startCalibration}
							disabled={calibrationMode}
							class="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Calibrate Target
						</button>
						<button
							onclick={clearCalibration}
							disabled={!targetBoundary}
							class="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Clear Calibration
						</button>
						<button
							onclick={startZoneCalibration}
							disabled={!targetBoundary || zoneCalibrationMode !== null}
							class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Define Zones Visually
						</button>
						{#if targetMode === 'custom'}
							<button
								onclick={() => showZoneSettings = !showZoneSettings}
								class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
							>
								{showZoneSettings ? 'Hide' : 'Zone'} Settings
							</button>
						{/if}
						<button
							onclick={() => showTargetModeSelection = !showTargetModeSelection}
							class="bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Target Mode
						</button>
						<button
							onclick={() => showShotTimer = !showShotTimer}
							class="bg-orange-600 hover:bg-orange-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Shot Timer
						</button>
						<button
							onclick={() => showVisualizationControls = !showVisualizationControls}
							class="bg-teal-600 hover:bg-teal-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Shot Sequence
						</button>
						<button
							onclick={clearHits}
							class="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Clear Hits
						</button>
						<button
							onclick={stopCamera}
							class="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Stop Camera
						</button>
					{:else}
						<button
							onclick={startCamera}
							class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold min-w-[140px]"
						>
							Start Camera
						</button>
					{/if}
				</div>

				<!-- Zone Settings Panel -->
				{#if showZoneSettings}
					<div class="bg-gray-800 rounded-lg p-4 mb-4">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-lg font-semibold">Custom Zone Settings</h3>
							<button
								onclick={resetZonesToDefaults}
								class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-semibold"
							>
								Reset to Defaults
							</button>
						</div>
						<div class="space-y-6">
							{#each ['A', 'C', 'D'] as zoneName}
								{@const zone = zones[zoneName]}
								<div class="border border-gray-700 rounded-lg p-4">
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
											<label for="points-{zoneName}-desktop" class="block text-sm text-gray-400 mb-1">Points</label>
											<input
												id="points-{zoneName}-desktop"
												type="number"
												min="0"
												max="10"
												value={zone.points}
												oninput={(e) => updateZonePoints(zoneName, e.target.value)}
												class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
											/>
										</div>
										<!-- X-axis bounds -->
										<div>
											<div class="block text-sm text-gray-400 mb-1">
												X-axis: {zone.bounds.x[0].toFixed(2)} - {zone.bounds.x[1].toFixed(2)}
											</div>
											<div class="space-y-2">
												<div>
													<label for="x-min-{zoneName}-desktop" class="text-xs text-gray-500">Min X:</label>
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
													<label for="x-max-{zoneName}-desktop" class="text-xs text-gray-500">Max X:</label>
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
											<div class="block text-sm text-gray-400 mb-1">
												Y-axis: {zone.bounds.y[0].toFixed(2)} - {zone.bounds.y[1].toFixed(2)}
											</div>
											<div class="space-y-2">
												<div>
													<label for="y-min-{zoneName}-desktop" class="text-xs text-gray-500">Min Y:</label>
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
													<label for="y-max-{zoneName}-desktop" class="text-xs text-gray-500">Max Y:</label>
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
										<div class="text-xs text-gray-400">
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
						<p class="text-xs text-gray-400 mt-4">
							💡 Tip: Zones are checked from innermost (A) to outermost (D). Make sure A-zone is inside C-zone,
							and C-zone is inside D-zone for best results.
						</p>
					</div>
				{/if}

				<!-- Shot Sequence Visualization Panel -->
				{#if showVisualizationControls}
					<div class="bg-gray-800 rounded-lg p-4 mb-4">
						<h3 class="text-lg font-semibold mb-4">Shot Sequence Visualization</h3>
						
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
								<label for="show-shot-numbers-desktop" class="text-gray-300 cursor-pointer">
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
								<label for="show-sequence-lines-desktop" class="text-gray-300 cursor-pointer">
									Show Sequence Lines
								</label>
							</div>
							
							<!-- Line Color Picker -->
							<div class="flex items-center gap-3">
								<label for="line-color-desktop" class="text-gray-300">Line Color:</label>
								<input
									id="line-color-desktop"
									type="color"
									value={visualizationState.lineColor}
									oninput={(e) => {
										visualizationState.lineColor = e.target.value;
										visualizationState = { ...visualizationState };
									}}
									class="w-16 h-8 border border-gray-600 rounded cursor-pointer"
								/>
							</div>
							
							<!-- Replay Mode Controls -->
							{#if hits.length > 0}
								<div class="pt-4 border-t border-gray-700">
									<label for="replay-slider-desktop" class="block text-gray-300 mb-2">
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
									<div class="text-center text-sm text-gray-400 mt-1">
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
									<div class="pt-4 border-t border-gray-700">
										<h4 class="text-md font-semibold mb-3 text-gray-300">Shot Group Analysis</h4>
										<div class="space-y-2">
											<div class="flex justify-between text-sm">
												<span class="text-gray-400">Group Size (avg):</span>
												<span class="text-gray-200 font-semibold">{grouping.groupSize}</span>
											</div>
											<div class="flex justify-between text-sm">
												<span class="text-gray-400">Max Spread:</span>
												<span class="text-gray-200 font-semibold">{grouping.maxSpread}px</span>
											</div>
											<div class="flex justify-between text-sm">
												<span class="text-gray-400">Total Shots:</span>
												<span class="text-gray-200 font-semibold">{hits.length}</span>
											</div>
										</div>
									</div>
								{/if}
							{/if}
							
							<!-- Export Button -->
							{#if hits.length > 0}
								<button
									onclick={exportShotPattern}
									class="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold text-sm"
								>
									📸 Export Shot Pattern
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Shot Timer Panel -->
				{#if showShotTimer}
					<div class="bg-gray-800 rounded-lg p-4 mb-4">
						<h3 class="text-lg font-semibold mb-4">Shot Timer</h3>
						
						{#if !shotTimerActive && shotTimerPhase === 'idle'}
							<!-- Timer Controls -->
							<div class="space-y-4">
								<!-- Random Delay Settings -->
								<div>
									<div class="block text-sm text-gray-400 mb-2">Random Delay (seconds):</div>
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
											class="w-20 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
										/>
										<span class="text-gray-400">to</span>
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
											class="w-20 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
										/>
									</div>
									<p class="text-xs text-gray-500 mt-1">Timer will beep randomly between these times</p>
								</div>
								
								<!-- Volume Control -->
								<div>
									<label for="beep-volume-desktop" class="block text-sm text-gray-400 mb-2">
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
								
								<!-- Start Button -->
								<button
									onclick={shotTimerSession.reps.length === 0 ? startSession : startDrill}
									disabled={shotTimerActive}
									class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-4 rounded-lg font-semibold text-lg"
								>
									I'm Ready - Start Drill
								</button>
								
								{#if shotTimerSession.reps.length > 0}
									<div class="mt-4 pt-4 border-t border-gray-700">
										<p class="text-sm text-gray-400 mb-2">
											Session: {shotTimerSession.reps.length} rep{shotTimerSession.reps.length !== 1 ? 's' : ''} completed
										</p>
										<button
											onclick={() => showSessionStats = !showSessionStats}
											class="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold text-sm"
										>
											{showSessionStats ? 'Hide' : 'View'} Session Stats
										</button>
									</div>
								{/if}
							</div>
						{:else if shotTimerPhase === 'waiting'}
							<!-- Waiting for beep -->
							<div class="text-center py-8">
								<div class="inline-block w-3 h-3 bg-yellow-500 rounded-full animate-pulse mb-4"></div>
								<p class="text-lg font-semibold mb-4">Get ready... Timer will beep soon</p>
								<button
									onclick={cancelDrill}
									class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold"
								>
									Cancel Drill
								</button>
							</div>
						{:else if shotTimerPhase === 'active'}
							<!-- Timer active -->
							{@const _ = timerDisplayUpdate} <!-- Trigger reactivity -->
							<div class="text-center py-8 border-2 border-green-500 rounded-lg">
								<div class="text-5xl font-bold font-mono text-green-500 mb-4">
									{formatTime(getCurrentElapsed())}s
								</div>
								<p class="text-xl font-semibold mb-4">⏱️ TIMER ACTIVE - SHOOT!</p>
								<button
									onclick={cancelDrill}
									class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg font-semibold"
								>
									Cancel
								</button>
							</div>
						{:else if shotTimerPhase === 'complete'}
							<!-- Rep complete -->
							{@const lastRep = shotTimerSession.reps[shotTimerSession.reps.length - 1]}
							<div class="space-y-4">
								<div class="text-center py-4">
									<div class="text-sm text-gray-400 mb-2">Draw Time:</div>
									<div class="text-4xl font-bold font-mono text-green-500 mb-4">
										{formatTime(lastRep.drawTime)}s
									</div>
									<div class="flex items-center justify-center gap-4 text-lg">
										<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
											{lastRep.hit.zone}
										</span>
										{#if lastRep.hit.points !== null}
											<span class="text-yellow-500 font-semibold">+{lastRep.hit.points} pts</span>
										{/if}
									</div>
								</div>
								<div class="flex gap-3">
									<button
										onclick={nextRep}
										class="flex-1 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
									>
										Next Rep
									</button>
									<button
										onclick={() => {
											showSessionStats = true;
											shotTimerPhase = 'idle';
										}}
										class="flex-1 bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
									>
										View Stats
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Session Statistics -->
				{#if showSessionStats && shotTimerSession.reps.length > 0}
					<div class="bg-gray-800 rounded-lg p-6 mb-4">
						<h3 class="text-xl font-semibold mb-4">Draw Timer Session</h3>
						
						<!-- Session Stats -->
						<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
							<div class="bg-gray-700 rounded-lg p-4 text-center">
								<div class="text-sm text-gray-400 mb-1">Reps Completed</div>
								<div class="text-2xl font-bold font-mono">{shotTimerSession.reps.length}</div>
							</div>
							<div class="bg-gray-700 rounded-lg p-4 text-center">
								<div class="text-sm text-gray-400 mb-1">Average Time</div>
								<div class="text-2xl font-bold font-mono">{formatTime(calculateAverage())}s</div>
							</div>
							<div class="bg-gray-700 rounded-lg p-4 text-center">
								<div class="text-sm text-gray-400 mb-1">Best Time</div>
								<div class="text-2xl font-bold font-mono text-green-500">{formatTime(calculateBest())}s</div>
							</div>
							<div class="bg-gray-700 rounded-lg p-4 text-center">
								<div class="text-sm text-gray-400 mb-1">Worst Time</div>
								<div class="text-2xl font-bold font-mono text-red-500">{formatTime(calculateWorst())}s</div>
							</div>
						</div>
						
						<!-- Accuracy Breakdown -->
						{#if calculateAccuracyByZone().length > 0}
							<div class="mb-6">
								<h4 class="text-lg font-semibold mb-3">Accuracy</h4>
								<div class="space-y-2">
									{#each calculateAccuracyByZone() as zone}
										<div class="flex justify-between items-center py-2 border-b border-gray-700">
											<span style="color: {zone.color}; font-weight: 600;">{zone.name}</span>
											<span class="text-gray-300">
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
										<tr class="border-b border-gray-700">
											<th class="text-left py-2 text-gray-400">#</th>
											<th class="text-left py-2 text-gray-400">Time</th>
											<th class="text-left py-2 text-gray-400">Zone</th>
											<th class="text-left py-2 text-gray-400">Points</th>
										</tr>
									</thead>
									<tbody>
										{#each shotTimerSession.reps as rep, index}
											<tr class="border-b border-gray-700">
												<td class="py-2 text-gray-300">{index + 1}</td>
												<td class="py-2 text-gray-300 font-mono">{formatTime(rep.drawTime)}s</td>
												<td class="py-2" style="color: {rep.hit.zoneColor}; font-weight: 600;">{rep.hit.zone}</td>
												<td class="py-2 text-gray-300">{rep.hit.points !== null ? `+${rep.hit.points}` : '-'}</td>
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
								class="flex-1 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold"
							>
								Continue Session
							</button>
							<button
								onclick={() => {
									shotTimerSession = { reps: [], startedAt: null };
									showSessionStats = false;
									shotTimerPhase = 'idle';
								}}
								class="flex-1 bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold"
							>
								End Session
							</button>
						</div>
					</div>
				{/if}

				<!-- Status -->
				<div class="bg-gray-800 rounded-lg p-4 mb-4">
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
						<div>
							<span class="text-gray-400">Status:</span>
							<span class="ml-2 font-semibold">{isStreaming ? 'Active' : 'Inactive'}</span>
						</div>
						<div>
							<span class="text-gray-400">Hits Detected:</span>
							<span class="ml-2 font-semibold">{hits.length}</span>
						</div>
						<div>
							<span class="text-gray-400">Target Calibrated:</span>
							<span class="ml-2 font-semibold">{targetBoundary ? 'Yes' : 'No'}</span>
						</div>
						<div>
							<span class="text-gray-400">Detection:</span>
							<span class="ml-2 font-semibold">{detectionActive ? 'Active' : 'Inactive'}</span>
						</div>
					</div>
				</div>

				<!-- Score Display -->
				{#if hits.length > 0}
					{@const score = calculateScore()}
					<div class="bg-gray-800 rounded-lg p-4 mb-4">
						{#if targetMode === 'freeform'}
							<h2 class="text-xl font-semibold mb-3">
								Total Hits: {hits.length}
							</h2>
							{#if score.averagePosition}
								<p class="text-sm text-gray-400">
									Average position: x={score.averagePosition.x.toFixed(0)}, y={score.averagePosition.y.toFixed(0)}
								</p>
							{/if}
						{:else if targetMode === 'preloaded' && templates[selectedTemplate]?.grid}
							<h2 class="text-xl font-semibold mb-3">
								Total Hits: {hits.length}
							</h2>
							{#if score.cellCounts}
								<div class="text-sm">
									<p class="text-gray-400 mb-2">Cell Accuracy:</p>
									<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
										{#each Object.entries(score.cellCounts).slice(0, 8) as [cell, count]}
											<div>
												<span class="text-gray-400">{cell}:</span>
												<span class="ml-2 font-semibold">{count} hit{count !== 1 ? 's' : ''}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{:else}
							<h2 class="text-xl font-semibold mb-3">
								Total Score: {score.total} pts ({hits.length} hit{hits.length !== 1 ? 's' : ''})
							</h2>
							{#if score.breakdown}
								<div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
									<div>
										<span class="text-gray-400">A-zone:</span>
										<span class="ml-2 font-semibold" style="color: {zones.A?.color || '#4ade80'}">
											{score.breakdown.A.count} hit{score.breakdown.A.count !== 1 ? 's' : ''} ({score.breakdown.A.points} pts)
										</span>
									</div>
									<div>
										<span class="text-gray-400">C-zone:</span>
										<span class="ml-2 font-semibold" style="color: {zones.C?.color || '#fbbf24'}">
											{score.breakdown.C.count} hit{score.breakdown.C.count !== 1 ? 's' : ''} ({score.breakdown.C.points} pts)
										</span>
									</div>
									<div>
										<span class="text-gray-400">D-zone:</span>
										<span class="ml-2 font-semibold" style="color: {zones.D?.color || '#f87171'}">
											{score.breakdown.D.count} hit{score.breakdown.D.count !== 1 ? 's' : ''} ({score.breakdown.D.points} pts)
										</span>
									</div>
									<div>
										<span class="text-gray-400">Misses:</span>
										<span class="ml-2 font-semibold text-gray-400">
											{score.breakdown.Miss.count} ({score.breakdown.Miss.points} pts)
										</span>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Hit Log -->
				<div class="bg-gray-800 rounded-lg p-4">
					<h2 class="text-xl font-semibold mb-3">Hits Detected: {hits.length}</h2>
					{#if hits.length === 0}
						<p class="text-gray-400 text-sm">No hits detected yet. Point your laser at the target.</p>
					{:else}
						<div class="space-y-2 max-h-64 overflow-y-auto">
							{#each hits.slice().reverse() as hit (hit.id)}
								<div
									class="flex items-center justify-between p-2 bg-gray-700 rounded text-sm"
								>
									<div class="flex items-center gap-3">
										<div
											class="w-4 h-4 rounded-full border-2"
											style="background-color: {hit.color === 'red' ? 'rgba(255,0,0,0.5)' : 'rgba(0,255,0,0.5)'}; border-color: {hit.color === 'red' ? '#ff0000' : '#00ff00'};"
										></div>
										<span>
											{#if targetMode === 'freeform'}
												Hit: x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
											{:else if targetMode === 'preloaded' && templates[selectedTemplate]?.grid}
												{#if hit.zone && hit.zone !== 'Miss'}
													<span style="color: {hit.zoneColor || '#3b82f6'}; font-weight: 600;">
														{hit.zone}:
													</span>
												{:else}
													<span style="color: #9ca3af; font-weight: 600;">Miss:</span>
												{/if}
												{' '}x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
											{:else}
												{#if hit.zone && hit.zone !== 'Miss' && hit.zone !== 'Hit'}
													<span style="color: {hit.zoneColor || getZoneColor(hit.zone)}; font-weight: 600;">
														{hit.zone}-zone:
													</span>
												{:else if hit.zone === 'Hit'}
													<span style="color: {hit.zoneColor || '#3b82f6'}; font-weight: 600;">Hit:</span>
												{:else}
													<span style="color: #9ca3af; font-weight: 600;">Miss:</span>
												{/if}
												{' '}x={hit.x.toFixed(0)}, y={hit.y.toFixed(0)} @ {formatTimestamp(hit.timestamp)}
												{#if hit.points !== undefined && hit.points !== null}
													{' '}<span style="color: {hit.zoneColor || getZoneColor(hit.zone)};">(+{hit.points}pts)</span>
												{/if}
											{/if}
										</span>
									</div>
									<span class="text-gray-400 text-xs">{getRelativeTime(hit.timestamp)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Instructions -->
				<div class="mt-6 bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-sm">
					<h3 class="font-semibold mb-2">Instructions:</h3>
					<ul class="list-disc list-inside space-y-1 text-gray-300">
						<li>Grant camera permissions when prompted</li>
						<li>Point your laser training cartridge at a target</li>
						<li>Red and green lasers are automatically detected</li>
						<li>Calibrate target boundaries by tapping 4 corners <strong>clockwise</strong>: top-left → top-right → bottom-right → bottom-left</li>
						<li>Hits are logged with coordinates and timestamps</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
	
</MobileLayout>

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