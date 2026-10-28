import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	AREA,
	CORNERS,
	DEFAULT_TARGET,
	homography,
	transform,
	validQuad,
	previewPoint,
	targetGeometry,
	scorePoint,
	evaluateCameraPoint
} from '../src/lib/projector/geometry.js';
import {
	emptySession,
	recordShot,
	accuracy,
	createTemporalFilter,
	validSettings
} from '../src/lib/projector/session.js';
import {
	envelope,
	isMessage,
	validViewport,
	validDisplayState,
	geometryKey,
	channelName
} from '../src/lib/projector/protocol.js';
import { detectLaserDots } from '../src/lib/utils/detection.js';

const quad = [
	{ x: 0.15, y: 0.1 },
	{ x: 0.9, y: 0.2 },
	{ x: 0.8, y: 0.95 },
	{ x: 0.05, y: 0.8 }
];
function close(a, b) {
	assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);
}
const viewport = { width: 1920, height: 1080, dpr: 2 };
const calibration = { points: quad, matrix: homography(quad), width: 640, height: 480 };

test('perspective homography maps all four camera corners to projector crosshairs', () => {
	quad.forEach((p, i) => {
		const actual = transform(calibration.matrix, p);
		close(actual.x, CORNERS[i].x);
		close(actual.y, CORNERS[i].y);
	});
});
test('known projective transform round-trips interior points and strongly skewed views', () => {
	const cameraTransform = [0.7, 0.12, 0.1, 0.08, 0.7, 0.1, 0.25, 0.2, 1];
	const sensorCorners = CORNERS.map((p) => transform(cameraTransform, p));
	const inverse = homography(sensorCorners);
	for (let x = 0.1; x < 0.9; x += 0.1)
		for (let y = 0.2; y < 0.9; y += 0.1) {
			const actual = transform(inverse, transform(cameraTransform, { x, y }));
			close(actual.x, x);
			close(actual.y, y);
		}
});
test('invalid calibration rejects crossing, duplicate, reversed, collinear, and nonfinite points', () => {
	const invalid = [
		[],
		[quad[0], quad[2], quad[1], quad[3]],
		[quad[0], quad[0], quad[2], quad[3]],
		[...quad].reverse(),
		[0, 1, 2, 3].map((x) => ({ x, y: x })),
		[{ x: NaN, y: 0 }, ...quad.slice(1)]
	];
	for (const points of invalid) {
		assert.equal(validQuad(points), false);
		assert.throws(() => homography(points));
	}
	assert.equal(transform([1, 0, 0, 0, 1, 0, 0, 0, 0], { x: 1, y: 1 }), null);
});
test('preview conversion accounts for contain letterboxing and ignores CSS/DPR differences', () => {
	const rect = { left: 10, top: 20, width: 1000, height: 1000 };
	assert.equal(previewPoint(500, 30, rect, 640, 480), null);
	assert.deepEqual(previewPoint(510, 520, rect, 640, 480), { x: 320, y: 240 });
	const wide = { left: 0, top: 0, width: 1600, height: 600 };
	assert.equal(previewPoint(10, 300, wide, 640, 480), null);
	assert.deepEqual(previewPoint(800, 300, wide, 640, 480), { x: 320, y: 240 });
});
test('rendered target stays circular and inside usable area at landscape and portrait resolutions', () => {
	for (const v of [viewport, { width: 600, height: 1200 }, { width: 2560, height: 720 }]) {
		for (const target of [DEFAULT_TARGET, { x: 0, y: 1, size: 0.4 }]) {
			const g = targetGeometry(target, v);
			close(g.rx * v.width, g.ry * v.height);
			assert.ok(g.x - g.rx >= AREA.x - 1e-8 && g.y + g.ry <= AREA.y + AREA.height + 1e-8);
			assert.equal(scorePoint(g, target, v), 10);
			assert.equal(scorePoint({ x: g.x + g.rx, y: g.y }, target, v), 1);
			assert.equal(scorePoint({ x: g.x + g.rx * 1.01, y: g.y }, target, v), 0);
		}
	}
});
test('sensor hits use homography and target scoring; outside calibrated area is ignored', () => {
	const inverse = homography(CORNERS, quad);
	const center = targetGeometry(DEFAULT_TARGET, viewport);
	const sensor = transform(inverse, center);
	const result = evaluateCameraPoint(
		{ x: sensor.x * 640, y: sensor.y * 480 },
		calibration,
		DEFAULT_TARGET,
		viewport
	);
	assert.equal(result.score, 10);
	close(result.point.x, center.x);
	close(result.point.y, center.y);
	assert.equal(evaluateCameraPoint({ x: 0, y: 0 }, calibration, DEFAULT_TARGET, viewport), null);
	// Inside the projection but outside bullseye is a recorded miss.
	const miss = transform(inverse, { x: 0.06, y: 0.17 });
	assert.equal(
		evaluateCameraPoint({ x: miss.x * 640, y: miss.y * 480 }, calibration, DEFAULT_TARGET, viewport)
			.score,
		0
	);
});
test('session scores only running accepted shots; simulation provenance is retained', () => {
	const idle = emptySession();
	assert.equal(recordShot(idle, { score: 10 }), idle);
	let session = { ...idle, status: 'running' };
	session = recordShot(session, { score: 10 });
	session = recordShot(session, { score: 0 }, true);
	assert.equal(session.shots, 2);
	assert.equal(session.hits, 1);
	assert.equal(session.score, 10);
	assert.equal(session.simulated, 1);
	assert.equal(accuracy(session), 50);
	assert.equal(recordShot(session, null), session);
	const paused = { ...session, status: 'paused' };
	assert.equal(recordShot(paused, { score: 10 }), paused);
	assert.equal(accuracy(emptySession()), 0);
});
test('temporal filter confirms nearby frames, requires pulse clearing, and enforces cooldown', () => {
	const filter = createTemporalFilter(),
		config = { confirmationFrames: 2, cooldown: 250 };
	const p = { x: 10, y: 10 };
	assert.equal(filter.update([p], 0, config), null);
	assert.deepEqual(filter.update([p], 34, config), p);
	assert.equal(filter.update([p], 500, config), null);
	filter.update([], 510, config);
	assert.equal(filter.update([p], 520, config), null);
	assert.deepEqual(filter.update([p], 554, config), p);
	filter.update([], 560, config);
	filter.update([p], 570, config);
	assert.equal(filter.update([p], 600, config), null);
	filter.reset();
	assert.equal(filter.update([p], 1000, config), null);
	assert.equal(filter.update([{ x: 100, y: 100 }], 1040, config), null);
});
test('protocol isolates controllers, validates payloads, and keys calibration by all geometry', () => {
	const message = envelope('a', 'ready', { viewport });
	assert.ok(isMessage(message, 'a', 'ready'));
	assert.ok(!isMessage(message, 'b', 'ready'));
	assert.ok(!isMessage({ ...message, version: 2 }, 'a', 'ready'));
	assert.ok(validViewport(viewport));
	assert.ok(!validViewport({ ...viewport, width: 0 }));
	assert.ok(!validViewport({ ...viewport, dpr: NaN }));
	const state = { session: emptySession(), target: DEFAULT_TARGET, calibrating: false };
	assert.ok(validDisplayState(state));
	assert.ok(!validDisplayState({ ...state, target: { ...DEFAULT_TARGET, size: 10 } }));
	assert.ok(!validDisplayState({ ...state, session: { ...emptySession(), shots: -1 } }));
	const key = geometryKey('camera', 640, 480, viewport);
	for (const other of [
		geometryKey('other', 640, 480, viewport),
		geometryKey('camera', 1280, 480, viewport),
		geometryKey('camera', 640, 720, viewport),
		geometryKey('camera', 640, 480, { ...viewport, width: 1280 }),
		geometryKey('camera', 640, 480, { ...viewport, dpr: 1 })
	])
		assert.notEqual(key, other);
	assert.notEqual(channelName('a'), channelName('b'));
});
function image(width, height, spots) {
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (const [x, y, r, g, b] of spots) pixels.set([r, g, b, 255], (y * width + x) * 4);
	return pixels;
}
test('shared detector preserves legacy red/green behavior and applies projector threshold and blob limits', () => {
	const pixels = image(30, 10, [
		[2, 2, 255, 0, 0],
		[3, 2, 255, 0, 0],
		[20, 2, 0, 255, 0],
		[21, 2, 0, 255, 0]
	]);
	assert.deepEqual(
		detectLaserDots(pixels, 30, 10).map((p) => p.color),
		['red', 'green']
	);
	const settings = { brightness: 150, dominance: 30, minSize: 2, maxSize: 10 };
	const red = detectLaserDots(pixels, 30, 10, false, null, 100, null, settings);
	assert.equal(red.length, 1);
	assert.equal(red[0].size, 2);
	assert.equal(
		detectLaserDots(pixels, 30, 10, false, null, 100, null, { ...settings, minSize: 3 }).length,
		0
	);
	assert.equal(
		detectLaserDots(pixels, 30, 10, false, null, 100, null, { ...settings, brightness: 255 })
			.length,
		0
	);
	const gray = image(10, 10, [
		[2, 2, 255, 255, 255],
		[3, 2, 255, 255, 255]
	]);
	assert.equal(detectLaserDots(gray, 10, 10, false, null, 100, null, settings).length, 0);
	const large = image(
		30,
		30,
		Array.from({ length: 400 }, (_, i) => [i % 20, Math.floor(i / 20), 255, 0, 0])
	);
	assert.equal(
		detectLaserDots(large, 30, 30, false, null, 100, null, { ...settings, maxSize: 150 }).length,
		0
	);
});
test('invalid numeric detection settings cannot start a session', () => {
	const settings = {
		brightness: 150,
		dominance: 30,
		minSize: 2,
		maxSize: 150,
		confirmationFrames: 1,
		cooldown: 250
	};
	assert.ok(validSettings(settings));
	for (const invalid of [
		{ brightness: undefined },
		{ dominance: NaN },
		{ minSize: 200 },
		{ confirmationFrames: 1.5 },
		{ cooldown: -1 }
	])
		assert.ok(!validSettings({ ...settings, ...invalid }));
});

test('synthetic camera pixels flow through the shared detector, calibration, scoring, and session', () => {
	const pixels = image(640, 480, [
		[320, 264, 255, 0, 0],
		[321, 264, 255, 0, 0]
	]);
	const candidates = detectLaserDots(pixels, 640, 480, false, null, 100, null, {
		brightness: 150,
		dominance: 30,
		minSize: 2,
		maxSize: 150
	});
	const mapped = evaluateCameraPoint(
		candidates[0],
		{ points: CORNERS, matrix: homography(CORNERS), width: 640, height: 480 },
		DEFAULT_TARGET,
		viewport
	);
	const session = recordShot({ ...emptySession(), status: 'running' }, mapped);
	assert.equal(session.hits, 1);
	assert.equal(session.lastScore, 10);
	assert.equal(session.shots, 1);
});
