<script>
	import { createEventDispatcher } from 'svelte';

	// Props
	export let mobile = false;
	export let active = false;
	export let phase = 'idle'; // 'idle' | 'waiting' | 'active' | 'complete'
	export let config = {
		mode: 'draw',
		randomDelayMin: 2000,
		randomDelayMax: 5000,
		beepVolume: 0.3,
		beepFrequency: 1000,
		autoNextRound: false,
		roundCount: 10,
		resetDuration: 3000
	};
	export let session = { reps: [], startedAt: null };
	export let currentRound = 0;
	export let autoNextCountdown = null;
	export let startTime = null;
	export let timerDisplayUpdate = 0; // Trigger for reactivity

	const dispatch = createEventDispatcher();

	// Local state
	let showStats = false;

	// Helpers
	function formatTime(ms) {
		return (ms / 1000).toFixed(2);
	}

	function getCurrentElapsed() {
		if (!startTime) return 0;
		// Use the trigger prop to ensure reactivity
		const _ = timerDisplayUpdate;
		return performance.now() - startTime;
	}

	function calculateAverage() {
		const reps = session.reps;
		if (reps.length === 0) return 0;
		const sum = reps.reduce((acc, rep) => acc + rep.drawTime, 0);
		return sum / reps.length;
	}

	function calculateBest() {
		const reps = session.reps;
		if (reps.length === 0) return 0;
		return Math.min(...reps.map((rep) => rep.drawTime));
	}

	function calculateWorst() {
		const reps = session.reps;
		if (reps.length === 0) return 0;
		return Math.max(...reps.map((rep) => rep.drawTime));
	}

	function calculateAccuracyByZone() {
		const reps = session.reps;
		const zoneCounts = {};

		reps.forEach((rep) => {
			const zone = rep.hit.zone;
			if (!zoneCounts[zone]) {
				zoneCounts[zone] = {
					name: zone,
					color: rep.hit.zoneColor,
					count: 0
				};
			}
			zoneCounts[zone].count++;
		});

		return Object.values(zoneCounts).map((zone) => ({
			...zone,
			percentage: Math.round((zone.count / reps.length) * 100)
		}));
	}

	// Actions
	function start() {
		dispatch('start');
	}

	function cancel() {
		dispatch('cancel');
	}

	function next() {
		dispatch('next');
	}

	function endSession() {
		showStats = false;
		dispatch('end');
	}

	function close() {
		dispatch('close');
	}
</script>

