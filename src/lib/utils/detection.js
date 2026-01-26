// Detection parameters
export const RED_THRESHOLD = {
	r: 150, // Balanced threshold - bright enough to avoid false positives
	g: 70, // Lower green threshold to ensure red dominance
	b: 70 // Lower blue threshold to ensure red dominance
};

export const GREEN_THRESHOLD = {
	r: 70, // Lower red threshold to ensure green dominance
	g: 150, // Balanced threshold - bright enough to avoid false positives
	b: 70 // Lower blue threshold to ensure green dominance
};

export const CLUSTER_RADIUS = 10; // pixels
export const MIN_LASER_SIZE = 2; // Require at least 2 pixels to reduce noise
export const MIN_COLOR_DOMINANCE = 30; // Minimum difference between dominant color and other channels
export const MIN_BRIGHTNESS = 100; // Minimum total brightness (r+g+b) to avoid dim false positives

export function detectLaserDots(
	pixels,
	width,
	height,
	debugMode = false,
	backgroundSnapshot = null,
	backgroundThreshold = 100,
	roi = null
) {
	const hits = [];
	const visited = new Set();
	const debugPixels = debugMode ? [] : null; // Store pixels that match criteria for debug overlay

	const startX = roi ? roi.minX : 0;
	const endX = roi ? roi.maxX : width;
	const startY = roi ? roi.minY : 0;
	const endY = roi ? roi.maxY : height;

	// Scan for bright red or green pixels
	for (let y = startY; y < endY; y += 1) {
		// Sample every pixel for better detection of small laser dots
		for (let x = startX; x < endX; x += 1) {
			const idx = (y * width + x) * 4;
			const r = pixels[idx];
			const g = pixels[idx + 1];
			const b = pixels[idx + 2];
			const brightness = r + g + b;

			// Background subtraction
			if (backgroundSnapshot) {
				const bgR = backgroundSnapshot.data[idx];
				const bgG = backgroundSnapshot.data[idx + 1];
				const bgB = backgroundSnapshot.data[idx + 2];
				const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
				if (diff < backgroundThreshold) {
					continue;
				}
			}

			// Skip dim pixels to avoid false positives
			if (brightness < MIN_BRIGHTNESS) continue;

			// Check for red laser - require both threshold match AND significant color dominance
			const redMatch = r > RED_THRESHOLD.r && g < RED_THRESHOLD.g && b < RED_THRESHOLD.b;
			const redDominant = r > g && r > b && r > RED_THRESHOLD.r;
			const redDominanceDiff = Math.min(r - g, r - b); // How much more red than other channels

			// Require strict threshold match OR (dominant with significant difference)
			if (redMatch || (redDominant && redDominanceDiff >= MIN_COLOR_DOMINANCE)) {
				if (debugMode && debugPixels) {
					debugPixels.push({
						x,
						y,
						r,
						g,
						b,
						color: 'red',
						matched: redMatch,
						dominant: redDominant
					});
				}
				const cluster = findCluster(x, y, pixels, width, height, 'red', visited);
				if (cluster && cluster.size >= MIN_LASER_SIZE) {
					if (debugMode) {
						console.log(
							`Red laser detected at (${cluster.centerX}, ${cluster.centerY}), size: ${cluster.size}, RGB: (${r}, ${g}, ${b})`
						);
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
					if (debugMode && debugPixels) {
						debugPixels.push({
							x,
							y,
							r,
							g,
							b,
							color: 'green',
							matched: greenMatch,
							dominant: greenDominant
						});
					}
					const cluster = findCluster(x, y, pixels, width, height, 'green', visited);
					if (cluster && cluster.size >= MIN_LASER_SIZE) {
						if (debugMode) {
							console.log(
								`Green laser detected at (${cluster.centerX}, ${cluster.centerY}), size: ${cluster.size}, RGB: (${r}, ${g}, ${b})`
							);
						}
						hits.push({ x: cluster.centerX, y: cluster.centerY, color: 'green' });
					}
				}
			}
		}
	}

	// Store debug pixels for overlay drawing
	if (debugMode && debugPixels) {
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
			isMatch =
				(strictMatch || (dominantMatch && dominanceDiff >= MIN_COLOR_DOMINANCE)) &&
				brightness >= MIN_BRIGHTNESS;
		} else {
			const strictMatch = g > threshold.g && r < threshold.r && b < threshold.b;
			const dominantMatch = g > r && g > b && g > threshold.g;
			const dominanceDiff = Math.min(g - r, g - b);
			isMatch =
				(strictMatch || (dominantMatch && dominanceDiff >= MIN_COLOR_DOMINANCE)) &&
				brightness >= MIN_BRIGHTNESS;
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
				if (
					!visited.has(nKey) &&
					Math.abs(nx - startX) < CLUSTER_RADIUS &&
					Math.abs(ny - startY) < CLUSTER_RADIUS
				) {
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
