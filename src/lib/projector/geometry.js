// Coordinates on the projector are normalized to the entire viewport.
export const AREA = { x: 0.05, y: 0.16, width: 0.9, height: 0.78 };
export const CORNERS = [
	{ x: AREA.x, y: AREA.y },
	{ x: AREA.x + AREA.width, y: AREA.y },
	{ x: AREA.x + AREA.width, y: AREA.y + AREA.height },
	{ x: AREA.x, y: AREA.y + AREA.height }
];
export const DEFAULT_TARGET = { x: 0.5, y: 0.5, size: 0.36 };

export function validQuad(points) {
	if (points?.length !== 4 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
		return false;
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = points[i],
			b = points[(i + 1) % 4],
			c = points[(i + 2) % 4];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cross) < 1e-6 || (sign && Math.sign(cross) !== sign)) return false;
		sign = Math.sign(cross);
	}
	// Require clockwise TL, TR, BR, BL ordering in sensor coordinates.
	return sign > 0;
}

export function homography(points, destinations = CORNERS) {
	if (!validQuad(points) || !validQuad(destinations))
		throw new Error(
			'Select four distinct corners clockwise: top-left, top-right, bottom-right, bottom-left.'
		);
	const rows = [];
	for (let i = 0; i < 4; i++) {
		const { x, y } = points[i],
			{ x: u, y: v } = destinations[i];
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	for (let col = 0; col < 8; col++) {
		let pivot = col;
		for (let i = col + 1; i < 8; i++)
			if (Math.abs(rows[i][col]) > Math.abs(rows[pivot][col])) pivot = i;
		[rows[col], rows[pivot]] = [rows[pivot], rows[col]];
		const divisor = rows[col][col];
		if (Math.abs(divisor) < 1e-10)
			throw new Error('Calibration is degenerate. Spread the corners farther apart.');
		for (let j = col; j < 9; j++) rows[col][j] /= divisor;
		for (let i = 0; i < 8; i++) {
			if (i === col) continue;
			const factor = rows[i][col];
			for (let j = col; j < 9; j++) rows[i][j] -= factor * rows[col][j];
		}
	}
	return [...rows.map((row) => row[8]), 1];
}

export function transform(matrix, point) {
	const { x, y } = point;
	const d = matrix[6] * x + matrix[7] * y + matrix[8];
	if (Math.abs(d) < 1e-10) return null;
	return {
		x: (matrix[0] * x + matrix[1] * y + matrix[2]) / d,
		y: (matrix[3] * x + matrix[4] * y + matrix[5]) / d
	};
}

export function insideQuad(point, quad) {
	return quad.every((a, i) => {
		const b = quad[(i + 1) % 4];
		return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= -1e-8;
	});
}

// object-fit: contain conversion; inputs and bounds are CSS pixels, output sensor pixels.
export function previewPoint(clientX, clientY, rect, width, height) {
	const scale = Math.min(rect.width / width, rect.height / height);
	if (!Number.isFinite(scale) || scale <= 0) return null;
	const x = (clientX - rect.left - (rect.width - width * scale) / 2) / scale;
	const y = (clientY - rect.top - (rect.height - height * scale) / 2) / scale;
	return x >= 0 && y >= 0 && x <= width && y <= height ? { x, y } : null;
}

export function targetGeometry(target, viewport) {
	const { width, height } = viewport;
	const rx = (target.size * Math.min(width * AREA.width, height * AREA.height)) / width;
	const ry = (rx * width) / height;
	return {
		x: Math.max(AREA.x + rx, Math.min(AREA.x + AREA.width - rx, AREA.x + target.x * AREA.width)),
		y: Math.max(AREA.y + ry, Math.min(AREA.y + AREA.height - ry, AREA.y + target.y * AREA.height)),
		rx,
		ry
	};
}

export function scorePoint(point, target, viewport) {
	const g = targetGeometry(target, viewport);
	const distance = Math.hypot((point.x - g.x) / g.rx, (point.y - g.y) / g.ry);
	return distance <= 1 + 1e-8 ? Math.max(1, 10 - Math.floor(Math.min(0.999999, distance) * 10)) : 0;
}

export function evaluateCameraPoint(raw, calibration, target, viewport) {
	const p = { x: raw.x / calibration.width, y: raw.y / calibration.height };
	if (!insideQuad(p, calibration.points)) return null;
	const point = transform(calibration.matrix, p);
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
	return { point, score: scorePoint(point, target, viewport) };
}
