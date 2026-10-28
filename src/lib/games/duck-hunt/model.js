import {
	spawnFlights,
	flightPosition,
	duckGeometry,
	containsDuck,
	DIFFICULTIES
} from './flight.js';
import { createPositionHistory, shotTiming, MAX_SHOT_AGE_MS } from '../history.js';
export const DEFAULT_CONFIG = { mode: 'single', difficulty: 'easy', rounds: 10, sound: false };
export const PHASES = [
	'IDLE',
	'WAITING_FOR_READY',
	'LAUNCH_DELAY',
	'FLYING',
	'RESOLVING',
	'ROUND_RESULTS',
	'SESSION_COMPLETE'
];
export const RESOLUTION_MS = 1500;
export function validConfig(c) {
	return !!(
		c &&
		['single', 'choice'].includes(c.mode) &&
		Object.hasOwn(DIFFICULTIES, c.difficulty) &&
		[5, 10, 20].includes(c.rounds) &&
		typeof c.sound === 'boolean'
	);
}
export function createDuckHunt({
	clock = () => performance.now(),
	timeOrigin = performance.timeOrigin,
	random = Math.random,
	configuration = DEFAULT_CONFIG
} = {}) {
	if (!validConfig(configuration)) throw new Error('Invalid Duck Hunt configuration');
	const history = createPositionHistory();
	let state,
		destroyed = false;
	function initialize() {
		state = {
			phase: 'IDLE',
			paused: false,
			pausedAt: null,
			config: { ...configuration },
			round: 0,
			score: 0,
			hits: 0,
			misses: 0,
			escapes: 0,
			results: [],
			flights: [],
			readyAt: null,
			launchAt: null,
			resolvedAt: null,
			lastResult: null,
			lastShot: null,
			lastTiming: null,
			shotUsed: false,
			resumedAt: null
		};
		history.clear();
	}
	initialize();
	function elapsed(now) {
		return Math.max(0, now - state.launchAt);
	}
	function boxes(now) {
		return state.flights
			.filter((f) => elapsed(now) <= f.duration)
			.map((f) => duckGeometry(f, elapsed(now)));
	}
	function resolve(
		outcome,
		now,
		{ event = null, target = null, timing = null, geometry = null } = {}
	) {
		const hit = outcome === 'HIT',
			points = hit ? target.points : 0;
		const result = {
			round: state.round,
			mode: state.config.mode,
			difficulty: state.config.difficulty,
			duckCount: state.flights.length,
			shotFired: !!event,
			hit,
			escaped: outcome === 'ESCAPED',
			targetId: target?.id ?? null,
			targetSpeed: target?.speed ?? null,
			targetSize: target?.scale ?? null,
			timeToShot: event ? Math.max(0, timing.time - state.launchAt) : null,
			points,
			outcome,
			source: event?.source ?? null,
			shotTimestamp: event?.detectedAt ?? null,
			receivedAt: event ? now : null,
			timing,
			geometry
		};
		state.results.push(result);
		state.lastResult = result;
		state.score += points;
		if (hit) state.hits++;
		else if (outcome === 'MISS') state.misses++;
		else state.escapes++;
		state.phase = 'RESOLVING';
		state.resolvedAt = now;
	}
	function tick(now = clock()) {
		if (destroyed || state.paused) return;
		if (state.phase === 'LAUNCH_DELAY' && now >= state.readyAt) {
			state.phase = 'FLYING';
			state.launchAt = now;
			history.clear();
		}
		if (state.phase === 'FLYING') {
			history.record(now, boxes(now));
			if (state.flights.every((f) => elapsed(now) > f.duration + MAX_SHOT_AGE_MS))
				resolve('ESCAPED', now);
		}
		if (state.phase === 'RESOLVING' && now - state.resolvedAt >= RESOLUTION_MS)
			state.phase = state.round >= state.config.rounds ? 'SESSION_COMPLETE' : 'ROUND_RESULTS';
	}
	return {
		initialize,
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
			state.phase = 'LAUNCH_DELAY';
			state.readyAt = now + 650 + random() * 1000;
			state.launchAt = null;
			state.lastResult = null;
			state.resolvedAt = null;
			state.lastShot = null;
			state.lastTiming = null;
			state.shotUsed = false;
			state.flights = spawnFlights(state.config, random);
			history.clear();
			return true;
		},
		tick,
		handleShot(event, point, now = clock()) {
			if (destroyed || state.paused || state.shotUsed || !point || state.phase !== 'FLYING')
				return false;
			const timing = shotTiming(event, now, timeOrigin);
			state.lastShot = event;
			state.lastTiming = timing;
			if (
				timing.time === null ||
				timing.time < state.launchAt ||
				(state.resumedAt !== null && timing.time < state.resumedAt) ||
				state.flights.every((f) => timing.time - state.launchAt > f.duration)
			)
				return false;
			history.record(now, boxes(now));
			let sample = history.sample(timing.time);
			if (!sample || sample.gap > 120) {
				sample = {
					targets: state.flights
						.filter((f) => timing.time - state.launchAt <= f.duration)
						.map((f) => duckGeometry(f, timing.time - state.launchAt))
				};
				timing.method =
					timing.method === 'receipt-fallback' ? 'receipt-fallback' : 'path-reconstruction';
			}
			// Never interpolate an expired duck across its exit boundary.
			sample.targets = sample.targets.filter((box) =>
				state.flights.some((f) => f.id === box.id && timing.time - state.launchAt <= f.duration)
			);
			const geometry = sample.targets.find((box) => containsDuck(point, box)) ?? null;
			const target = geometry ? state.flights.find((f) => f.id === geometry.id) : null;
			state.shotUsed = true;
			resolve(target ? 'HIT' : 'MISS', now, {
				event,
				target,
				timing,
				geometry: geometry ?? sample.targets
			});
			return true;
		},
		snapshot(now = clock()) {
			const time = state.paused ? state.pausedAt : now,
				age = state.launchAt === null ? 0 : elapsed(time),
				resolutionAge = state.resolvedAt === null ? 0 : time - state.resolvedAt;
			const ducks = state.flights.map((f) => {
				let position = flightPosition(f, age),
					frame = Math.floor((age / f.flapPeriod) * 4) % 4,
					rotation = 0,
					visible = state.phase === 'FLYING' && age <= f.duration;
				if (
					state.lastResult &&
					['RESOLVING', 'ROUND_RESULTS', 'SESSION_COMPLETE'].includes(state.phase)
				) {
					const base = flightPosition(
						f,
						f.id === state.lastResult.targetId
							? state.lastResult.timeToShot
							: state.resolvedAt - state.launchAt
					);
					if (f.id === state.lastResult.targetId) {
						frame = resolutionAge < 150 ? 4 : 5 + (Math.floor(resolutionAge / 130) % 2);
						position = {
							x: base.x,
							y: Math.min(592, base.y + resolutionAge * 0.12 + resolutionAge ** 2 * 0.0003)
						};
						rotation = Math.min(1.3, resolutionAge / 700) * f.direction;
						visible = resolutionAge < RESOLUTION_MS;
					} else {
						position = {
							x: base.x + f.direction * resolutionAge * 0.55,
							y: base.y - resolutionAge * 0.22
						};
						visible = resolutionAge < 850;
					}
				}
				return { ...f, ...position, frame, rotation, visible };
			});
			return {
				...state,
				config: { ...state.config },
				results: state.results.map((r) => ({ ...r })),
				ducks,
				hitboxes: state.phase === 'FLYING' ? boxes(time) : [],
				settling: state.phase === 'FLYING' && state.flights.every((f) => age > f.duration),
				accuracy: state.results.length ? Math.round((state.hits / state.results.length) * 100) : 0,
				historySamples: history.size,
				sampledAt: time,
				sampleEpoch: timeOrigin + time,
				resolutionAge
			};
		},
		pause(now = clock()) {
			if (destroyed || state.paused || ['IDLE', 'SESSION_COMPLETE'].includes(state.phase)) return;
			tick(now);
			state.paused = true;
			state.pausedAt = now;
		},
		resume(now = clock()) {
			if (destroyed || !state.paused) return;
			const duration = now - state.pausedAt;
			for (const key of ['readyAt', 'launchAt', 'resolvedAt'])
				if (state[key] !== null) state[key] += duration;
			// Previous samples refer to the pre-pause time domain: reconstruct paths for
			// the first resumed frames instead of interpolating across the pause.
			history.clear();
			state.resumedAt = now;
			state.paused = false;
			state.pausedAt = null;
		},
		reset() {
			if (!destroyed) {
				initialize();
				state.phase = 'WAITING_FOR_READY';
			}
		},
		updateConfiguration(config) {
			if (destroyed || !validConfig(config) || state.round > 0) return false;
			configuration = { ...config };
			state.config = { ...config };
			return true;
		},
		destroy() {
			destroyed = true;
			history.clear();
		}
	};
}
