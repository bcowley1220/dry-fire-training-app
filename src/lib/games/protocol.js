import { PHASES, validConfig } from './high-noon/model.js';
import { PHASES as DUCK_PHASES, validConfig as validDuckConfig } from './duck-hunt/model.js';
export function validGameReport(report, activity = 'high-noon') {
	if (activity === 'duck-hunt') return validDuckReport(report);
	return !!(
		report &&
		typeof report.gameId === 'string' &&
		PHASES.includes(report.phase) &&
		typeof report.paused === 'boolean' &&
		validConfig(report.config) &&
		Array.isArray(report.results) &&
		report.results.length <= 50 &&
		report.results.every(
			(r) =>
				Number.isInteger(r.round) &&
				Number.isFinite(r.points) &&
				['laser', 'simulated', null].includes(r.source)
		) &&
		Number.isInteger(report.round) &&
		report.round >= 0 &&
		report.round <= report.config.rounds &&
		Number.isFinite(report.score) &&
		report.pose &&
		Number.isInteger(report.pose.frame) &&
		report.pose.frame >= 0 &&
		report.pose.frame < 8 &&
		[report.pose.x, report.pose.y, report.pose.scale].every(Number.isFinite) &&
		Array.isArray(report.hitboxes) &&
		report.hitboxes.every(
			(b) =>
				['torso', 'hip'].includes(b.region) && [b.x, b.y, b.width, b.height].every(Number.isFinite)
		) &&
		report.viewport &&
		report.canvas &&
		[
			report.viewport.width,
			report.viewport.height,
			report.canvas.left,
			report.canvas.top,
			report.canvas.width,
			report.canvas.height
		].every(Number.isFinite) &&
		report.canvas.width > 0 &&
		report.canvas.height > 0
	);
}

function validDuckReport(r) {
	return !!(
		r &&
		r.activity === 'duck-hunt' &&
		typeof r.gameId === 'string' &&
		DUCK_PHASES.includes(r.phase) &&
		typeof r.paused === 'boolean' &&
		validDuckConfig(r.config) &&
		Number.isInteger(r.round) &&
		r.round >= 0 &&
		r.round <= r.config.rounds &&
		[r.score, r.hits, r.misses, r.escapes, r.accuracy, r.sampleEpoch].every(Number.isFinite) &&
		Array.isArray(r.results) &&
		r.results.length <= 20 &&
		r.results.every(
			(v) =>
				Number.isInteger(v.round) &&
				Number.isFinite(v.points) &&
				['laser', 'simulated', null].includes(v.source)
		) &&
		Array.isArray(r.ducks) &&
		r.ducks.length <= 2 &&
		r.ducks.every(
			(d) =>
				[d.x, d.y, d.scale, d.rotation].every(Number.isFinite) &&
				Number.isInteger(d.frame) &&
				d.frame >= 0 &&
				d.frame < 7
		) &&
		Array.isArray(r.hitboxes) &&
		r.hitboxes.length <= 2 &&
		r.hitboxes.every(
			(b) => [b.x, b.y, b.rx, b.ry].every(Number.isFinite) && b.rx > 0 && b.ry > 0
		) &&
		r.canvas &&
		r.viewport &&
		[
			r.canvas.left,
			r.canvas.top,
			r.canvas.width,
			r.canvas.height,
			r.viewport.width,
			r.viewport.height
		].every(Number.isFinite) &&
		r.canvas.width > 0 &&
		r.canvas.height > 0
	);
}
