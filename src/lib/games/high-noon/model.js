export const DEFAULT_CONFIG = { drawTime: 0.8, rounds: 10 };
export const PHASES = [
	'IDLE',
	'WAITING_FOR_READY',
	'READY_DELAY',
	'DRAWING',
	'ROUND_RESULTS',
	'SESSION_COMPLETE'
];
export const LOCAL_HITBOXES = [
	{ region: 'torso', x: 34, y: 45, width: 28, height: 34 },
	{ region: 'hip', x: 30, y: 84, width: 36, height: 23 }
];
export const FRAME_OFFSETS = [
	{ x: 0, y: 0 },
	{ x: 0, y: 0 },
	{ x: 0, y: 0 },
	{ x: 0, y: 0 },
	{ x: 0, y: 0 },
	{ x: 0, y: 0 },
	{ x: 3, y: 1 },
	{ x: 0, y: 0 }
];
export function validConfig(config) {
	return (
		config &&
		Number.isFinite(config.drawTime) &&
		config.drawTime >= 0.3 &&
		config.drawTime <= 2 &&
		Math.abs(config.drawTime * 10 - Math.round(config.drawTime * 10)) < 1e-8 &&
		Number.isInteger(config.rounds) &&
		config.rounds >= 1 &&
		config.rounds <= 50
	);
}
export function cowboyPose(snapshot, now) {
	const time = snapshot.paused ? snapshot.pausedAt : now;
	let frame = Math.floor(time / 600) % 2;
	// Anticipation holds a stance; the holster reach belongs only to DRAWING.
	if (snapshot.phase === 'READY_DELAY') frame = 2;
	if (snapshot.phase === 'DRAWING')
		frame = Math.min(
			5,
			3 + Math.floor(((time - snapshot.drawAt) / (snapshot.config.drawTime * 1000)) * 3)
		);
	if (snapshot.lastResult && ['ROUND_RESULTS', 'SESSION_COMPLETE'].includes(snapshot.phase))
		frame = snapshot.lastResult.win
			? time - snapshot.lastResult.resolvedAt < 220
				? 6
				: 7
			: snapshot.lastResult.outcome === 'OPPONENT_FIRED'
				? 5
				: 2;
	return { x: 640, y: 606, scale: 2.6, frame, bodyOffset: FRAME_OFFSETS[frame] };
}
// A small, single muzzle burst at the fired sprite's barrel, in world space.
export const MUZZLE_FLASH_MS = 140;
export function muzzleFlash(snapshot, now) {
	if (snapshot.paused || snapshot.lastResult?.outcome !== 'OPPONENT_FIRED') return null;
	const age = now - (snapshot.lastResult.firedAt ?? snapshot.lastResult.resolvedAt);
	if (age < 0 || age >= MUZZLE_FLASH_MS) return null;
	const pose = cowboyPose(snapshot, now),
		progress = age / MUZZLE_FLASH_MS;
	return {
		x: pose.x + (39 - 48) * pose.scale,
		y: pose.y + (31 - 176) * pose.scale,
		scale: 0.7 + 0.5 * progress,
		alpha: 1 - progress
	};
}
export function worldHitboxes(pose) {
	return LOCAL_HITBOXES.map((box) => ({
		region: box.region,
		x: pose.x + (box.x - 48 + pose.bodyOffset.x) * pose.scale,
		y: pose.y + (box.y - 176 + pose.bodyOffset.y) * pose.scale,
		width: box.width * pose.scale,
		height: box.height * pose.scale
	}));
}
export function hitRegion(point, pose) {
	return (
		worldHitboxes(pose).find(
			(box) =>
				point.x >= box.x &&
				point.x <= box.x + box.width &&
				point.y >= box.y &&
				point.y <= box.y + box.height
		)?.region ?? null
	);
}

