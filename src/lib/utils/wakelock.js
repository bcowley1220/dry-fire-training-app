/**
 * Utility to manage Screen Wake Lock API
 * Prevents the device screen from dimming or locking during training
 */

let wakeLock = null;

export async function requestWakeLock() {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
		console.warn('Wake Lock API not supported in this browser.');
		return;
	}

	try {
		wakeLock = await navigator.wakeLock.request('screen');
		console.log('Screen Wake Lock acquired');

		wakeLock.addEventListener('release', () => {
			console.log('Screen Wake Lock released');
			// We don't nullify here immediately to avoid race conditions if we are re-requesting,
			// but the browser releases it automatically on visibility change.
		});
	} catch (err) {
		console.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
	}
}

export async function releaseWakeLock() {
	if (wakeLock) {
		try {
			await wakeLock.release();
			wakeLock = null;
			console.log('Screen Wake Lock released manually');
		} catch (err) {
			console.error(`Wake Lock release failed: ${err.name}, ${err.message}`);
		}
	}
}
