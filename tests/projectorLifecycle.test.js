import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createCameraLease,
	restoreCalibration,
	clearStoredCalibration,
	CALIBRATION_STORAGE_KEY
} from '../src/lib/projector/lifecycle.js';
import {
	createDisplayConnection,
	CONNECTION_TIMEOUT_MS,
	envelope,
	channelName,
	geometryKey,
	validDisplayState,
	isMessage
} from '../src/lib/projector/protocol.js';
import { emptySession } from '../src/lib/projector/session.js';
import { CORNERS, DEFAULT_TARGET } from '../src/lib/projector/geometry.js';

function fakeStream() {
	const tracks = [0, 1].map(() => ({
		stopped: 0,
		onended: () => {},
		stop() {
			this.stopped++;
		}
	}));
	return { getTracks: () => tracks, tracks };
}
function stopped(stream) {
	assert.ok(stream.tracks.every((track) => track.stopped === 1 && track.onended === null));
}

test('switching cameras stops the attached stream and rejects a late permission response', async () => {
	const lease = createCameraLease();
	const first = fakeStream();
	assert.ok(lease.attach(lease.generation, first));
	const pendingRequest = lease.generation;
	let resolve;
	const permission = new Promise((done) => {
		resolve = done;
	});
	const late = permission.then((stream) => lease.attach(pendingRequest, stream));
	lease.stop();
	stopped(first);
	const next = fakeStream();
	assert.ok(lease.attach(lease.generation, next));
	const stale = fakeStream();
	resolve(stale);
	assert.equal(await late, false);
	stopped(stale);
	assert.ok(next.tracks.every((track) => track.stopped === 0));
	lease.stop();
	stopped(next);
});
test('leaving while permission is pending releases all tracks when the request finishes', () => {
	const lease = createCameraLease(),
		request = lease.generation;
	lease.stop();
	const stream = fakeStream();
	assert.equal(lease.attach(request, stream), false);
	stopped(stream);
	assert.equal(lease.current(request), false);
});
test('stop is idempotent and invalidates continuation after video play or device enumeration', () => {
	const lease = createCameraLease(),
		stream = fakeStream(),
		request = lease.generation;
	lease.attach(request, stream);
	lease.stop();
	lease.stop();
	stopped(stream);
	assert.equal(lease.current(request), false);
	const current = lease.generation;
	assert.ok(lease.current(current));
});

const viewport = { width: 1920, height: 1080, dpr: 1 };
const key = geometryKey('usb-camera', 640, 480, viewport);
function storage(value) {
	let record = value;
	return {
		getItem(name) {
			assert.equal(name, CALIBRATION_STORAGE_KEY);
			return record;
		},
		removeItem(name) {
			assert.equal(name, CALIBRATION_STORAGE_KEY);
			record = null;
		}
	};
}
test('calibration restores only for matching camera and display geometry', () => {
	const saved = storage(JSON.stringify({ key, points: CORNERS }));
	const result = restoreCalibration(saved, key, 640, 480);
	assert.deepEqual(result.points, CORNERS);
	assert.equal(result.width, 640);
	assert.equal(result.height, 480);
	for (const changed of [
		geometryKey('other-camera', 640, 480, viewport),
		geometryKey('usb-camera', 1280, 720, viewport),
		geometryKey('usb-camera', 640, 480, { ...viewport, width: 1280 }),
		geometryKey('usb-camera', 640, 480, { ...viewport, height: 720 }),
		geometryKey('usb-camera', 640, 480, { ...viewport, dpr: 2 })
	])
		assert.equal(restoreCalibration(saved, changed, 640, 480), null);
	clearStoredCalibration(saved);
	// Returning to the original dimensions must not resurrect invalidated data.
	assert.equal(restoreCalibration(saved, key, 640, 480), null);
});
test('corrupt, degenerate, out-of-sensor, and unavailable calibration storage never blocks setup', () => {
	const invalid = [
		'{',
		JSON.stringify({ key, points: null }),
		JSON.stringify({ key, points: [null] }),
		JSON.stringify({ key, points: CORNERS.map(() => ({ x: 0.5, y: 0.5 })) }),
		JSON.stringify({ key, points: [{ x: -0.1, y: 0.2 }, ...CORNERS.slice(1)] })
	];
	for (const value of invalid)
		assert.equal(restoreCalibration(storage(value), key, 640, 480), null);
	const unavailable = {
		getItem() {
			throw new Error('blocked');
		},
		removeItem() {
			throw new Error('blocked');
		}
	};
	assert.equal(restoreCalibration(unavailable, key, 640, 480), null);
	assert.equal(restoreCalibration(null, key, 640, 480), null);
	assert.doesNotThrow(() => clearStoredCalibration(unavailable));
	assert.doesNotThrow(() => clearStoredCalibration(null));
});