// All input times belong to the owning projector's monotonic clock. Incoming
// detection timestamps remain metadata; a shot is accepted at local receipt.
export function createHighNoon({
	clock = () => performance.now(),
	random = Math.random,
	configuration = DEFAULT_CONFIG
} = {}) {
	if (!validConfig(configuration)) throw new Error('Invalid High Noon configuration');
	let state,
		destroyed = false;
	function initialize() {
		state = {
			phase: 'IDLE',
			paused: false,
			pausedAt: null,
			config: { ...configuration },
			round: 0,
			results: [],
			score: 0,
			bestReaction: null,
			readyAt: null,
			drawAt: null,
			deadline: null,
			lastResult: null,
			lastShot: null
		};
	}
	initialize();
	function finish(outcome, now, shot = null, region = null, reaction = null) {
		const win = outcome === 'PLAYER_HIT';
		const points = win ? (region === 'torso' ? 100 : 75) : outcome === 'FALSE_START' ? -50 : 0;
		const result = {
			round: state.round,
			opponentDrawTime: state.config.drawTime,
			reactionTime: reaction,
			shotTimestamp: shot?.detectedAt ?? null,
			acceptedAt: shot ? now : null,
			source: shot?.source ?? null,
			hit: !!region,
			region,
			falseStart: outcome === 'FALSE_START',
			win,
			points,
			outcome,
			resolvedAt: now
		};
		state.results.push(result);
		state.score += points;
		state.lastResult = result;
		if (win && (state.bestReaction === null || reaction < state.bestReaction))
			state.bestReaction = reaction;
		state.phase = state.round >= state.config.rounds ? 'SESSION_COMPLETE' : 'ROUND_RESULTS';
	}
	function tick(now = clock()) {
		if (destroyed || state.paused) return;
		if (state.phase === 'READY_DELAY' && now >= state.readyAt) {
			// Start the clock with the rendered DRAW cue, not a timer missed while hidden.
			state.phase = 'DRAWING';
			state.drawAt = now;
			state.deadline = now + state.config.drawTime * 1000;
		}
		if (state.phase === 'DRAWING' && now >= state.deadline) {
			finish('OPPONENT_FIRED', state.deadline);
			// Show the burst on the first rendered fired frame, even after a stall.
			state.lastResult.firedAt = now;
		}
	}
	return {
		initialize,
		snapshot(now = clock()) {
			const time = state.paused ? state.pausedAt : now;
			return {
				...state,
				config: { ...state.config },
				results: state.results.map((result) => ({ ...result })),
				remaining: state.phase === 'DRAWING' ? Math.max(0, state.deadline - time) : null,
				pose: cowboyPose(state, time),
				muzzleFlash: muzzleFlash(state, now)
			};
		},
		start() {
			if (!destroyed && state.phase === 'IDLE') state.phase = 'WAITING_FOR_READY';
		},
		confirmReady(now = clock()) {
			if (
				destroyed ||
				state.paused ||
				!['WAITING_FOR_READY', 'ROUND_RESULTS'].includes(state.phase)
			)
				return false;
			state.round++;
			state.phase = 'READY_DELAY';
			state.lastResult = null;
			state.lastShot = null;
			state.drawAt = null;
			state.deadline = null;
			state.readyAt = now + 1500 + Math.max(0, Math.min(1, random())) * 2500;
			return true;
		},
		tick,
		handleShot(shot, point, now = clock()) {
			if (destroyed || state.paused || !point || !['READY_DELAY', 'DRAWING'].includes(state.phase))
				return false;
			// A pulse arriving before the first rendered DRAW is always a false start.
			// During DRAWING an exact-deadline tie belongs to the opponent.
			if (state.phase === 'READY_DELAY') {
				state.lastShot = shot;
				finish('FALSE_START', now, shot);
				return true;
			}
			tick(now);
			if (state.phase !== 'DRAWING') return false;
			state.lastShot = shot;
			const region = hitRegion(point, cowboyPose(state, now));
			finish(
				region ? 'PLAYER_HIT' : 'PLAYER_MISSED',
				now,
				shot,
				region,
				Math.max(0, now - state.drawAt)
			);
			return true;
		},
		pause(now = clock()) {
			if (destroyed || state.paused || ['IDLE', 'SESSION_COMPLETE'].includes(state.phase)) return;
			tick(now);
			state.paused = true;
			state.pausedAt = now;
		},
		resume(now = clock()) {
			if (destroyed || !state.paused) return;
			const elapsed = now - state.pausedAt;
			for (const key of ['readyAt', 'drawAt', 'deadline'])
				if (state[key] !== null) state[key] += elapsed;
			if (state.lastResult)
				state.lastResult = {
					...state.lastResult,
					resolvedAt: state.lastResult.resolvedAt + elapsed
				};
			state.paused = false;
			state.pausedAt = null;
		},
		reset() {
			if (destroyed) return;
			initialize();
			state.phase = 'WAITING_FOR_READY';
		},
		updateConfiguration(config) {
			if (destroyed || !validConfig(config) || state.round > 0) return false;
			configuration = { ...config };
			state.config = { ...config };
			return true;
		},
		destroy() {
			destroyed = true;
		}
	};
}
