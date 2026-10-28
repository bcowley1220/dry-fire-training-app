import { PHASES, validConfig } from './high-noon/model.js';
export function validGameReport(report) {
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
