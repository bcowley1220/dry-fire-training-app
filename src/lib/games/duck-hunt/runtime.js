// This module is imported only by GameHost.onMount, never during SSR.
import Phaser from 'phaser';
import { asset } from '$app/paths';
import { createDuckHunt } from './model.js';
import { createDuckSheet, grayscaleCanvas, drawHud, drawEnvironment } from './art.js';
import { WORLD, projectorToWorld, validShot } from '../coordinates.js';

export function createDuckHuntRuntime({ parent, onReport, onError = () => {} }) {
	const model = createDuckHunt();
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
			activity: 'duck-hunt',
			canvas: canvasGeometry(),
			viewport: { width: innerWidth, height: innerHeight },
			world: WORLD,
			lastMapping,
			lastEvent
		});
	}
	class DuckHuntScene extends Phaser.Scene {
		constructor() {
			super('duck-hunt');
		}
		preload() {
			this.load.image('marsh-source', asset('/duck-hunt/marsh.png'));
		}
		create() {
			scene = this;
			if (this.textures.exists('marsh-source')) {
				this.textures.addCanvas(
					'marsh-gray',
					grayscaleCanvas(this.textures.get('marsh-source').getSourceImage())
				);
				this.add.image(0, 0, 'marsh-gray').setOrigin(0).setDisplaySize(1280, 720);
			} else {
				this.add.rectangle(640, 360, 1280, 720, 0x303030);
				onError('Marsh artwork unavailable. Reload the display.');
			}
			this.textures.addSpriteSheet('ducks', createDuckSheet(), { frameWidth: 64, frameHeight: 40 });
			this.ducks = [this.add.sprite(0, 0, 'ducks'), this.add.sprite(0, 0, 'ducks')];
			this.foreground = this.textures.createCanvas('marsh-foreground', 1280, 720);
			this.add.image(0, 0, 'marsh-foreground').setOrigin(0);
			this.hudTexture = this.textures.createCanvas('duck-hud', 1280, 720);
			this.add.image(0, 0, 'duck-hud').setOrigin(0);
			this.render(clock());
			report();
			resolveReady();
		}
		render(now) {
			const state = model.snapshot(now);
			this.ducks.forEach((sprite, i) => {
				const duck = state.ducks[i];
				sprite.setVisible(!!duck?.visible);
				if (duck)
					sprite
						.setPosition(duck.x, duck.y)
						.setScale(duck.scale)
						.setFlipX(duck.direction < 0)
						.setFrame(duck.frame)
						.setRotation(duck.rotation);
			});
			drawEnvironment(this.foreground.context, state);
			this.foreground.refresh();
			const key = JSON.stringify([
				state.phase,
				state.paused,
				state.round,
				state.score,
				state.hits,
				state.misses,
				state.escapes,
				state.settling,
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
					scene: DuckHuntScene
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
				receivedAt: now,
				receivedEpoch: performance.timeOrigin + now
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
					if (command.config) runtime.updateConfiguration(command.config);
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
