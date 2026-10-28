// This module is imported only by GameHost.onMount, never during SSR.
import Phaser from 'phaser';
import { asset } from '$app/paths';
import { createHighNoon, worldHitboxes } from './model.js';
import {
	createCowboySheet,
	prepareCowboySheet,
	grayscaleCanvas,
	drawHud,
	drawForeground,
	drawMuzzleFlash
} from './art.js';
import { WORLD, projectorToWorld, validShot } from '../coordinates.js';

export function createHighNoonRuntime({ parent, onReport, onError = () => {} }) {
	const model = createHighNoon();
	const gameId = crypto.randomUUID();
	const clock = () => performance.now();
	let game,
		scene,
		disposed = false,
		lastReport = -Infinity,
		lastMapping = null,
		lastEvent = null;
	const received = new Set();
	const commands = new Set();
	let resolveReady;
	const ready = new Promise((resolve) => (resolveReady = resolve));
	function canvasGeometry() {
		const r = game.canvas.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	}
	function report(now = clock()) {
		if (!scene || disposed) return;
		const snapshot = model.snapshot(now);
		onReport({
			...snapshot,
			gameId,
			hitboxes: worldHitboxes(snapshot.pose),
			canvas: canvasGeometry(),
			viewport: { width: innerWidth, height: innerHeight },
			world: WORLD,
			lastMapping,
			lastEvent
		});
	}
	class HighNoonScene extends Phaser.Scene {
		constructor() {
			super('high-noon');
		}
		preload() {
			this.load.image('street-source', asset('/high-noon/street.png'));
			this.load.image('cowboy-source', asset('/high-noon/cowboy-sheet.png'));
		}
		create() {
			scene = this;
			if (this.textures.exists('street-source')) {
				this.textures.addCanvas(
					'street-gray',
					grayscaleCanvas(this.textures.get('street-source').getSourceImage())
				);
				const image = this.textures.get('street-gray').getSourceImage();
				this.add
					.image(640, 360, 'street-gray')
					.setScale(Math.max(1280 / image.width, 720 / image.height));
			} else {
				this.add.rectangle(640, 360, 1280, 720, 0x333333);
				onError('Street artwork did not load. Reload the display.');
			}
			this.add.ellipse(640, 606, 200, 20, 0x222222, 0.8);
			const sheet = this.textures.exists('cowboy-source')
				? prepareCowboySheet(this.textures.get('cowboy-source').getSourceImage())
				: createCowboySheet();
			this.textures.addSpriteSheet('cowboy', sheet, {
				frameWidth: 96,
				frameHeight: 176
			});
			this.cowboy = this.add.sprite(640, 606, 'cowboy', 0).setOrigin(0.5, 1).setScale(2.6);
			const foreground = this.textures.createCanvas('foreground', 1280, 720);
			drawForeground(foreground.context);
			foreground.refresh();
			this.add.image(0, 0, 'foreground').setOrigin(0);
			const flashTexture = this.textures.createCanvas('muzzle-flash', 64, 64);
			drawMuzzleFlash(flashTexture.context, { x: 32, y: 32, scale: 1, alpha: 1 });
			flashTexture.refresh();
			this.flash = this.add.image(0, 0, 'muzzle-flash').setVisible(false);
			this.hudTexture = this.textures.createCanvas('hud', 1280, 720);
			this.add.image(0, 0, 'hud').setOrigin(0);
			this.render(clock());
			report();
			resolveReady();
		}
		render(now) {
			const state = model.snapshot(now),
				pose = state.pose;
			this.cowboy.setPosition(pose.x, pose.y).setScale(pose.scale).setFrame(pose.frame);
			const flash = state.muzzleFlash;
			this.flash.setVisible(!!flash);
			if (flash)
				this.flash.setPosition(flash.x, flash.y).setScale(flash.scale).setAlpha(flash.alpha);
			const key = JSON.stringify([
				state.phase,
				state.paused,
				state.round,
				state.score,
				state.bestReaction,
				state.lastResult,
				state.config
			]);
			if (this.hudKey !== key) {
				this.hudKey = key;
				drawHud(this.hudTexture.context, state);
				this.hudTexture.refresh();
			}
		}
		update() {
			const now = clock();
			model.tick(now);
			this.render(now);
			if (now - lastReport >= 100) {
				lastReport = now;
				report(now);
			}
		}
	}
	const runtime = {
		initialize() {
			if (disposed) return Promise.resolve();
			if (!game)
				game = new Phaser.Game({
					type: Phaser.CANVAS,
					parent,
					width: WORLD.width,
					height: WORLD.height,
					backgroundColor: '#080808',
					pixelArt: true,
					antialias: false,
					roundPixels: true,
					transparent: false,
					banner: false,
					audio: { noAudio: true },
					scale: {
						mode: Phaser.Scale.FIT,
						autoCenter: Phaser.Scale.CENTER_BOTH,
						width: WORLD.width,
						height: WORLD.height
					},
					scene: HighNoonScene
				});
			return ready;
		},
		start() {
			model.start();
			report();
		},
		pause() {
			model.pause();
			report();
		},
		resume() {
			model.resume();
			report();
		},
		reset() {
			model.reset();
			lastMapping = null;
			lastEvent = null;
			received.clear();
			report();
		},
		handleShot(event) {
			if (!scene || disposed || !validShot(event) || received.has(event.id)) return;
			received.add(event.id);
			if (received.size > 1000) received.delete(received.values().next().value);
			const point = projectorToWorld(
				event,
				{ width: innerWidth, height: innerHeight },
				canvasGeometry()
			);
			const now = clock();
			lastEvent = event;
			lastMapping = {
				normalized: { x: event.x, y: event.y },
				world: point,
				accepted: model.handleShot(event, point, now),
				receivedAt: now
			};
			scene.render(now);
			report(now);
		},
		updateConfiguration(config) {
			const changed = model.updateConfiguration(config);
			if (changed) report();
			return changed;
		},
		dispatch(command) {
			if (
				!scene ||
				disposed ||
				!command ||
				typeof command.id !== 'string' ||
				command.gameId !== gameId
			)
				return;
			const key = `command-${command.id}`;
			if (commands.has(key)) return;
			commands.add(key);
			if (commands.size > 128) commands.delete(commands.values().next().value);
			switch (command.action) {
				case 'start':
					if (command.config) runtime.updateConfiguration(command.config);
					runtime.start();
					break;
				case 'ready':
					model.confirmReady();
					report();
					break;
				case 'pause':
					runtime.pause();
					break;
				case 'resume':
					runtime.resume();
					break;
				case 'restart':
					runtime.reset();
					if (command.config) runtime.updateConfiguration(command.config);
					break;
				case 'configure':
					runtime.updateConfiguration(command.config);
					break;
				case 'shot':
					runtime.handleShot(command.shot);
					break;
			}
		},
		destroy() {
			if (disposed) return;
			disposed = true;
			model.destroy();
			game?.destroy(true);
			scene = null;
			resolveReady();
		}
	};
	return runtime;
}
