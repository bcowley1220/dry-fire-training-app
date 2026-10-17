import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	repTime,
	formatTime,
	sessionSummary,
	trainingStatus
} from '../src/lib/utils/trainingView.js';

test('review uses reload totals and preserves failed call-out results', () => {
	const reps = [
		{ drillType: 'draw', drawTime: 1000 },
		{ drillType: 'reload', drawTime: 800, reloadTime: 2200, totalTime: 3000 },
		{ drillType: 'callout', drawTime: 2000, isFailure: true }
	];
	assert.equal(repTime(reps[1]), 3000);
	assert.deepEqual(sessionSummary(reps), { count: 3, best: 1000, average: 2000, failures: 1 });
	assert.equal(formatTime(repTime(reps[1])), '3.00');
	assert.equal(formatTime(null), '—');
	assert.deepEqual(sessionSummary([]), { count: 0, best: null, average: null, failures: 0 });
});

test('training feedback distinguishes reload, call-out, malfunction, and automatic transitions', () => {
	const state = {
		phase: 'idle',
		waitingForClear: false,
		callOutTarget: null,
		autoNextCountdown: null,
		sessionFinished: false
	};
	assert.equal(trainingStatus(state), 'Ready when you are');
	assert.equal(trainingStatus({ ...state, phase: 'waiting' }), 'Stand by');
	assert.equal(trainingStatus({ ...state, phase: 'reloading' }), 'Reload and fire');
	assert.equal(
		trainingStatus({ ...state, phase: 'active', callOutTarget: 'Target 2' }),
		'Target 2'
	);
	assert.equal(
		trainingStatus({ ...state, phase: 'active', waitingForClear: true }),
		'Clear the malfunction'
	);
	assert.equal(
		trainingStatus({ ...state, phase: 'complete', autoNextCountdown: 2000 }),
		'Next rep in'
	);
	assert.equal(trainingStatus({ ...state, phase: 'complete' }), 'Rep complete');
	assert.equal(
		trainingStatus({ ...state, phase: 'complete', sessionFinished: true }),
		'Session complete'
	);
});
