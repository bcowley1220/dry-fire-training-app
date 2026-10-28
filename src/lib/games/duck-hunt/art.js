import { pixelText, grayscaleCanvas } from '../high-noon/art.js';
export { grayscaleCanvas };
const previewLayers = new WeakMap();
const polygon = (ctx, points, color) => {
	ctx.fillStyle = color;
	ctx.beginPath();
	points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
	ctx.closePath();
	ctx.fill();
};
// Original 64 x 40 pixel silhouettes. Body ellipse stays consistent across flaps.
export function createDuckSheet() {
	const canvas = document.createElement('canvas');
	canvas.width = 64 * 7;
	canvas.height = 40;
	const c = canvas.getContext('2d');
	for (let frame = 0; frame < 7; frame++) {
		c.save();
		c.translate(frame * 64, 0);
		polygon(
			c,
			[
				[9, 24],
				[1, 15],
				[4, 29],
				[15, 32]
			],
			'#777777'
		);
		c.fillStyle = '#aaaaaa';
		c.beginPath();
		c.ellipse(31, 25, 18, 10, 0, 0, Math.PI * 2);
		c.fill();
		polygon(
			c,
			[
				[15, 28],
				[28, 32],
				[44, 28],
				[40, 34],
				[23, 35]
			],
			'#555555'
		);
		if (frame < 4) {
			const wings = [
				[
					[23, 25],
					[15, 2],
					[24, 1],
					[39, 24]
				],
				[
					[21, 25],
					[15, 12],
					[28, 7],
					[39, 25]
				],
				[
					[20, 24],
					[28, 25],
					[34, 35],
					[23, 37]
				],
				[
					[22, 23],
					[30, 25],
					[29, 39],
					[17, 34]
				]
			];
			polygon(c, wings[frame], '#dddddd');
			polygon(
				c,
				[
					[40, 22],
					[43, 10],
					[50, 8],
					[56, 13],
					[54, 23]
				],
				'#777777'
			);
			c.fillStyle = '#bbbbbb';
			c.fillRect(43, 18, 11, 3);
			c.fillStyle = '#dddddd';
			c.fillRect(54, 14, 9, 4);
			c.fillStyle = '#181818';
			c.fillRect(50, 11, 3, 3);
		} else {
			polygon(
				c,
				[
					[41, 24],
					[46, 16],
					[54, 18],
					[57, 24],
					[50, 29]
				],
				'#777777'
			);
			c.fillStyle = '#dddddd';
			c.fillRect(55, 21, 7, 3);
			c.fillStyle = '#181818';
			c.fillRect(50, 20, 3, 3);
			polygon(
				c,
				frame === 4
					? [
							[23, 24],
							[14, 9],
							[20, 4],
							[37, 23]
						]
					: [
							[23, 25],
							[13, 34],
							[19, 39],
							[35, 27]
						],
				'#bbbbbb'
			);
		}
		c.fillStyle = '#333333';
		c.fillRect(27, 34, 3, 4);
		c.fillRect(36, 34, 3, 4);
		c.restore();
	}
	return canvas;
}
export function drawDog(ctx, state) {
	const active = state.phase === 'RESOLVING',
		hit = state.lastResult?.hit,
		age = state.resolutionAge ?? 0;
	const bob = active ? Math.sin(age / 130) * 2 : Math.sin((state.sampledAt ?? 0) / 700);
	ctx.save();
	ctx.translate(
		105 + (active && hit ? Math.sin(Math.min(1, age / 1500) * Math.PI) * 65 : 0),
		606 + bob
	);
	if (active && !hit) ctx.rotate(Math.sin(age / 220) * 0.05);
	ctx.scale(3, 3);
	// A shaggy marsh companion with pale brow, long ears and a square muzzle.
	polygon(
		ctx,
		[
			[-18, 0],
			[-20, -9],
			[-14, -17],
			[6, -18],
			[17, -9],
			[19, 0]
		],
		'#555555'
	);
	ctx.fillStyle = '#777777';
	ctx.fillRect(-11, -19, 23, 18);
	ctx.fillRect(-8, -29, 18, 19);
	polygon(
		ctx,
		[
			[-10, -27],
			[-17, -23],
			[-16, -8],
			[-9, -10]
		],
		'#303030'
	);
	polygon(
		ctx,
		[
			[10, -27],
			[17, -24],
			[17, -8],
			[10, -10]
		],
		'#303030'
	);
	ctx.fillStyle = '#bbbbbb';
	ctx.fillRect(-6, -24, 5, 3);
	ctx.fillRect(5, -24, 5, 3);
	ctx.fillRect(-3, -16, 13, 7);
	ctx.fillStyle = '#181818';
	ctx.fillRect(-4, -22, 2, 3);
	ctx.fillRect(7, -22, 2, 3);
	ctx.fillRect(3, -17, 6, 3);
	ctx.fillStyle = '#999999';
	ctx.fillRect(-13, -3, 9, 4);
	ctx.fillRect(8, -3, 9, 4);
	polygon(
		ctx,
		[
			[16, -7],
			[23, -13 - Math.sin((state.sampledAt ?? 0) / 100) * 3],
			[25, -10],
			[18, -3]
		],
		'#777777'
	);
	if (active && hit) {
		ctx.fillStyle = '#aaaaaa';
		ctx.fillRect(-13, -10, 25, 5);
		ctx.fillStyle = '#555555';
		ctx.fillRect(8, -13, 9, 5);
	}
	ctx.restore();
}
export function drawEnvironment(ctx, state) {
	const t = state.sampledAt ?? 0;
	ctx.clearRect(0, 0, 1280, 720);
	ctx.fillStyle = '#777777';
	ctx.globalAlpha = 0.25;
	for (let i = 0; i < 13; i++)
		ctx.fillRect(((i * 113 + t * 0.008) % 1350) - 40, 560 + (i % 4) * 9, 18 + (i % 3) * 7, 2);
	ctx.globalAlpha = 1;
	drawDog(ctx, state);
	for (let i = 0; i < 38; i++) {
		const x = i * 37 + 7,
			y = 624 + (i % 3) * 5,
			sway = Math.sin(t / 1000 + i) * 5;
		polygon(
			ctx,
			[
				[x - 3, y],
				[x + sway - 6, y - 24 - (i % 5) * 7],
				[x + 2, y - 4],
				[x + 13 + sway, y - 31],
				[x + 5, y]
			],
			i % 2 ? '#303030' : '#181818'
		);
	}
}
export function drawHud(ctx, state) {
	ctx.clearRect(0, 0, 1280, 720);
	ctx.fillStyle = '#181818';
	ctx.fillRect(0, 0, 1280, 88);
	ctx.fillRect(0, 640, 1280, 80);
	ctx.strokeStyle = '#555555';
	ctx.lineWidth = 3;
	ctx.strokeRect(7, 7, 1266, 74);
	ctx.strokeRect(7, 648, 1266, 65);
	pixelText(ctx, 'DUCK HUNT', 25, 20, 4, '#bbbbbb');
	pixelText(ctx, 'MARSH ARCADE', 25, 55, 2, '#777777');
	pixelText(
		ctx,
		`${state.config.mode === 'choice' ? 'TWO DUCK CHOICE' : 'SINGLE DUCK'} / ${state.config.difficulty.toUpperCase()}`,
		430,
		22,
		2,
		'#999999'
	);
	pixelText(ctx, `ENCOUNTER ${state.round}/${state.config.rounds}`, 430, 51, 2, '#bbbbbb');
	pixelText(ctx, `SCORE ${state.score}`, 1060, 25, 3, '#bbbbbb', 'center');
	const labels = {
		IDLE: 'START ON LAPTOP',
		WAITING_FOR_READY: 'PRESS READY',
		LAUNCH_DELAY: 'WATCH THE SKY',
		FLYING: state.settling ? 'CHECKING SHOT' : 'ONE SHOT',
		RESOLVING: state.lastResult?.outcome ?? '',
		ROUND_RESULTS: 'RESET THEN READY',
		SESSION_COMPLETE: 'SESSION COMPLETE'
	};
	pixelText(
		ctx,
		state.paused ? 'PAUSED' : (labels[state.phase] ?? ''),
		640,
		665,
		3,
		'#bbbbbb',
		'center'
	);
	pixelText(
		ctx,
		`HITS ${state.hits}  MISSES ${state.misses}  ESCAPES ${state.escapes}`,
		25,
		675,
		2,
		'#999999'
	);
	pixelText(
		ctx,
		`${state.accuracy}%  +${state.lastResult?.points ?? 0}`,
		1220,
		675,
		2,
		'#999999',
		'right'
	);
}
export function paintPreview(ctx, state, background, sheet, debug = false) {
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = '#303030';
	ctx.fillRect(0, 0, 1280, 720);
	if (background) ctx.drawImage(background, 0, 0, 1280, 720);
	for (const duck of state.ducks) {
		if (!duck.visible) continue;
		ctx.save();
		ctx.translate(duck.x, duck.y);
		ctx.rotate(duck.rotation);
		ctx.scale(duck.direction * duck.scale, duck.scale);
		ctx.drawImage(sheet, duck.frame * 64, 0, 64, 40, -32, -20, 64, 40);
		ctx.restore();
	}
	// Shared painter also serves the Phaser foreground texture.
	let layer = previewLayers.get(ctx);
	if (!layer) {
		layer = document.createElement('canvas');
		layer.width = 1280;
		layer.height = 720;
		previewLayers.set(ctx, layer);
	}
	const c = layer.getContext('2d');
	drawEnvironment(c, state);
	ctx.drawImage(layer, 0, 0);
	drawHud(c, state);
	ctx.drawImage(layer, 0, 0);
	if (debug) {
		ctx.strokeStyle = '#eeeeee';
		ctx.lineWidth = 2;
		for (const box of state.hitboxes) {
			ctx.beginPath();
			ctx.ellipse(box.x, box.y, box.rx, box.ry, 0, 0, Math.PI * 2);
			ctx.stroke();
		}
		const g = state.lastResult?.geometry;
		for (const box of Array.isArray(g) ? g : g ? [g] : []) {
			ctx.setLineDash([4, 4]);
			ctx.strokeStyle = '#999999';
			ctx.beginPath();
			ctx.ellipse(box.x, box.y, box.rx, box.ry, 0, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.setLineDash([]);
	}
}
