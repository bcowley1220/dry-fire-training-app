import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createHighNoon,
	DEFAULT_CONFIG,
	cowboyPose,
	worldHitboxes,
	hitRegion,
	validConfig,
	FRAME_OFFSETS,
	MUZZLE_FLASH_MS
} from '../src/lib/games/high-noon/model.js';
import {
	fitCanvas,
	projectorToWorld,
	worldToProjector,
	validShot,
	shotEvent
} from '../src/lib/games/coordinates.js';
import {
	grayscalePixels,
	drawHud,
	createCowboySheet,
	drawForeground,
	drawMuzzleFlash
} from '../src/lib/games/high-noon/art.js';
import { validGameReport } from '../src/lib/games/protocol.js';
import { detectLaserDots } from '../src/lib/utils/detection.js';

function harness(config = { ...DEFAULT_CONFIG, rounds: 2 }, random = () => 0) {
	let now = 0;
	const game = createHighNoon({ clock: () => now, configuration: config, random });
	const state = () => game.snapshot();
	const advance = (time) => {
		now = time;
		game.tick();
	};
	const shot = (point, source = 'simulated') =>
		game.handleShot({ id: crypto.randomUUID(), source, detectedAt: 123456 }, point);
	function ready() {
		game.start();
		game.confirmReady();
		advance(state().readyAt);
	}
	function point(region = 'torso') {
		const box = worldHitboxes(state().pose).find((b) => b.region === region);
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	}
	return { game, state, advance, shot, ready, point, setTime: (t) => (now = t) };
}
test('session starts only on command and every round waits for explicit readiness', () => {
	const h = harness();
	assert.equal(h.state().phase, 'IDLE');
	h.game.start();
	assert.equal(h.state().phase, 'WAITING_FOR_READY');
	h.advance(9000);
	assert.equal(h.state().round, 0);
	h.game.confirmReady();
	assert.equal(h.state().phase, 'READY_DELAY');
	h.advance(h.state().readyAt);
	h.setTime(10700);
	h.shot(h.point());
	assert.equal(h.state().phase, 'ROUND_RESULTS');
	h.advance(100000);
	assert.equal(h.state().round, 1);
	h.game.confirmReady();
	assert.equal(h.state().round, 2);
	assert.equal(h.state().phase, 'READY_DELAY');
});
test('random delay stays between 1.5 and 4 seconds, with no countdown state in reports', () => {
	for (const [random, expected] of [
		[0, 1500],
		[0.5, 2750],
		[1, 4000]
	]) {
		const h = harness(undefined, () => random);
		h.game.start();
		h.game.confirmReady();
		assert.equal(h.state().readyAt, expected);
	}
});
test('a pre-cue shot is a false start even if a stalled renderer has missed the scheduled cue', () => {
	const h = harness();
	h.game.start();
	h.game.confirmReady();
	h.setTime(1600);
	assert.ok(h.shot({ x: 0, y: 0 }));
	assert.equal(h.state().lastResult.outcome, 'FALSE_START');
	assert.equal(h.state().score, -50);
	assert.equal(h.state().lastResult.reactionTime, null);
	assert.equal(h.shot(h.point()), false);
	assert.equal(h.state().results.length, 1);
});
test('torso and hip score distinctly, real and simulated input share the same handler', () => {
	for (const [region, points] of [
		['torso', 100],
		['hip', 75]
	])
		for (const source of ['simulated', 'laser']) {
			const h = harness();
			h.ready();
			h.setTime(1700);
			assert.ok(h.shot(h.point(region), source));
			const result = h.state().lastResult;
			assert.equal(result.points, points);
			assert.equal(result.region, region);
			assert.equal(result.reactionTime, 200);
			assert.equal(result.source, source);
			assert.equal(result.shotTimestamp, 123456);
			assert.ok(result.win);
		}
});
test('hat, arms, legs and scenery miss; one shot ends a round', () => {
	const h = harness();
	h.ready();
	for (const p of [
		{ x: 640, y: 180 },
		{ x: 550, y: 350 },
		{ x: 640, y: 575 },
		{ x: 100, y: 400 }
	])
		assert.equal(hitRegion(p, h.state().pose), null);
	h.setTime(1600);
	assert.ok(h.shot({ x: 100, y: 400 }));
	assert.equal(h.state().lastResult.outcome, 'PLAYER_MISSED');
	assert.equal(h.state().score, 0);
	assert.equal(h.shot(h.point()), false);
	assert.equal(h.state().results.length, 1);
});
test('deadline ties and late hits belong to the opponent independent of detector timestamps', () => {
	for (const delta of [0, 1, 100]) {
		const h = harness();
		h.ready();
		h.setTime(h.state().deadline + delta);
		assert.equal(h.shot(h.point()), false);
		assert.equal(h.state().lastResult.outcome, 'OPPONENT_FIRED');
		assert.equal(h.state().score, 0);
	}
	const h = harness();
	h.ready();
	h.setTime(h.state().deadline - 1);
	assert.ok(h.shot(h.point()));
	assert.ok(h.state().lastResult.win);
});
test('opponent fires without a shot and completion never automatically starts another round', () => {
	const h = harness({ ...DEFAULT_CONFIG, rounds: 1 });
	h.ready();
	h.advance(h.state().deadline);
	assert.equal(h.state().phase, 'SESSION_COMPLETE');
	assert.equal(h.state().lastResult.source, null);
	assert.equal(h.game.confirmReady(), false);
	h.game.reset();
	assert.equal(h.state().phase, 'WAITING_FOR_READY');
	assert.equal(h.state().score, 0);
	assert.equal(h.state().results.length, 0);
	assert.equal(h.state().bestReaction, null);
});
test('pause freezes ready delay and drawing deadline; paused shots cannot count', () => {
	const h = harness();
	h.game.start();
	h.game.confirmReady();
	h.setTime(500);
	h.game.pause();
	h.advance(10000);
	assert.equal(h.state().phase, 'READY_DELAY');
	assert.equal(h.shot({ x: 640, y: 330 }), false);
	h.game.resume();
	assert.equal(h.state().readyAt, 11000);
	h.advance(11000);
	h.setTime(11200);
	h.game.pause();
	const remaining = h.state().remaining;
	h.advance(21000);
	assert.equal(h.state().remaining, remaining);
	h.game.resume();
	assert.equal(h.state().deadline, 21600);
	h.setTime(21100);
	h.shot(h.point());
	assert.equal(h.state().lastResult.reactionTime, 300);
});
test('draw clock begins when DRAW is actually rendered after a delayed update', () => {
	const h = harness();
	h.game.start();
	h.game.confirmReady();
	h.advance(5000);
	assert.equal(h.state().drawAt, 5000);
	assert.equal(h.state().deadline, 5800);
});
test('configuration is constrained and locked for active rounds; destroy stops all transitions', () => {
	const h = harness();
	assert.ok(h.game.updateConfiguration({ drawTime: 1.5, rounds: 5 }));
	h.ready();
	assert.equal(h.game.updateConfiguration({ drawTime: 0.3, rounds: 1 }), false);
	for (const invalid of [
		{ drawTime: 0.2, rounds: 1 },
		{ drawTime: 2.1, rounds: 10 },
		{ drawTime: 0.85, rounds: 10 },
		{ drawTime: 0.8, rounds: 0 },
		{ drawTime: 0.8, rounds: 2.5 }
	])
		assert.equal(validConfig(invalid), false);
	h.game.destroy();
	h.advance(100000);
	assert.equal(h.state().phase, 'DRAWING');
	assert.equal(h.shot(h.point()), false);
	h.game.reset();
	assert.equal(h.state().round, 1);
});
test('sprite pose and local hitboxes transform together for all eight frames and changed scales', () => {
	for (let frame = 0; frame < 8; frame++) {
		const pose = { x: 700, y: 600, scale: 3, frame, bodyOffset: FRAME_OFFSETS[frame] };
		const boxes = worldHitboxes(pose);
		assert.equal(boxes[0].x, 700 + (34 - 48 + FRAME_OFFSETS[frame].x) * 3);
		assert.equal(boxes[0].y, 600 + (45 - 176 + FRAME_OFFSETS[frame].y) * 3);
		assert.equal(hitRegion({ x: boxes[0].x + 10, y: boxes[0].y + 10 }, pose), 'torso');
	}
	const h = harness();
	h.ready();
	const begin = cowboyPose(h.state(), 1500);
	const end = cowboyPose(h.state(), 2299);
	assert.equal(begin.frame, 3);
	assert.equal(end.frame, 5);
});
test('full-viewport projector coordinates correctly map FIT letterboxes, offsets and scales', () => {
	for (const viewport of [
		{ width: 1280, height: 720 },
		{ width: 1024, height: 768 },
		{ width: 800, height: 1200 },
		{ width: 2560, height: 1080 }
	]) {
		const rect = fitCanvas(viewport);
		const world = { x: 640, y: 360 };
		const p = worldToProjector(world, viewport, rect);
		const actual = projectorToWorld(p, viewport, rect);
		assert.ok(Math.abs(actual.x - world.x) < 1e-8);
		assert.ok(Math.abs(actual.y - world.y) < 1e-8);
	}
	const viewport = { width: 1024, height: 768 };
	assert.equal(projectorToWorld({ x: 0.5, y: 0.01 }, viewport), null);
	assert.equal(projectorToWorld({ x: 0, y: 0 }, viewport), null);
	const inset = { left: 100, top: 50, width: 640, height: 360 };
	const offsetPoint = projectorToWorld(
		{ x: 420 / 1000, y: 230 / 600 },
		{ width: 1000, height: 600 },
		inset
	);
	assert.ok(Math.abs(offsetPoint.x - 640) < 1e-8);
	assert.ok(Math.abs(offsetPoint.y - 360) < 1e-8);
	assert.equal(projectorToWorld({ x: NaN, y: 0.5 }, viewport), null);
	assert.equal(projectorToWorld({ x: 0.5, y: 0.5 }, viewport, { ...inset, width: 0 }), null);
});
test('shot contract retains source and capture metadata while validating normalized coordinates', () => {
	const shot = shotEvent(
		{ x: 0.4, y: 0.5 },
		'simulated',
		{ confidence: 0.9, camera: { deviceId: 'test' } },
		() => 123
	);
	assert.equal(shot.detectedAt, 123);
	assert.ok(validShot(shot));
	assert.equal(shot.camera.deviceId, 'test');
	assert.equal(validShot({ ...shot, x: 2 }), false);
	assert.equal(validShot({ ...shot, source: 'unknown' }), false);
});
test('grayscale asset conversion forces equal RGB channels without changing alpha', () => {
	const pixels = grayscalePixels(new Uint8ClampedArray([100, 110, 130, 255, 255, 1, 2, 100]));
	assert.equal(pixels[0], pixels[1]);
	assert.equal(pixels[1], pixels[2]);
	assert.equal(pixels[4], pixels[5]);
	assert.equal(pixels[5], pixels[6]);
	assert.equal(pixels[3], 255);
	assert.equal(pixels[7], 100);
});
test('projector detector supports selected green pulses and preserves red defaults', () => {
	const pixels = new Uint8ClampedArray(10 * 10 * 4);
	pixels.set([0, 255, 0, 255], (2 * 10 + 2) * 4);
	pixels.set([0, 255, 0, 255], (2 * 10 + 3) * 4);
	const settings = { brightness: 150, dominance: 30, minSize: 2, maxSize: 150, color: 'green' };
	const hits = detectLaserDots(pixels, 10, 10, false, null, 100, null, settings);
	assert.equal(hits.length, 1);
	assert.equal(hits[0].color, 'green');
	assert.equal(
		detectLaserDots(pixels, 10, 10, false, null, 100, null, { ...settings, color: 'red' }).length,
		0
	);
});
test('game report validation rejects missing renderer geometry and invalid phase', () => {
	const h = harness();
	const report = {
		...h.state(),
		gameId: 'game',
		hitboxes: worldHitboxes(h.state().pose),
		viewport: { width: 1280, height: 720 },
		canvas: { left: 0, top: 0, width: 1280, height: 720 }
	};
	assert.ok(validGameReport(report));
	assert.ok(!validGameReport({ ...report, canvas: null }));
	assert.ok(!validGameReport({ ...report, phase: 'FAKE' }));
});

