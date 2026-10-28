export function emptySession() {
	return { status: 'idle', shots: 0, hits: 0, score: 0, lastScore: null, simulated: 0 };
}
export function recordShot(session, result, simulated = false) {
	if (session.status !== 'running' || !result) return session;
	return {
		...session,
		shots: session.shots + 1,
		hits: session.hits + (result.score > 0 ? 1 : 0),
		score: session.score + result.score,
		lastScore: result.score,
		simulated: session.simulated + Number(simulated)
	};
}
export function accuracy(session) {
	return session.shots ? Math.round((session.hits / session.shots) * 100) : 0;
}

// One pulse must clear before the next can be accepted, in addition to cooldown.
export function createTemporalFilter() {
	let previous = null,
		frames = 0,
		latched = false,
		last = -Infinity;
	return {
		reset() {
			previous = null;
			frames = 0;
			latched = false;
			last = -Infinity;
		},
		update(candidates, time, { confirmationFrames = 1, cooldown = 250 } = {}) {
			if (!candidates.length) {
				previous = null;
				frames = 0;
				latched = false;
				return null;
			}
			const candidate = candidates[0];
			frames =
				previous && Math.hypot(previous.x - candidate.x, previous.y - candidate.y) <= 20
					? frames + 1
					: 1;
			previous = candidate;
			if (latched || frames < confirmationFrames || time - last < cooldown) return null;
			latched = true;
			last = time;
			return candidate;
		}
	};
}

export function validSettings(settings) {
	const limits = {
		brightness: [0, 255],
		dominance: [0, 255],
		minSize: [1, 10000],
		maxSize: [1, 10000],
		confirmationFrames: [1, 10],
		cooldown: [0, 5000]
	};
	return (
		(settings.color === undefined || ['red', 'green'].includes(settings.color)) &&
		Object.entries(limits).every(
			([key, [min, max]]) =>
				Number.isFinite(settings[key]) && settings[key] >= min && settings[key] <= max
		) &&
		Number.isInteger(settings.confirmationFrames) &&
		settings.maxSize >= settings.minSize
	);
}
