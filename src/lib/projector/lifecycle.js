import { homography } from './geometry.js';

// Own pending camera requests as well as the currently attached stream. A late
// permission response must never reopen a camera after switching or leaving.
export function createCameraLease() {
	let generation = 0;
	let stream = null;
	function stopTracks(value) {
		for (const track of value.getTracks()) {
			track.onended = null;
			track.stop();
		}
	}
	return {
		get generation() {
			return generation;
		},
		current(request) {
			return request === generation;
		},
		attach(request, next) {
			if (request !== generation) {
				stopTracks(next);
				return false;
			}
			if (stream && stream !== next) stopTracks(stream);
			stream = next;
			return true;
		},
		stop() {
			generation++;
			if (stream) stopTracks(stream);
			stream = null;
		}
	};
}

export const CALIBRATION_STORAGE_KEY = 'dry-fire-projector-calibration-v1';
export function restoreCalibration(storage, key, width, height) {
	try {
		const saved = JSON.parse(storage.getItem(CALIBRATION_STORAGE_KEY) || 'null');
		if (
			saved?.key !== key ||
			!Array.isArray(saved.points) ||
			!saved.points.every(
				(p) =>
					p &&
					Number.isFinite(p.x) &&
					Number.isFinite(p.y) &&
					p.x >= 0 &&
					p.x <= 1 &&
					p.y >= 0 &&
					p.y <= 1
			)
		)
			return null;
		return { points: saved.points, matrix: homography(saved.points), width, height };
	} catch {
		return null;
	}
}
export function clearStoredCalibration(storage) {
	try {
		storage.removeItem(CALIBRATION_STORAGE_KEY);
	} catch {
		/* Storage is optional. */
	}
}
