export const DIFFICULTIES = {
	easy: {
		scale: 2.5,
		speed: [160, 205],
		points: 100,
		patterns: ['horizontal', 'curve'],
		amplitude: 12
	},
	normal: {
		scale: 2,
		speed: [220, 280],
		points: 150,
		patterns: ['horizontal', 'ascending', 'descending', 'curve', 'wander'],
		amplitude: 22
	},
	hard: {
		scale: 1.55,
		speed: [310, 380],
		points: 200,
		patterns: ['ascending', 'descending', 'curve', 'wander'],
		amplitude: 28
	}
};
const choose = (items, random) =>
	items[Math.min(items.length - 1, Math.floor(random() * items.length))];
export function spawnFlights(config, random = Math.random) {
	const preset = DIFFICULTIES[config.difficulty],
		count = config.mode === 'choice' ? 2 : 1;
	return Array.from({ length: count }, (_, index) => {
		const direction = random() < 0.5 ? 1 : -1,
			speed =
				(preset.speed[0] + random() * (preset.speed[1] - preset.speed[0])) * (index ? 1.18 : 1);
		const lane =
			count === 1
				? { min: 165, max: 510 }
				: index
					? { min: 395, max: 505 }
					: { min: 180, max: 315 };
		return {
			id: `duck-${index + 1}`,
			direction,
			startX: direction === 1 ? -80 : 1360,
			startY: lane.min + 30 + random() * (lane.max - lane.min - 60),
			lane,
			speed,
			scale: preset.scale * (index ? 0.8 : 1),
			points: preset.points + (index ? 50 : 0),
			pattern: choose(preset.patterns, random),
			amplitude: preset.amplitude,
			phase: random() * Math.PI * 2,
			flapPeriod: 280 + random() * 140,
			duration: (1440 / speed) * 1000
		};
	});
}
export function flightPosition(flight, elapsed) {
	const seconds = Math.max(0, elapsed) / 1000,
		progress = Math.max(0, Math.min(1, elapsed / flight.duration));
	let y = flight.startY;
	if (flight.pattern === 'ascending') y -= 70 * progress;
	if (flight.pattern === 'descending') y += 70 * progress;
	if (['curve', 'wander'].includes(flight.pattern))
		y += flight.amplitude * (Math.sin(seconds * 1.7 + flight.phase) - Math.sin(flight.phase));
	if (flight.pattern === 'wander') y += flight.amplitude * 0.35 * Math.sin(seconds * 3.1);
	// Continuous path, bounded to a lane; two-choice lanes stay separated.
	const center = (flight.lane.min + flight.lane.max) / 2,
		half = (flight.lane.max - flight.lane.min) / 2;
	y = center + Math.tanh((y - center) / half) * half;
	return { x: flight.startX + flight.direction * flight.speed * seconds, y };
}
export function duckGeometry(flight, elapsed) {
	const position = flightPosition(flight, elapsed);
	return {
		id: flight.id,
		x: position.x + (flight.direction === 1 ? -1 : 1) * flight.scale,
		y: position.y + 5 * flight.scale,
		rx: 18 * flight.scale,
		ry: 10 * flight.scale
	};
}
export function containsDuck(point, box) {
	return ((point.x - box.x) / box.rx) ** 2 + ((point.y - box.y) / box.ry) ** 2 <= 1;
}
