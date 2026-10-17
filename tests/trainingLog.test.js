import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createSession,
	addRep,
	getSessions,
	getSessionWithReps,
	deleteSession
} from '../src/lib/storage/trainingLog.js';
import { createSessionWriter } from '../src/lib/storage/sessionWriter.js';

test('history survives a fresh module instance, includes reload totals, and deletes only the selected session', async () => {
	const session = await createSession({ drillType: 'reload', targets: [{ name: 'Wall' }] });
	const other = await createSession({});
	await Promise.all([
		addRep(session.id, {
			id: 'reload-one',
			drillType: 'reload',
			totalTime: 3000,
			drawTime: 1000,
			hits: [{ zone: 'A' }, { zone: 'C' }]
		}),
		addRep(session.id, {
			id: 'reload-two',
			drillType: 'reload',
			totalTime: 2000,
			drawTime: 800,
			hits: [{ zone: 'A' }, { zone: 'A' }]
		})
	]);
	const fresh = await import('../src/lib/storage/trainingLog.js?reopened');
	const result = await fresh.getSessionWithReps(session.id);
	assert.equal(result.session.repCount, 2);
	assert.equal(result.session.totalHits, 4);
	assert.equal(result.session.bestTime, 2000);
	assert.equal(result.session.averageTime, 2500);
	assert.equal(result.session.targets[0].name, 'Wall');
	assert.equal(result.reps.length, 2);
	await deleteSession(session.id);
	assert.deepEqual(await getSessionWithReps(session.id), { session: undefined, reps: [] });
	assert.ok((await getSessions()).some((item) => item.id === other.id));
});

test('retrying a rep is idempotent and cannot move it into another session', async () => {
	const session = await createSession({ drillType: 'callout' });
	const rep = {
		id: 'retry-rep',
		drillType: 'callout',
		drawTime: 1200,
		isFailure: true,
		calledTarget: 'Target 2',
		hit: { zone: 'A' }
	};
	await addRep(session.id, rep);
	await addRep(session.id, rep);
	assert.equal((await getSessionWithReps(session.id)).session.repCount, 1);
	const other = await createSession({});
	await assert.rejects(addRep(other.id, rep));
	assert.equal((await getSessionWithReps(other.id)).session.repCount, 0);
	assert.equal((await getSessionWithReps(session.id)).reps[0].isFailure, true);
});

test('deleted or missing parents and invalid times cannot create orphaned reps', async () => {
	await assert.rejects(addRep('missing', { id: 'orphan', drawTime: 1000 }));
	assert.deepEqual((await getSessionWithReps('missing')).reps, []);
	const session = await createSession({});
	await assert.rejects(addRep(session.id, { drawTime: NaN }));
	await assert.rejects(addRep(session.id, { drawTime: -1 }));
	assert.equal((await getSessionWithReps(session.id)).session.repCount, 0);
});

test('pending session creation is shared, while reset isolates new writes and freezes rep metadata', async () => {
	const pending = [];
	const writes = [];
	const writer = createSessionWriter({
		createSession: () => new Promise((resolve) => pending.push(resolve)),
		addRep: async (sessionId, rep) => {
			writes.push({ sessionId, rep });
		}
	});
	const snapshot = { drillType: 'draw' };
	const rep = { round: 1 };
	const first = writer.save(rep, snapshot);
	const second = writer.save({ round: 2 }, snapshot);
	assert.equal(pending.length, 1);
	rep.round = 99;
	writer.reset();
	const third = writer.save({ round: 1 }, snapshot);
	assert.equal(pending.length, 2);
	pending[1]({ id: 'new' });
	pending[0]({ id: 'old' });
	await Promise.all([first, second, third]);
	assert.deepEqual(
		writes.filter((write) => write.sessionId === 'old').map((write) => write.rep.round),
		[1, 2]
	);
	assert.equal(writes.find((write) => write.sessionId === 'new').rep.round, 1);
});

test('changing drill configuration starts a new history entry', async () => {
	let count = 0;
	const writes = [];
	const writer = createSessionWriter({
		createSession: async () => ({ id: ++count }),
		addRep: async (id) => writes.push(id)
	});
	await writer.save({}, { drillType: 'draw' });
	await writer.save({}, { drillType: 'draw' });
	await writer.save({}, { drillType: 'reload' });
	assert.deepEqual(writes, [1, 1, 2]);
});

test('a failed session creation can be retried', async () => {
	let attempts = 0;
	const writer = createSessionWriter({
		createSession: async () => {
			if (++attempts === 1) throw new Error('Storage unavailable');
			return { id: 'recovered' };
		},
		addRep: async (id) => id
	});
	await assert.rejects(writer.save({}, {}));
	assert.equal(await writer.save({}, {}), 'recovered');
});
