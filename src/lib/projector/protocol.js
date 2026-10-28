export const VERSION = 1;
export function channelName(id) {
	return `dry-fire-projector-${id}`;
}
export function validViewport(v) {
	return (
		v &&
		Number.isFinite(v.width) &&
		Number.isFinite(v.height) &&
		v.width > 0 &&
		v.height > 0 &&
		Number.isFinite(v.dpr) &&
		v.dpr > 0
	);
}
export function isMessage(data, id, type) {
	return data?.version === VERSION && data.id === id && data.type === type;
}
export function envelope(id, type, payload = {}) {
	return { version: VERSION, id, type, ...payload };
}
export function geometryKey(camera, width, height, viewport) {
	return JSON.stringify([camera, width, height, viewport.width, viewport.height, viewport.dpr]);
}
export function validDisplayState(state) {
	return (
		state &&
		typeof state.calibrating === 'boolean' &&
		(state.activity === undefined ||
			['target', 'high-noon', 'duck-hunt'].includes(state.activity)) &&
		['idle', 'running', 'paused'].includes(state.session?.status) &&
		['shots', 'hits', 'score', 'simulated'].every(
			(key) => Number.isInteger(state.session[key]) && state.session[key] >= 0
		) &&
		state.session.hits <= state.session.shots &&
		state.session.simulated <= state.session.shots &&
		state.session.score <= state.session.hits * 10 &&
		(state.session.lastScore === null ||
			(Number.isInteger(state.session.lastScore) &&
				state.session.lastScore >= 0 &&
				state.session.lastScore <= 10)) &&
		['x', 'y', 'size'].every((key) => Number.isFinite(state.target?.[key])) &&
		state.target.x >= 0 &&
		state.target.x <= 1 &&
		state.target.y >= 0 &&
		state.target.y <= 1 &&
		state.target.size >= 0.1 &&
		state.target.size <= 0.4
	);
}

export const CONNECTION_TIMEOUT_MS = 10000;
// Reject unrelated/malformed messages before they can refresh the heartbeat.
export function createDisplayConnection(id, now = Date.now) {
	let lastReady = null;
	return {
		receive(data) {
			if (isMessage(data, id, 'ready') && validViewport(data.viewport)) {
				lastReady = now();
				return { type: 'ready', viewport: { ...data.viewport } };
			}
			if (isMessage(data, id, 'closed')) {
				lastReady = null;
				return { type: 'closed' };
			}
			return null;
		},
		expired() {
			return lastReady === null || now() - lastReady >= CONNECTION_TIMEOUT_MS;
		}
	};
}
