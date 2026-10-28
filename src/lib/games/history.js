// Small reusable history for moving-target games. Times use the game owner's
// monotonic domain; geometry uses logical world pixels.
export function createPositionHistory({ maxAge = 2000, maxSamples = 150 } = {}) {
	const samples = [];
	return {
		clear() {
			samples.length = 0;
		},
		record(time, targets) {
			if (!Number.isFinite(time) || (samples.length && time < samples.at(-1).time)) return;
			const sample = { time, targets: targets.map((t) => ({ ...t })) };
			if (samples.at(-1)?.time === time) samples[samples.length - 1] = sample;
			else samples.push(sample);
			while (samples.length > maxSamples || (samples.length > 1 && samples[1].time < time - maxAge))
				samples.shift();
		},
		sample(time) {
			if (!samples.length || time < samples[0].time || time > samples.at(-1).time) return null;
			let right = samples.findIndex((s) => s.time >= time);
			if (right === 0 || samples[right].time === time)
				return { targets: samples[right].targets.map((t) => ({ ...t })), gap: 0 };
			const a = samples[right - 1],
				b = samples[right],
				ratio = (time - a.time) / (b.time - a.time);
			return {
				gap: b.time - a.time,
				targets: a.targets.map((first) => {
					const last = b.targets.find((t) => t.id === first.id);
					if (!last) return { ...first };
					const value = { ...first };
					for (const key of ['x', 'y', 'rx', 'ry'])
						value[key] = first[key] + (last[key] - first[key]) * ratio;
					return value;
				})
			};
		},
		get size() {
			return samples.length;
		}
	};
}
export const MAX_SHOT_AGE_MS = 1000;
export function shotTiming(event, receivedAt, timeOrigin) {
	const candidate = event.detectedAt - timeOrigin,
		delay = receivedAt - candidate;
	if (!Number.isFinite(candidate) || delay < -25)
		return { time: receivedAt, delay: null, method: 'receipt-fallback' };
	if (delay > MAX_SHOT_AGE_MS) return { time: null, delay, method: 'stale-rejected' };
	return {
		time: Math.min(candidate, receivedAt),
		delay: Math.max(0, delay),
		method: 'timestamp-history'
	};
}