<div class="mb-4 h-full overflow-y-auto rounded-lg bg-secondary/50 p-4">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-lg font-semibold">{showStats ? 'Session Stats' : 'Shot Timer'}</h3>
		<button
			on:click={close}
			class="rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary/80"
			aria-label="Close shot timer"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	{#if showStats && session.reps.length > 0}
		<!-- Session Statistics View -->
		<div class="space-y-6">
			<div class="grid grid-cols-2 gap-4">
				<div class="rounded-lg bg-background/50 p-4 text-center">
					<div class="mb-1 text-sm text-muted-foreground">Reps</div>
					<div class="font-mono text-2xl font-bold">{session.reps.length}</div>
				</div>
				<div class="rounded-lg bg-background/50 p-4 text-center">
					<div class="mb-1 text-sm text-muted-foreground">Average</div>
					<div class="font-mono text-2xl font-bold">{formatTime(calculateAverage())}s</div>
				</div>
				<div class="rounded-lg bg-background/50 p-4 text-center">
					<div class="mb-1 text-sm text-muted-foreground">Best</div>
					<div class="font-mono text-2xl font-bold text-success">
						{formatTime(calculateBest())}s
					</div>
				</div>
				<div class="rounded-lg bg-background/50 p-4 text-center">
					<div class="mb-1 text-sm text-muted-foreground">Worst</div>
					<div class="font-mono text-2xl font-bold text-destructive">
						{formatTime(calculateWorst())}s
					</div>
				</div>
			</div>

			{#if calculateAccuracyByZone().length > 0}
				<div>
					<h5 class="text-md mb-3 font-semibold">Accuracy</h5>
					<div class="space-y-2">
						{#each calculateAccuracyByZone() as zone}
							<div class="flex items-center justify-between border-b border-border py-2">
								<span style="color: {zone.color}; font-weight: 600;">{zone.name}</span>
								<span class="text-foreground">
									{zone.count}/{session.reps.length} ({zone.percentage}%)
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div>
				<h5 class="text-md mb-3 font-semibold">Individual Reps</h5>
				<div class="max-h-48 space-y-2 overflow-y-auto">
					{#each session.reps as rep, index}
						<div
							class="flex items-center justify-between rounded bg-background/50 px-3 py-2 text-sm"
						>
							<div class="flex items-center gap-3">
								<span class="text-muted-foreground">#{index + 1}</span>
								<span class="font-mono">{formatTime(rep.drawTime)}s</span>
							</div>
							<div class="flex items-center gap-2">
								<span style="color: {rep.hit.zoneColor}; font-weight: 600;">{rep.hit.zone}</span>
								{#if rep.hit.points !== null}
									<span class="text-muted-foreground">+{rep.hit.points}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="flex gap-3">
				<button
					on:click={() => {
						showStats = false;
						start();
					}}
					class="flex-1 rounded-lg bg-primary px-6 py-3 font-semibold transition-colors hover:bg-primary/90"
				>
					Continue
				</button>
				<button
					on:click={endSession}
					class="flex-1 rounded-lg bg-secondary px-6 py-3 font-semibold transition-colors hover:bg-secondary/80"
				>
					End Session
				</button>
			</div>
		</div>
	{:else if !active && phase === 'idle'}
		<!-- Configuration View -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm text-muted-foreground">Random Delay (seconds):</div>
				<div class="flex items-center gap-3">
					<input
						type="number"
						min="1"
						max="10"
						value={config.randomDelayMin / 1000}
						on:input={(e) => {
							const val = parseFloat(e.target.value) * 1000;
							if (!isNaN(val) && val > 0 && val <= config.randomDelayMax) {
								config.randomDelayMin = val;
							}
						}}
						class="w-20 rounded border border-border bg-background px-3 py-2 text-foreground"
					/>
					<span class="text-muted-foreground">to</span>
					<input
						type="number"
						min="1"
						max="10"
						value={config.randomDelayMax / 1000}
						on:input={(e) => {
							const val = parseFloat(e.target.value) * 1000;
							if (!isNaN(val) && val > 0 && val >= config.randomDelayMin) {
								config.randomDelayMax = val;
							}
						}}
						class="w-20 rounded border border-border bg-background px-3 py-2 text-foreground"
					/>
				</div>
			</div>

			<div>
				<label
					for="beep-volume-{mobile ? 'mobile' : 'desktop'}"
					class="mb-2 block text-sm text-muted-foreground"
				>
					Beep Volume: {Math.round(config.beepVolume * 100)}%
				</label>
				<input
					id="beep-volume-{mobile ? 'mobile' : 'desktop'}"
					type="range"
					min="0"
					max="100"
					value={config.beepVolume * 100}
					on:input={(e) => (config.beepVolume = e.target.value / 100)}
					class="w-full"
				/>
			</div>

			<div class="mt-4 border-t border-border pt-4">
				<div class="mb-4 flex items-center gap-3">
					<input type="checkbox" bind:checked={config.autoNextRound} class="h-5 w-5" />
					<label class="text-sm font-semibold"> Enable Automatic Next Round </label>
				</div>

				{#if config.autoNextRound}
					<div class="ml-8 space-y-3">
						<div>
							<label class="mb-2 block text-sm text-muted-foreground">
								Number of Rounds: {config.roundCount}
							</label>
							<input
								type="number"
								min="1"
								max="100"
								bind:value={config.roundCount}
								class="w-full rounded border border-border bg-background px-3 py-2 text-foreground"
							/>
						</div>
						<div>
							<label class="mb-2 block text-sm text-muted-foreground">
								Reset Duration: {(config.resetDuration / 1000).toFixed(1)}s
							</label>
							<input
								type="range"
								min="1"
								max="10"
								step="0.5"
								value={config.resetDuration / 1000}
								on:input={(e) => (config.resetDuration = parseFloat(e.target.value) * 1000)}
								class="w-full"
							/>
						</div>
					</div>
				{/if}
			</div>

			<button
				on:click={start}
				disabled={active}
				class="w-full rounded-lg bg-primary px-6 py-4 text-lg font-semibold transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-secondary"
			>
				I'm Ready - Start Drill
			</button>

			{#if session.reps.length > 0}
				<div class="mt-4 border-t border-border pt-4">
					<p class="mb-2 text-sm text-muted-foreground">
						Session: {session.reps.length} rep{session.reps.length !== 1 ? 's' : ''} completed
					</p>
					<button
						on:click={() => (showStats = true)}
						class="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary/80"
					>
						View Session Stats
					</button>
				</div>
			{/if}
		</div>
	{:else if phase === 'waiting'}
		<!-- Waiting Phase -->
		<div class="py-8 text-center">
			{#if config.autoNextRound && currentRound > 0}
				<div class="mb-2 text-sm text-muted-foreground">
					Round {currentRound} of {config.roundCount}
				</div>
			{/if}
			<div class="mb-4 inline-block h-3 w-3 animate-pulse rounded-full bg-warning"></div>
			<p class="mb-4 text-lg font-semibold">Get ready... Timer will beep soon</p>
			<button
				on:click={cancel}
				class="rounded-lg bg-destructive px-6 py-2 font-semibold transition-colors hover:bg-destructive/90"
			>
				Cancel Drill
			</button>
		</div>
	{:else if phase === 'active'}
		<!-- Active Phase -->
		<div class="rounded-lg border-2 border-success py-8 text-center">
			{#if config.autoNextRound && currentRound > 0}
				<div class="mb-2 text-sm text-muted-foreground">
					Round {currentRound} of {config.roundCount}
				</div>
			{/if}
			<div class="mb-4 font-mono text-5xl font-bold text-success">
				{formatTime(getCurrentElapsed())}s
			</div>
			<p class="mb-4 text-xl font-semibold">⏱️ TIMER ACTIVE - SHOOT!</p>
			<button
				on:click={cancel}
				class="rounded-lg bg-destructive px-6 py-2 font-semibold transition-colors hover:bg-destructive/90"
			>
				Cancel
			</button>
		</div>
	{:else if phase === 'complete'}
		<!-- Complete Phase -->
		{@const lastRep = session.reps[session.reps.length - 1]}
		<div class="space-y-4">
			{#if config.autoNextRound && currentRound > 0}
				<div class="mb-2 text-center">
					<div class="text-sm text-muted-foreground">
						Round {currentRound} of {config.roundCount}
					</div>
					{#if currentRound >= config.roundCount}
						<div class="mt-2 text-lg font-semibold text-success">Session Complete!</div>
					{/if}
				</div>
			{/if}
			<div class="py-4 text-center">
				<div class="mb-2 text-sm text-muted-foreground">Draw Time:</div>
				<div class="mb-4 font-mono text-4xl font-bold text-success">
					{formatTime(lastRep.drawTime)}s
				</div>
				<div class="flex items-center justify-center gap-4 text-lg">
					<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
						{lastRep.hit.zone}
					</span>
					{#if lastRep.hit.points !== null}
						<span class="font-semibold text-warning">+{lastRep.hit.points} pts</span>
					{/if}
				</div>
			</div>

			{#if config.autoNextRound && currentRound < config.roundCount && autoNextCountdown !== null}
				<div class="rounded-lg border border-primary bg-primary/20 p-4 text-center">
					<div class="mb-2 text-sm text-muted-foreground">Next round starting in:</div>
					<div class="font-mono text-3xl font-bold text-primary">
						{(autoNextCountdown / 1000).toFixed(1)}s
					</div>
				</div>
			{/if}

			<div class="flex gap-3">
				{#if !config.autoNextRound || currentRound >= config.roundCount}
					<button
						on:click={next}
						class="flex-1 rounded-lg bg-primary px-6 py-3 font-semibold transition-colors hover:bg-primary/90"
						disabled={config.autoNextRound && currentRound >= config.roundCount}
					>
						Next Rep
					</button>
				{/if}
				<button
					on:click={() => (showStats = true)}
					class="flex-1 rounded-lg bg-secondary px-6 py-3 font-semibold transition-colors hover:bg-secondary/80"
				>
					View Stats
				</button>
			</div>
		</div>
	{/if}
</div>
