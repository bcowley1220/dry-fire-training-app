import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

let DrillsPanel;
let CameraStage;
before(async () => {
	const output = new URL('../.svelte-kit/interface-tests/', import.meta.url);
	await mkdir(output, { recursive: true });
	for (const name of ['Icon', 'DrillsPanel', 'CameraStage']) {
		const filename = new URL(`../src/lib/components/${name}.svelte`, import.meta.url);
		const { js } = compile(await readFile(filename, 'utf8'), {
			filename: filename.pathname,
			generate: 'server'
		});
		const source = js.code
			.replace(/import \{ browser \} from ['"]\$app\/environment['"];?/, 'const browser = false;')
			.replaceAll('./Icon.svelte', './Icon.mjs')
			.replaceAll(
				'../utils/trainingView.js',
				new URL('../src/lib/utils/trainingView.js', import.meta.url).href
			);
		await writeFile(new URL(`${name}.mjs`, output), source);
	}
	DrillsPanel = (await import(new URL('DrillsPanel.mjs', output))).default;
	CameraStage = (await import(new URL('CameraStage.mjs', output))).default;
});

const baseConfig = {
	drillType: 'draw',
	randomDelayMin: 2000,
	randomDelayMax: 5000,
	beepVolume: 0.3,
	autoNextRound: false,
	roundCount: 10,
	resetDuration: 3000,
	malfunctionMode: false
};
function drill(props = {}) {
	return render(DrillsPanel, {
		props: {
			config: { ...baseConfig, ...props.config },
			session: { reps: [], startedAt: null },
			...props,
			ready: props.ready ?? true
		}
	}).body;
}
function button(html, label) {
	return html.match(
		new RegExp(
			`<button\\b[^>]*>(?:(?!<\\/button>)[\\s\\S])*?${label}(?:(?!<\\/button>)[\\s\\S])*?<\\/button>`
		)
	)?.[0];
}

test('start is disabled without setup, and call-out also requires a named target', () => {
	assert.match(button(drill({ ready: false }), 'Start drill'), /disabled/);
	assert.doesNotMatch(button(drill(), 'Start drill'), /disabled/);
	assert.match(
		button(
			drill({ config: { ...baseConfig, drillType: 'callout' }, targetCount: 0 }),
			'Start drill'
		),
		/disabled/
	);
	assert.doesNotMatch(
		button(
			drill({ config: { ...baseConfig, drillType: 'callout' }, targetCount: 1 }),
			'Start drill'
		),
		/disabled/
	);
});

test('waiting and reload screens expose stop, not setup or a premature next rep', () => {
	const waiting = drill({ active: true, phase: 'waiting', currentRound: 1 });
	assert.match(waiting, /Stand by/);
	assert.ok(button(waiting, 'Stop drill'));
	assert.equal(button(waiting, 'Next rep'), undefined);
	assert.equal(button(waiting, 'Start drill'), undefined);
	const reload = drill({
		active: true,
		phase: 'reloading',
		startTime: 1000,
		timerDisplayUpdate: 3500
	});
	assert.match(reload, /Reload and fire/);
	assert.match(reload, /2\.50 seconds/);
});

test('a completed reload shows total time and splits with an immediate next rep', () => {
	const html = drill({
		phase: 'complete',
		currentRound: 1,
		session: {
			reps: [
				{
					id: 'rep',
					drillType: 'reload',
					drawTime: 1000,
					reloadTime: 2000,
					totalTime: 3000,
					hits: [{ zone: 'A' }, { zone: 'C' }]
				}
			]
		}
	});
	assert.match(html, /3\.00 seconds/);
	assert.match(html, /Draw 1\.00s \/ Reload 2\.00s/);
	assert.ok(button(html, 'Next rep'));
	assert.ok(button(html, 'Review session'));
});

test('automatic countdown cannot be manually advanced, and the final rep offers repeat session', () => {
	const session = { reps: [{ id: 'rep', drawTime: 1500, hit: { zone: 'A', points: 5 } }] };
	const config = { ...baseConfig, autoNextRound: true, roundCount: 10 };
	const countdown = drill({
		config,
		session,
		phase: 'complete',
		currentRound: 2,
		autoNextCountdown: 1800
	});
	assert.match(countdown, /Next rep in/);
	assert.ok(button(countdown, 'Stop drill'));
	assert.equal(button(countdown, 'Next rep'), undefined);
	const final = drill({ config, session, phase: 'complete', currentRound: 10 });
	assert.match(final, /Session complete/);
	assert.ok(button(final, 'Repeat session'));
	assert.equal(button(final, 'Next rep'), undefined);
});

test('wrong-target results remain visible rather than appearing as successful hits', () => {
	const html = drill({
		phase: 'complete',
		session: {
			reps: [
				{
					id: 'rep',
					drillType: 'callout',
					drawTime: 1250,
					isFailure: true,
					calledTarget: 'Target 2',
					hit: { zone: 'A' }
				}
			]
		}
	});
	assert.match(html, /Wrong target\. Called Target 2\./);
});

test('frozen calibration gives the next corner, correction controls, and a clean camera surface', () => {
	const html = render(CameraStage, {
		props: {
			isStreaming: true,
			calibrationMode: true,
			hasFrozenCalibrationFrame: true,
			calibrationPoints: [
				{ x: 10, y: 10 },
				{ x: 30, y: 10 }
			]
		}
	}).body;
	assert.match(html, /Frozen frame/);
	assert.match(html, /Tap the bottom-right corner/);
	assert.ok(button(html, 'Retake'));
	assert.doesNotMatch(button(html, 'Undo'), /disabled/);
	assert.ok(button(html, 'Cancel'));
	assert.match(html, /Use arrow keys to move and Enter to select/);
});
