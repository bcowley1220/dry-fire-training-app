import { WORLD } from '../coordinates.js';

// A small original bitmap alphabet, drawn as rectangles: no font downloads or
// platform-dependent smoothing in the projected HUD.
const GLYPHS = {
	A: '01110/10001/10001/11111/10001/10001/10001',
	B: '11110/10001/10001/11110/10001/10001/11110',
	C: '01111/10000/10000/10000/10000/10000/01111',
	D: '11110/10001/10001/10001/10001/10001/11110',
	E: '11111/10000/10000/11110/10000/10000/11111',
	F: '11111/10000/10000/11110/10000/10000/10000',
	G: '01111/10000/10000/10111/10001/10001/01111',
	H: '10001/10001/10001/11111/10001/10001/10001',
	I: '111/010/010/010/010/010/111',
	J: '00111/00010/00010/00010/10010/10010/01100',
	K: '10001/10010/10100/11000/10100/10010/10001',
	L: '10000/10000/10000/10000/10000/10000/11111',
	M: '10001/11011/10101/10101/10001/10001/10001',
	N: '10001/11001/11001/10101/10011/10011/10001',
	O: '01110/10001/10001/10001/10001/10001/01110',
	P: '11110/10001/10001/11110/10000/10000/10000',
	Q: '01110/10001/10001/10001/10101/10010/01101',
	R: '11110/10001/10001/11110/10100/10010/10001',
	S: '01111/10000/10000/01110/00001/00001/11110',
	T: '11111/00100/00100/00100/00100/00100/00100',
	U: '10001/10001/10001/10001/10001/10001/01110',
	V: '10001/10001/10001/10001/10001/01010/00100',
	W: '10001/10001/10001/10101/10101/10101/01010',
	X: '10001/10001/01010/00100/01010/10001/10001',
	Y: '10001/10001/01010/00100/00100/00100/00100',
	Z: '11111/00001/00010/00100/01000/10000/11111',
	0: '01110/10001/10011/10101/11001/10001/01110',
	1: '010/110/010/010/010/010/111',
	2: '01110/10001/00001/00010/00100/01000/11111',
	3: '11110/00001/00001/01110/00001/00001/11110',
	4: '00010/00110/01010/10010/11111/00010/00010',
	5: '11111/10000/10000/11110/00001/00001/11110',
	6: '01110/10000/10000/11110/10001/10001/01110',
	7: '11111/00001/00010/00100/01000/01000/01000',
	8: '01110/10001/10001/01110/10001/10001/01110',
	9: '01110/10001/10001/01111/00001/00001/01110',
	'-': '00000/00000/00000/11111/00000/00000/00000',
	'!': '1/1/1/1/1/0/1',
	'.': '0/0/0/0/0/0/1',
	':': '0/1/1/0/1/1/0',
	'/': '00001/00001/00010/00100/01000/10000/10000',
	'+': '00000/00100/00100/11111/00100/00100/00000'
};
function textWidth(text, size) {
	return [...text].reduce(
		(n, c) => n + (c === ' ' ? 4 : (GLYPHS[c]?.split('/')[0].length ?? 5) + 1) * size,
		0
	);
}
export function pixelText(ctx, text, x, y, size = 2, color = '#ddd', align = 'left') {
	text = String(text).toUpperCase();
	if (align === 'center') x -= textWidth(text, size) / 2;
	if (align === 'right') x -= textWidth(text, size);
	ctx.fillStyle = color;
	for (const c of text) {
		const rows = GLYPHS[c]?.split('/');
		if (rows) {
			rows.forEach((row, j) =>
				[...row].forEach((bit, i) => {
					if (bit === '1')
						ctx.fillRect(
							Math.round(x + i * size),
							Math.round(y + j * size),
							Math.ceil(size),
							Math.ceil(size)
						);
				})
			);
			x += (rows[0].length + 1) * size;
		} else x += 4 * size;
	}
}
function panel(ctx, x, y, w, h) {
	ctx.fillStyle = '#171717';
	ctx.fillRect(x, y, w, h);
	ctx.strokeStyle = '#626262';
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
	ctx.strokeStyle = '#343434';
	ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
	for (const [px, py] of [
		[x + 3, y + 3],
		[x + w - 9, y + 3],
		[x + 3, y + h - 9],
		[x + w - 9, y + h - 9]
	]) {
		ctx.fillStyle = '#aaa';
		ctx.fillRect(px, py, 5, 5);
		ctx.fillStyle = '#333';
		ctx.fillRect(px + 2, py + 2, 2, 2);
	}
}
export function phaseLabel(state) {
	if (state.paused) return 'PAUSED';
	if (state.phase === 'IDLE') return 'HIGH NOON';
	if (state.phase === 'WAITING_FOR_READY') return 'READY WHEN YOU ARE';
	if (state.phase === 'READY_DELAY') return 'GET READY...';
	if (state.phase === 'DRAWING') return 'DRAW!';
	if (state.phase === 'SESSION_COMPLETE') return 'SESSION COMPLETE';
	return state.lastResult?.win
		? 'YOU WIN!'
		: state.lastResult?.outcome === 'FALSE_START'
			? 'FALSE START'
			: state.lastResult?.outcome === 'PLAYER_MISSED'
				? 'MISSED'
				: 'OUTDRAWN';
}
export function drawHud(ctx, state) {
	ctx.clearRect(0, 0, WORLD.width, WORLD.height);
	panel(ctx, 4, 4, 1272, 82);
	panel(ctx, 4, 620, 1272, 96);
	pixelText(ctx, 'HIGH NOON', 28, 19, 5, '#e2e2e2');
	pixelText(ctx, 'QUICK DRAW TRAINING', 30, 62, 1.6, '#aaa');
	panel(ctx, 385, 14, 392, 58);
	const label = phaseLabel(state);
	pixelText(
		ctx,
		label,
		581,
		34,
		label.length > 16 ? 2 : label === 'DRAW!' ? 4 : 2.8,
		'#eee',
		'center'
	);
	for (const [x, label, value] of [
		[822, 'ROUND', `${state.round || 1}/${state.config.rounds}`],
		[980, 'DRAW TIME', `${state.config.drawTime.toFixed(1)}S`],
		[
			1142,
			'YOUR BEST',
			state.bestReaction === null ? '-.--S' : `${(state.bestReaction / 1000).toFixed(2)}S`
		]
	]) {
		pixelText(ctx, label, x, 23, 1.6, '#aaa');
		pixelText(ctx, value, x, 47, 2.6, '#ddd');
	}
	const result = state.lastResult;
	const reaction =
		result?.reactionTime === null || !result
			? '-.--S'
			: `${(result.reactionTime / 1000).toFixed(2)}S`;
	pixelText(ctx, 'REACTION', 28, 639, 1.6, '#999');
	pixelText(ctx, reaction, 28, 666, 3, '#ddd');
	pixelText(ctx, 'HIT REGION', 230, 639, 1.6, '#999');
	pixelText(ctx, result?.region || '--', 230, 666, 2.6, '#ddd');
	const prompt =
		state.phase === 'READY_DELAY'
			? 'WAIT FOR THE SIGNAL'
			: state.phase === 'DRAWING'
				? 'ONE SHOT. MAKE IT COUNT.'
				: state.phase === 'SESSION_COMPLETE'
					? 'SESSION COMPLETE'
					: state.phase === 'ROUND_RESULTS'
						? 'RESET YOUR TRAINER'
						: 'CONFIRM READY ON LAPTOP';
	const liveCue = !state.paused && ['READY_DELAY', 'DRAWING'].includes(state.phase);
	pixelText(
		ctx,
		liveCue
			? state.phase === 'DRAWING'
				? 'DRAW!'
				: 'GET READY'
			: state.paused
				? 'PAUSED'
				: prompt,
		730,
		liveCue ? 637 : 644,
		liveCue ? (state.phase === 'DRAWING' ? 6 : 4) : prompt.length > 20 ? 1.9 : 2.3,
		'#ddd',
		'center'
	);
	pixelText(
		ctx,
		state.phase === 'DRAWING' && !state.paused
			? 'ONE SHOT. MAKE IT COUNT.'
			: state.phase === 'ROUND_RESULTS'
				? 'THEN CONFIRM READY ON LAPTOP'
				: 'TIMING INCLUDES CAMERA AND LOCAL DELIVERY',
		730,
		liveCue ? 694 : 680,
		1.3,
		'#888',
		'center'
	);
	pixelText(ctx, 'SCORE', 1120, 639, 1.6, '#999');
	pixelText(ctx, state.score, 1120, 666, 3.7, '#eee');
	if (state.results.some((result) => result.source === 'simulated'))
		pixelText(ctx, 'SIMULATED SESSION', 1260, 97, 1.3, '#ddd', 'right');
}
export function grayscalePixels(pixels) {
	for (let i = 0; i < pixels.length; i += 4) {
		const gray = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
		pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
	}
	return pixels;
}
export function grayscaleCanvas(image, makeCanvas = () => document.createElement('canvas')) {
	const canvas = makeCanvas();
	canvas.width = image.width;
	canvas.height = image.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(image, 0, 0);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
	grayscalePixels(data.data);
	ctx.putImageData(data, 0, 0);
	return canvas;
}
function polygon(ctx, color, points) {
	ctx.fillStyle = color;
	ctx.beginPath();
	points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
	ctx.closePath();
	ctx.fill();
}
export function createCowboySheet(makeCanvas = () => document.createElement('canvas')) {
	const sheet = makeCanvas();
	sheet.width = 96 * 8;
	sheet.height = 176;
	const ctx = sheet.getContext('2d');
	for (let frame = 0; frame < 8; frame++) {
		ctx.save();
		ctx.translate(frame * 96, 0);
		const dx = frame === 6 ? -3 : frame === 7 ? 2 : 0,
			dy = frame === 1 ? -1 : frame === 2 || frame === 3 || frame === 7 ? 1 : frame === 6 ? -2 : 0;
		// Legs and boots stay planted while the upper body shifts.
		polygon(ctx, '#111', [
			[27, 113],
			[69, 113],
			[73, 139],
			[83, 167],
			[63, 170],
			[50, 137],
			[44, 137],
			[32, 169],
			[12, 170],
			[21, 144]
		]);
		polygon(ctx, '#444', [
			[30, 116],
			[45, 119],
			[40, 139],
			[28, 163],
			[19, 164],
			[26, 141]
		]);
		polygon(ctx, '#333', [
			[52, 120],
			[65, 119],
			[68, 140],
			[76, 164],
			[66, 164],
			[56, 141]
		]);
		ctx.fillStyle = '#666';
		ctx.fillRect(28, 124, 3, 18);
		ctx.fillRect(58, 129, 3, 15);
		ctx.fillStyle = '#202020';
		ctx.fillRect(12, 164, 20, 9);
		ctx.fillRect(63, 164, 20, 9);
		ctx.fillStyle = '#777';
		ctx.fillRect(13, 171, 20, 2);
		ctx.fillRect(63, 171, 21, 2);
		ctx.translate(dx, dy);
		// Coat silhouette, shirt and two lapels.
		polygon(ctx, '#101010', [
			[34, 45],
			[61, 45],
			[73, 54],
			[77, 87],
			[72, 115],
			[66, 129],
			[52, 123],
			[47, 107],
			[41, 124],
			[23, 129],
			[22, 94],
			[25, 62]
		]);
		polygon(ctx, '#555', [
			[34, 48],
			[45, 49],
			[39, 90],
			[33, 119],
			[26, 121],
			[29, 64]
		]);
		polygon(ctx, '#3c3c3c', [
			[55, 48],
			[64, 51],
			[69, 69],
			[68, 119],
			[57, 119],
			[53, 87]
		]);
		polygon(ctx, '#a5a5a5', [
			[40, 49],
			[54, 48],
			[57, 76],
			[53, 97],
			[39, 97],
			[36, 74]
		]);
		polygon(ctx, '#d0d0d0', [
			[41, 50],
			[49, 54],
			[44, 65],
			[39, 60]
		]);
		polygon(ctx, '#222', [
			[34, 49],
			[42, 51],
			[36, 68],
			[39, 77],
			[31, 96],
			[31, 62]
		]);
		polygon(ctx, '#1c1c1c', [
			[55, 49],
			[61, 54],
			[59, 68],
			[55, 76],
			[60, 94],
			[50, 63]
		]);
		ctx.fillStyle = '#777';
		ctx.fillRect(46, 66, 2, 27);
		ctx.fillStyle = '#444';
		for (let y = 70; y < 93; y += 8) ctx.fillRect(48, y, 2, 2);
		// Bandana and face with a deep hat shadow.
		polygon(ctx, '#353535', [
			[36, 43],
			[56, 43],
			[54, 55],
			[46, 61],
			[37, 53]
		]);
		ctx.fillStyle = '#151515';
		ctx.fillRect(35, 27, 25, 22);
		ctx.fillStyle = '#aaa';
		ctx.fillRect(39, 30, 16, 17);
		ctx.fillStyle = '#ddd';
		ctx.fillRect(43, 35, 4, 8);
		ctx.fillStyle = '#555';
		ctx.fillRect(37, 32, 4, 10);
		ctx.fillRect(53, 32, 4, 13);
		ctx.fillStyle = '#202020';
		ctx.fillRect(41, 33, 5, 2);
		ctx.fillRect(50, 33, 4, 2);
		ctx.fillRect(42, 43, 12, 4);
		ctx.fillRect(40, 40, 3, 5);
		ctx.fillRect(54, 39, 3, 6);
		ctx.fillStyle = '#ddd';
		ctx.fillRect(46, 43, 5, 1);
		// Hat crown, band and stepped brim.
		polygon(ctx, '#111', [
			[30, 13],
			[34, 5],
			[56, 5],
			[63, 12],
			[62, 24],
			[72, 23],
			[73, 28],
			[61, 34],
			[30, 34],
			[22, 29],
			[22, 25],
			[31, 26]
		]);
		polygon(ctx, '#4c4c4c', [
			[35, 9],
			[55, 8],
			[59, 14],
			[58, 23],
			[33, 23]
		]);
		ctx.fillStyle = '#777';
		ctx.fillRect(36, 9, 16, 3);
		ctx.fillStyle = '#222';
		ctx.fillRect(32, 21, 29, 5);
		ctx.fillStyle = '#777';
		ctx.fillRect(24, 28, 46, 2);
		// Arms: holster reach, rising forearm, and the final aimed silhouette.
		polygon(ctx, '#171717', [
			[27, 55],
			[33, 61],
			[25, 87],
			[21, 102],
			[13, 99],
			[15, 78],
			[21, 59]
		]);
		ctx.fillStyle = '#656565';
		ctx.fillRect(19, 76, 4, 16);
		ctx.fillStyle = '#aaa';
		ctx.fillRect(13, 99, 8, 12);
		ctx.fillStyle = '#333';
		ctx.fillRect(12, 107, 3, 7);
		if (frame <= 3 || frame === 7) {
			polygon(ctx, '#181818', [
				[64, 52],
				[73, 59],
				[81, 89],
				[78, 104],
				[70, 104],
				[68, 83],
				[61, 66]
			]);
			ctx.fillStyle = '#666';
			ctx.fillRect(72, 72, 3, 18);
			ctx.fillStyle = '#aaa';
			ctx.fillRect(frame === 3 ? 67 : 71, frame === 3 ? 99 : 103, 8, 10);
		} else {
			polygon(ctx, '#191919', [
				[64, 53],
				[74, 57],
				[79, 74],
				[71, 86],
				[59, 80],
				[58, 69]
			]);
			ctx.fillStyle = '#666';
			ctx.fillRect(68, 62, 6, 13);
			ctx.fillStyle = '#aaa';
			ctx.fillRect(60, frame === 4 ? 76 : 66, 11, 8);
			ctx.fillStyle = '#111';
			ctx.fillRect(60, frame === 4 ? 72 : 60, 12, 10);
			ctx.fillStyle = '#999';
			ctx.fillRect(63, frame === 4 ? 70 : 59, 6, 4);
			ctx.fillStyle = '#111';
			ctx.fillRect(65, frame === 4 ? 71 : 60, 2, 2);
		}
		// Belt, buckle and holster are distinct from the scoring regions.
		ctx.fillStyle = '#161616';
		ctx.fillRect(28, 99, 42, 8);
		ctx.fillStyle = '#aaa';
		ctx.fillRect(43, 100, 11, 7);
		ctx.fillStyle = '#444';
		ctx.fillRect(46, 102, 5, 3);
		ctx.fillStyle = '#222';
		ctx.fillRect(67, 107, 7, 17);
		ctx.fillStyle = '#555';
		ctx.fillRect(68, 110, 2, 10);
		// Sparse pixel highlights give the coat a worn, consistent 16-bit texture.
		ctx.fillStyle = '#777';
		for (const [x, y] of [
			[29, 60],
			[27, 73],
			[32, 107],
			[62, 60],
			[65, 91],
			[59, 113]
		])
			ctx.fillRect(x, y, 2, 3);
		ctx.restore();
	}
	return sheet;
}
export function drawForeground(ctx) {
	ctx.fillStyle = '#292929';
	polygon(ctx, '#292929', [
		[450, 604],
		[475, 600],
		[490, 604],
		[483, 607],
		[445, 608]
	]);
	polygon(ctx, '#454545', [
		[872, 586],
		[885, 581],
		[892, 585],
		[889, 589]
	]);
	ctx.fillStyle = '#6c6c6c';
	ctx.fillRect(461, 601, 12, 2);
	ctx.fillRect(879, 582, 6, 2);
}
export function drawMuzzleFlash(ctx, flash) {
	if (!flash) return;
	ctx.save();
	ctx.translate(flash.x, flash.y);
	ctx.scale(flash.scale, flash.scale);
	ctx.globalAlpha = flash.alpha;
	polygon(ctx, '#aaa', [
		[-18, -3],
		[-7, -5],
		[-10, -12],
		[-4, -8],
		[-2, -18],
		[3, -8],
		[12, -12],
		[8, -4],
		[18, -1],
		[8, 3],
		[12, 11],
		[4, 8],
		[1, 18],
		[-3, 8],
		[-12, 12],
		[-8, 4],
		[-18, 3]
	]);
	ctx.fillStyle = '#eee';
	ctx.fillRect(-5, -7, 10, 14);
	ctx.fillRect(-8, -3, 16, 6);
	ctx.fillStyle = '#fff';
	ctx.fillRect(-3, -3, 6, 6);
	ctx.restore();
}
const previewHuds = new WeakMap();
export function paintPreview(ctx, report, background, sheet, debug = false) {
	ctx.clearRect(0, 0, 1280, 720);
	ctx.imageSmoothingEnabled = false;
	if (background) {
		const scale = Math.max(1280 / background.width, 720 / background.height);
		ctx.drawImage(
			background,
			(1280 - background.width * scale) / 2,
			(720 - background.height * scale) / 2,
			background.width * scale,
			background.height * scale
		);
	} else {
		ctx.fillStyle = '#333';
		ctx.fillRect(0, 0, 1280, 720);
	}
	const p = report.pose;
	ctx.fillStyle = '#262626';
	ctx.beginPath();
	ctx.ellipse(p.x, p.y, 100, 10, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.drawImage(
		sheet,
		p.frame * 96,
		0,
		96,
		176,
		p.x - 48 * p.scale,
		p.y - 176 * p.scale,
		96 * p.scale,
		176 * p.scale
	);
	drawForeground(ctx);
	drawMuzzleFlash(ctx, report.muzzleFlash);
	let hud = previewHuds.get(ctx);
	if (!hud) {
		hud = document.createElement('canvas');
		hud.width = 1280;
		hud.height = 720;
		previewHuds.set(ctx, hud);
	}
	drawHud(hud.getContext('2d'), report);
	ctx.drawImage(hud, 0, 0);
	if (debug)
		for (const b of report.hitboxes || []) {
			ctx.strokeStyle = b.region === 'torso' ? '#66d9ff' : '#ffc96b';
			ctx.lineWidth = 2;
			ctx.strokeRect(b.x, b.y, b.width, b.height);
			ctx.font = '16px sans-serif';
			ctx.fillStyle = ctx.strokeStyle;
			ctx.fillText(b.region, b.x, b.y - 5);
		}
}

// Normalize each generated cell to a common boot baseline. Preserve aspect and
// alpha, use nearest-neighbor sampling, and enforce neutral pixels at load time.
export function prepareCowboySheet(image, makeCanvas = () => document.createElement('canvas')) {
	const source = grayscaleCanvas(image, makeCanvas),
		sourceContext = source.getContext('2d', { willReadFrequently: true });
	const sheet = makeCanvas();
	sheet.width = 96 * 8;
	sheet.height = 176;
	const context = sheet.getContext('2d');
	context.imageSmoothingEnabled = false;
	for (let frame = 0; frame < 8; frame++) {
		const left = Math.round(((frame % 4) * source.width) / 4),
			right = Math.round((((frame % 4) + 1) * source.width) / 4),
			top = Math.round((Math.floor(frame / 4) * source.height) / 2),
			bottom = Math.round(((Math.floor(frame / 4) + 1) * source.height) / 2);
		const w = right - left,
			h = bottom - top,
			data = sourceContext.getImageData(left, top, w, h).data;
		let minX = w,
			minY = h,
			maxX = -1,
			maxY = -1;
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++)
				if (data[(y * w + x) * 4 + 3] > 64) {
					minX = Math.min(minX, x);
					maxX = Math.max(maxX, x);
					minY = Math.min(minY, y);
					maxY = Math.max(maxY, y);
				}
		if (maxX < minX) continue;
		const cropW = maxX - minX + 1,
			cropH = maxY - minY + 1,
			scale = Math.min(90 / cropW, 170 / cropH),
			destW = cropW * scale,
			destH = cropH * scale;
		context.drawImage(
			source,
			left + minX,
			top + minY,
			cropW,
			cropH,
			frame * 96 + (96 - destW) / 2,
			176 - destH,
			destW,
			destH
		);
	}
	return sheet;
}