test('heartbeat expires exactly at the timeout and reconnects only on valid readiness', () => {
	let now = 0;
	const connection = createDisplayConnection('controller', () => now);
	assert.equal(connection.expired(), true);
	assert.equal(connection.receive(envelope('controller', 'ready', { viewport })).type, 'ready');
	assert.equal(connection.expired(), false);
	now = CONNECTION_TIMEOUT_MS - 1;
	assert.equal(connection.expired(), false);
	connection.receive(envelope('other-controller', 'ready', { viewport }));
	connection.receive(envelope('controller', 'ready', { viewport: { ...viewport, width: 0 } }));
	now = CONNECTION_TIMEOUT_MS;
	assert.equal(connection.expired(), true);
	connection.receive(envelope('controller', 'ready', { viewport }));
	assert.equal(connection.expired(), false);
	assert.equal(connection.receive(envelope('controller', 'closed')).type, 'closed');
	assert.equal(connection.expired(), true);
});
test('unrelated messages do not close a display or refresh its heartbeat', () => {
	const connection = createDisplayConnection('a', () => 100);
	assert.equal(connection.receive(null), null);
	assert.equal(connection.receive(envelope('b', 'closed')), null);
	assert.equal(connection.receive({ ...envelope('a', 'ready', { viewport }), version: 99 }), null);
	assert.equal(connection.receive(envelope('a', 'state', { state: {} })), null);
	assert.equal(connection.expired(), true);
});
test('display messages reject inconsistent counters and invalid last scores', () => {
	const state = { calibrating: false, target: DEFAULT_TARGET, session: emptySession() };
	for (const invalid of [
		{ shots: 0.5 },
		{ hits: 1 },
		{ simulated: 1 },
		{ score: 10 },
		{ lastScore: 11 },
		{ lastScore: {} },
		{ lastScore: NaN }
	])
		assert.equal(validDisplayState({ ...state, session: { ...state.session, ...invalid } }), false);
	assert.equal(validDisplayState(state), true);
});
test(
	'native BroadcastChannel transports readiness and authoritative session snapshots',
	{ timeout: 3000 },
	async (t) => {
		const id = `test-${crypto.randomUUID()}`;
		const controller = new BroadcastChannel(channelName(id));
		const display = new BroadcastChannel(channelName(id));
		const connection = createDisplayConnection(id);
		t.after(() => {
			controller.close();
			display.close();
		});
		const received = new Promise((resolve) => {
			controller.onmessage = ({ data }) => {
				const message = connection.receive(data);
				assert.equal(message?.type, 'ready');
				controller.postMessage(
					envelope(id, 'state', {
						state: {
							target: DEFAULT_TARGET,
							calibrating: false,
							session: {
								...emptySession(),
								status: 'running',
								shots: 1,
								hits: 1,
								score: 10,
								lastScore: 10
							}
						}
					})
				);
			};
			display.onmessage = ({ data }) => {
				assert.ok(isMessage(data, id, 'state'));
				assert.ok(validDisplayState(data.state));
				resolve(data.state);
			};
		});
		display.postMessage(envelope(id, 'ready', { viewport }));
		const state = await received;
		assert.equal(state.session.lastScore, 10);
		assert.equal(state.session.shots, 1);
		assert.equal(connection.expired(), false);
	}
);
