import test from 'node:test';
import assert from 'node:assert/strict';
import {
	createDuckHunt,
	DEFAULT_CONFIG,
	validConfig,
	RESOLUTION_MS
} from '../src/lib/games/duck-hunt/model.js';
import {
	spawnFlights,
	flightPosition,
	duckGeometry,
	containsDuck,
	DIFFICULTIES
} from '../src/lib/games/duck-hunt/flight.js';
import { createPositionHistory, shotTiming, MAX_SHOT_AGE_MS } from '../src/lib/games/history.js';
import { worldToProjector, projectorToWorld } from '../src/lib/games/coordinates.js';
import { validGameReport } from '../src/lib/games/protocol.js';
const ORIGIN = 1700000000000;
function fixture(config = {}) {
	let now = 0,
		id = 0;
	const game = createDuckHunt({
		clock: () => now,
		timeOrigin: ORIGIN,
		random: () => 0.4,
		configuration: { ...DEFAULT_CONFIG, ...config }
	});
	const advance = (value) => {
		now = value;
		game.tick();
		return game.snapshot();
	};
	const shot = (point, at = now, source = 'simulated') =>
		game.handleShot({ id: `shot-${++id}`, detectedAt: ORIGIN + at, source }, point);
	const launch = () => {
		game.start();
		assert.equal(game.confirmReady(), true);
		advance(game.snapshot().readyAt);
		return game.snapshot().launchAt;
	};
	return { game, advance, shot, launch, now: () => now };
}
test('manual readiness, one scoring shot, result animation, and no automatic next encounter', () => {
	const f = fixture();
	assert.equal(f.game.confirmReady(), false);
	const launch = f.launch();
	assert.equal(f.game.confirmReady(), false);
	f.advance(launch + 2000);
	assert.equal(f.shot(f.game.snapshot().hitboxes[0]), true);
	assert.equal(f.game.snapshot().lastResult.outcome, 'HIT');
	assert.equal(f.shot({ x: 0, y: 0 }), false);
	assert.equal(f.game.snapshot().ducks[0].frame, 4);
	f.advance(f.now() + 400);
	assert.ok(f.game.snapshot().ducks[0].frame >= 5);
	f.advance(f.now() + RESOLUTION_MS);
	assert.equal(f.game.snapshot().phase, 'ROUND_RESULTS');
	assert.equal(f.game.snapshot().score, 100);
	f.advance(f.now() + 60000);
	assert.equal(f.game.snapshot().round, 1);
	assert.equal(f.shot({ x: 500, y: 300 }), false);
	assert.equal(f.game.confirmReady(), true);
});
test('empty sky and dog location miss and consume the sole shot', () => {
	for (const point of [
		{ x: 640, y: 100 },
		{ x: 105, y: 580 }
	]) {
		const f = fixture();
		f.launch();
		f.advance(f.now() + 2000);
		assert.equal(f.shot(point), true);
		assert.equal(f.game.snapshot().lastResult.outcome, 'MISS');
		assert.equal(f.game.snapshot().score, 0);
		assert.equal(f.shot(f.game.snapshot().hitboxes[0]), false);
	}
});
test('two-duck choice awards only the chosen duck and higher value for smaller faster duck', () => {
	for (const index of [0, 1]) {
		const f = fixture({ mode: 'choice', difficulty: 'normal' });
		f.launch();
		f.advance(f.now() + 2000);
		const boxes = f.game.snapshot().hitboxes;
		assert.equal(boxes.length, 2);
		assert.equal(f.shot(boxes[index]), true);
		const s = f.game.snapshot();
		assert.equal(s.hits, 1);
		assert.equal(s.lastResult.duckCount, 2);
		assert.equal(s.lastResult.targetId, `duck-${index + 1}`);
		assert.equal(s.score, index ? 200 : 150);
		assert.equal(f.shot(boxes[1 - index]), false);
	}
});
test('five encounters complete with accurate score and source labels', () => {
	const f = fixture({ rounds: 5 });
	f.game.start();
	for (let i = 0; i < 5; i++) {
		assert.equal(f.game.confirmReady(), true);
		f.advance(f.game.snapshot().readyAt);
		f.advance(f.now() + 2000);
		f.shot(f.game.snapshot().hitboxes[0], f.now(), i % 2 ? 'laser' : 'simulated');
		f.advance(f.now() + RESOLUTION_MS);
	}
	const s = f.game.snapshot();
	assert.equal(s.phase, 'SESSION_COMPLETE');
	assert.equal(s.score, 500);
	assert.equal(s.accuracy, 100);
	assert.equal(s.results.filter((r) => r.source === 'simulated').length, 3);
	assert.equal(f.game.confirmReady(), false);
});
test('escape settles delayed events then resolves without a shot', () => {
	const f = fixture();
	const start = f.launch(),
		duration = f.game.snapshot().flights[0].duration;
	f.advance(start + duration + 1);
	assert.equal(f.game.snapshot().settling, true);
	assert.equal(f.shot({ x: 0, y: 0 }), false);
	f.advance(start + duration + MAX_SHOT_AGE_MS + 1);
	assert.equal(f.game.snapshot().lastResult.outcome, 'ESCAPED');
	assert.equal(f.game.snapshot().escapes, 1);
	assert.equal(f.game.snapshot().lastResult.shotFired, false);
});
test('historical geometry hits where current geometry misses', () => {
	const f = fixture({ difficulty: 'hard' });
	const start = f.launch();
	f.advance(start + 1800);
	const box = f.game.snapshot().hitboxes[0];
	for (let i = 1; i <= 30; i++) f.advance(start + 1800 + i * 20);
	assert.equal(containsDuck(box, f.game.snapshot().hitboxes[0]), false);
	assert.equal(f.shot(box, start + 1800), true);
	const r = f.game.snapshot().lastResult;
	assert.equal(r.outcome, 'HIT');
	assert.equal(r.timing.method, 'timestamp-history');
	assert.equal(r.timing.delay, 600);
	assert.equal(r.geometry.x, box.x);
});
test('sparse frame history reconstructs deterministic path instead of interpolating large gaps', () => {
	const f = fixture();
	const start = f.launch();
	const box = duckGeometry(f.game.snapshot().flights[0], 2000);
	f.advance(start + 2500);
	assert.equal(f.shot(box, start + 2000), true);
	assert.equal(f.game.snapshot().lastResult.timing.method, 'path-reconstruction');
	assert.equal(f.game.snapshot().lastResult.outcome, 'HIT');
});
test('late shot can score a duck that left screen recently', () => {
	const f = fixture({ difficulty: 'hard' }),
		start = f.launch(),
		flight = f.game.snapshot().flights[0];
	const observed = start + flight.duration - 350,
		box = duckGeometry(flight, flight.duration - 350);
	f.advance(observed);
	f.advance(start + flight.duration + 100);
	assert.equal(f.game.snapshot().settling, true);
	assert.equal(f.shot(box, observed), true);
	assert.equal(f.game.snapshot().lastResult.outcome, 'HIT');
});
test('stale or prelaunch events do not consume a shot or leak into next encounter', () => {
	const f = fixture();
	const start = f.launch();
	f.advance(start + 2500);
	assert.equal(f.shot({ x: 640, y: 300 }, start + 100), false);
	assert.equal(f.shot({ x: 640, y: 300 }, start - 10), false);
	assert.equal(f.game.snapshot().shotUsed, false);
	assert.equal(f.shot(f.game.snapshot().hitboxes[0]), true);
});
test('timestamp conversion handles cross-window epoch origins, invalid, future and stale values', () => {
	assert.deepEqual(shotTiming({ detectedAt: ORIGIN + 123 }, 200, ORIGIN), {
		time: 123,
		delay: 77,
		method: 'timestamp-history'
	});
	assert.equal(shotTiming({ detectedAt: ORIGIN + 220 }, 200, ORIGIN).time, 200);
	assert.equal(shotTiming({ detectedAt: ORIGIN + 300 }, 200, ORIGIN).method, 'receipt-fallback');
	assert.equal(shotTiming({ detectedAt: NaN }, 200, ORIGIN).method, 'receipt-fallback');
	assert.equal(shotTiming({ detectedAt: ORIGIN }, 1001, ORIGIN).method, 'stale-rejected');
});
test('pause freezes animation, resume shifts flight clock, pre-pause events rejected', () => {
	const f = fixture();
	f.launch();
	f.advance(f.now() + 2000);
	const before = f.game.snapshot();
	f.game.pause();
	f.advance(f.now() + 5000);
	assert.deepEqual(f.game.snapshot().ducks, before.ducks);
	assert.equal(f.shot(before.hitboxes[0]), false);
	f.game.resume();
	assert.deepEqual(f.game.snapshot().ducks, before.ducks);
	assert.equal(f.shot(before.hitboxes[0], f.now() - 100), false);
	assert.equal(f.shot(f.game.snapshot().hitboxes[0]), true);
});
test('pause preserves randomized launch delay and resolution duration', () => {
	const f = fixture();
	f.game.start();
	f.game.confirmReady();
	const ready = f.game.snapshot().readyAt;
	f.game.pause();
	f.advance(5000);
	f.game.resume();
	f.advance(ready + 4999);
	assert.equal(f.game.snapshot().phase, 'LAUNCH_DELAY');
	f.advance(ready + 5000);
	assert.equal(f.game.snapshot().phase, 'FLYING');
	f.advance(f.now() + 2000);
	f.shot({ x: 640, y: 90 });
	f.game.pause();
	f.advance(f.now() + 5000);
	f.game.resume();
	assert.equal(f.game.snapshot().phase, 'RESOLVING');
	f.advance(f.now() + 1499);
	assert.equal(f.game.snapshot().phase, 'RESOLVING');
	f.advance(f.now() + 1);
	assert.equal(f.game.snapshot().phase, 'ROUND_RESULTS');
});
test('restart clears results/history and permits new setup; destroy blocks all scoring', () => {
	const f = fixture();
	f.launch();
	f.advance(f.now() + 2000);
	assert.equal(f.game.updateConfiguration({ ...DEFAULT_CONFIG, difficulty: 'hard' }), false);
	f.shot(f.game.snapshot().hitboxes[0]);
	f.game.reset();
	const s = f.game.snapshot();
	assert.equal(s.phase, 'WAITING_FOR_READY');
	assert.equal(s.round, 0);
	assert.equal(s.historySamples, 0);
	assert.equal(s.results.length, 0);
	assert.equal(f.game.updateConfiguration({ ...DEFAULT_CONFIG, difficulty: 'hard' }), true);
	f.game.destroy();
	assert.equal(f.game.confirmReady(), false);
	assert.equal(f.shot({ x: 0, y: 0 }), false);
});
test('history interpolates geometry, copies values, bounds age and count, rejects reversal', () => {
	const h = createPositionHistory({ maxAge: 100, maxSamples: 5 });
	const a = { id: 'a', x: 0, y: 10, rx: 10, ry: 5 };
	h.record(0, [a]);
	a.x = 900;
	h.record(20, [{ ...a, x: 20 }]);
	assert.equal(h.sample(10).targets[0].x, 10);
	assert.equal(h.sample(-1), null);
	assert.equal(h.sample(21), null);
	h.sample(0).targets[0].x = 123;
	assert.equal(h.sample(0).targets[0].x, 0);
	for (let t = 40; t < 1000; t += 20) h.record(t, [{ ...a, x: t }]);
	assert.ok(h.size <= 5);
	assert.equal(h.sample(0), null);
	const size = h.size;
	h.record(1, [a]);
	assert.equal(h.size, size);
	h.clear();
	assert.equal(h.size, 0);
});
test('seeded flight configurations cover patterns, sides, bounds and separated choice lanes', () => {
	let seed = 867;
	const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
	const patterns = new Set(),
		sides = new Set();
	for (const difficulty of Object.keys(DIFFICULTIES))
		for (let i = 0; i < 60; i++) {
			const flights = spawnFlights({ mode: 'choice', difficulty }, random);
			for (const f of flights) {
				patterns.add(f.pattern);
				sides.add(f.direction);
				assert.ok(f.speed > 0);
				assert.ok(f.startY >= f.lane.min && f.startY <= f.lane.max);
				for (let t = 0; t < f.duration; t += 173) {
					const p = flightPosition(f, t);
					assert.ok(p.y >= f.lane.min && p.y <= f.lane.max);
					assert.ok(p.x >= -80 && p.x <= 1360);
				}
			}
			for (let t = 0; t < Math.min(...flights.map((f) => f.duration)); t += 100) {
				const [a, b] = flights.map((f) => duckGeometry(f, t));
				assert.ok(b.y - a.y > a.ry + b.ry);
			}
		}
	assert.equal(patterns.size, 5);
	assert.equal(sides.size, 2);
});
test('flight position independent of update count, continuous, difficulty changes size and speed', () => {
	const easy = spawnFlights({ ...DEFAULT_CONFIG }, () => 0.4)[0],
		hard = spawnFlights({ ...DEFAULT_CONFIG, difficulty: 'hard' }, () => 0.4)[0];
	assert.ok(hard.speed > easy.speed);
	assert.ok(hard.scale < easy.scale);
	assert.ok(hard.duration < easy.duration);
	const at = flightPosition(hard, 1600);
	for (let i = 0; i < 100; i++) flightPosition(hard, i * 16);
	assert.deepEqual(flightPosition(hard, 1600), at);
	const next = flightPosition(hard, 1601);
	assert.ok(Math.abs(next.x - at.x) < 1 && Math.abs(next.y - at.y) < 1);
});
test('ellipse geometry scales and flips with body; transparent corners and wings miss', () => {
	const f = spawnFlights(DEFAULT_CONFIG, () => 0.4)[0],
		box = duckGeometry(f, 2000),
		pos = flightPosition(f, 2000);
	assert.equal(box.x, pos.x - f.scale);
	assert.equal(box.y, pos.y + 5 * f.scale);
	assert.equal(box.rx, 18 * f.scale);
	assert.equal(containsDuck(box, box), true);
	assert.equal(containsDuck({ x: box.x + box.rx, y: box.y + box.ry }, box), false);
	assert.equal(containsDuck({ x: pos.x, y: pos.y - 19 * f.scale }, box), false);
	const reverse = { ...f, direction: -1, startX: 1360 };
	const reversed = duckGeometry(reverse, 2000);
	assert.equal(reversed.x, flightPosition(reverse, 2000).x + f.scale);
});
test('portrait and wide letterboxed projector mapping roundtrip for moving geometry', () => {
	for (const viewport of [
		{ width: 900, height: 1200 },
		{ width: 2000, height: 700 }
	]) {
		const scale = Math.min(viewport.width / 1280, viewport.height / 720),
			canvas = {
				left: (viewport.width - 1280 * scale) / 2,
				top: (viewport.height - 720 * scale) / 2,
				width: 1280 * scale,
				height: 720 * scale
			};
		const point = { x: 337, y: 296 },
			n = worldToProjector(point, viewport, canvas),
			back = projectorToWorld(n, viewport, canvas);
		assert.ok(Math.abs(back.x - point.x) < 1e-8 && Math.abs(back.y - point.y) < 1e-8);
		assert.equal(projectorToWorld({ x: 0, y: 0 }, viewport, canvas), null);
	}
});
test('configuration and game report validation rejects malformed/wrong activity payloads', () => {
	assert.equal(validConfig({ ...DEFAULT_CONFIG, difficulty: '__proto__' }), false);
	assert.equal(validConfig({ ...DEFAULT_CONFIG, rounds: 1 }), false);
	const f = fixture();
	const report = {
		...f.game.snapshot(),
		activity: 'duck-hunt',
		gameId: 'test',
		canvas: { left: 0, top: 0, width: 1280, height: 720 },
		viewport: { width: 1280, height: 720 }
	};
	assert.equal(validGameReport(report, 'duck-hunt'), true);
	assert.equal(validGameReport(report), false);
	assert.equal(validGameReport({ ...report, ducks: [{ x: NaN }] }, 'duck-hunt'), false);
});