test('HUD, foreground and fallback sprite use only neutral grayscale drawing colors', () => {
	const colors = [];
	const context = new Proxy(
		{},
		{
			get: (target, key) => target[key] ?? (() => {}),
			set: (target, key, value) => {
				if (['fillStyle', 'strokeStyle'].includes(key)) colors.push(value);
				target[key] = value;
				return true;
			}
		}
	);
	const h = harness();
	drawHud(context, h.state());
	h.ready();
	drawHud(context, h.state());
	h.setTime(1700);
	h.shot(h.point());
	drawHud(context, h.state());
	drawForeground(context);
	drawMuzzleFlash(context, { x: 20, y: 20, scale: 1, alpha: 1 });
	createCowboySheet(() => ({ getContext: () => context }));
	assert.ok(colors.length > 100);
	for (const color of colors) assert.match(color, /^#(?:([a-f0-9])\1\1|([a-f0-9]{2})\2\2)$/i);
});
test('multi-round score and best winning reaction remain correct at session completion', () => {
	const h = harness();
	h.ready();
	h.setTime(1700);
	h.shot(h.point());
	h.game.confirmReady();
	h.advance(h.state().readyAt);
	h.setTime(h.state().drawAt + 300);
	h.shot(h.point('hip'));
	assert.equal(h.state().phase, 'SESSION_COMPLETE');
	assert.equal(h.state().score, 175);
	assert.equal(h.state().bestReaction, 200);
	assert.deepEqual(
		h.state().results.map((r) => r.region),
		['torso', 'hip']
	);
});

test('cowboy fires one brief muzzle flash at the deadline, never for player results', () => {
	const h = harness();
	h.ready();
	assert.equal(h.state().muzzleFlash, null);
	const deadline = h.state().deadline;
	h.advance(deadline);
	const first = h.state().muzzleFlash;
	assert.ok(first);
	assert.equal(first.alpha, 1);
	assert.ok(first.x > 590 && first.x < 650);
	assert.ok(first.y > 200 && first.y < 260);
	h.advance(deadline + MUZZLE_FLASH_MS / 2);
	assert.ok(h.state().muzzleFlash.alpha < first.alpha);
	h.advance(deadline + MUZZLE_FLASH_MS);
	assert.equal(h.state().muzzleFlash, null);
	h.game.confirmReady();
	assert.equal(h.state().muzzleFlash, null);
	const stalled = harness();
	stalled.ready();
	stalled.advance(stalled.state().deadline + 500);
	assert.equal(stalled.state().muzzleFlash.alpha, 1);
	const win = harness();
	win.ready();
	win.setTime(1700);
	win.shot(win.point());
	assert.equal(win.state().muzzleFlash, null);
	const early = harness();
	early.game.start();
	early.game.confirmReady();
	early.shot({ x: 640, y: 330 });
	assert.equal(early.state().muzzleFlash, null);
});

test('ready stance never loops a holster reach, and drawing plays forward only once', () => {
	const h = harness();
	h.game.start();
	h.game.confirmReady();
	const readyAt = h.state().readyAt;
	for (let time = 0; time < readyAt; time += 100) {
		h.setTime(time);
		assert.equal(h.state().pose.frame, 2);
	}
	h.advance(readyAt);
	const deadline = h.state().deadline;
	const frames = [];
	for (let time = readyAt; time < deadline; time += 50) {
		h.setTime(time);
		frames.push(h.state().pose.frame);
	}
	assert.equal(frames[0], 3);
	assert.equal(frames.at(-1), 5);
	assert.ok(frames.every((frame, i) => i === 0 || frame >= frames[i - 1]));
	h.advance(deadline);
	assert.equal(h.state().pose.frame, 5);
	h.advance(deadline + 5000);
	assert.equal(h.state().pose.frame, 5);
	h.game.confirmReady();
	assert.equal(h.state().pose.frame, 2);
});
