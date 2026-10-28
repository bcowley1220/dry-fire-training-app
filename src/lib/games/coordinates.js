export const WORLD = { width: 1280, height: 720 };
// Rectangles are CSS-pixel canvas bounds relative to the projector viewport.
export function fitCanvas(viewport) {
	const scale = Math.min(viewport.width / WORLD.width, viewport.height / WORLD.height);
	return {
		left: (viewport.width - WORLD.width * scale) / 2,
		top: (viewport.height - WORLD.height * scale) / 2,
		width: WORLD.width * scale,
		height: WORLD.height * scale
	};
}
export function projectorToWorld(point, viewport, rect = fitCanvas(viewport)) {
	if (
		!point ||
		![
			point.x,
			point.y,
			viewport.width,
			viewport.height,
			rect.left,
			rect.top,
			rect.width,
			rect.height
		].every(Number.isFinite) ||
		rect.width <= 0 ||
		rect.height <= 0
	)
		return null;
	const x = ((point.x * viewport.width - rect.left) * WORLD.width) / rect.width;
	const y = ((point.y * viewport.height - rect.top) * WORLD.height) / rect.height;
	return x >= 0 && y >= 0 && x <= WORLD.width && y <= WORLD.height ? { x, y } : null;
}
export function worldToProjector(point, viewport, rect = fitCanvas(viewport)) {
	return {
		x: (rect.left + (point.x * rect.width) / WORLD.width) / viewport.width,
		y: (rect.top + (point.y * rect.height) / WORLD.height) / viewport.height
	};
}
export function shotEvent(
	point,
	source,
	metadata = {},
	clock = () => performance.timeOrigin + performance.now()
) {
	return {
		id: crypto.randomUUID(),
		x: point.x,
		y: point.y,
		detectedAt: clock(),
		source,
		...metadata
	};
}
export function validShot(shot) {
	return (
		shot &&
		typeof shot.id === 'string' &&
		['laser', 'simulated'].includes(shot.source) &&
		[shot.x, shot.y, shot.detectedAt].every(Number.isFinite) &&
		shot.x >= 0 &&
		shot.x <= 1 &&
		shot.y >= 0 &&
		shot.y <= 1
	);
}
