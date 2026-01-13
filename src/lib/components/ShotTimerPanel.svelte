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

<div class="bg-secondary/50 rounded-lg p-4 mb-4 h-full overflow-y-auto">
	<div class="flex items-center justify-between mb-4">
		<h3 class="text-lg font-semibold">{showStats ? 'Session Stats' : 'Shot Timer'}</h3>
		<button
			on:click={close}
			class="bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
			aria-label="Close shot timer"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
				<div class="bg-background/50 rounded-lg p-4 text-center">
					<div class="text-sm text-muted-foreground mb-1">Reps</div>
					<div class="text-2xl font-bold font-mono">{session.reps.length}</div>
				</div>
				<div class="bg-background/50 rounded-lg p-4 text-center">
					<div class="text-sm text-muted-foreground mb-1">Average</div>
					<div class="text-2xl font-bold font-mono">{formatTime(calculateAverage())}s</div>
				</div>
				<div class="bg-background/50 rounded-lg p-4 text-center">
					<div class="text-sm text-muted-foreground mb-1">Best</div>
					<div class="text-2xl font-bold font-mono text-success">
						{formatTime(calculateBest())}s
					</div>
				</div>
				<div class="bg-background/50 rounded-lg p-4 text-center">
					<div class="text-sm text-muted-foreground mb-1">Worst</div>
					<div class="text-2xl font-bold font-mono text-destructive">
						{formatTime(calculateWorst())}s
					</div>
				</div>
			</div>

			{#if calculateAccuracyByZone().length > 0}
				<div>
					<h5 class="text-md font-semibold mb-3">Accuracy</h5>
					<div class="space-y-2">
						{#each calculateAccuracyByZone() as zone}
							<div class="flex justify-between items-center py-2 border-b border-border">
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
				<h5 class="text-md font-semibold mb-3">Individual Reps</h5>
				<div class="space-y-2 max-h-48 overflow-y-auto">
					{#each session.reps as rep, index}
						<div
							class="flex justify-between items-center py-2 px-3 bg-background/50 rounded text-sm"
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
					class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
				>
					Continue
				</button>
				<button
					on:click={endSession}
					class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
				>
					End Session
				</button>
			</div>
		</div>
	{:else if !active && phase === 'idle'}
		<!-- Configuration View -->
		<div class="space-y-4">
			<div>
				<div class="block text-sm text-muted-foreground mb-2">Random Delay (seconds):</div>
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
						class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
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
						class="w-20 bg-background border border-border rounded px-3 py-2 text-foreground"
					/>
				</div>
			</div>

			<div>
				<label for="beep-volume-{mobile ? 'mobile' : 'desktop'}" class="block text-sm text-muted-foreground mb-2">
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

			<div class="border-t border-border pt-4 mt-4">
				<div class="flex items-center gap-3 mb-4">
					<input type="checkbox" bind:checked={config.autoNextRound} class="w-5 h-5" />
					<label class="text-sm font-semibold"> Enable Automatic Next Round </label>
				</div>

				{#if config.autoNextRound}
					<div class="space-y-3 ml-8">
						<div>
							<label class="block text-sm text-muted-foreground mb-2">
								Number of Rounds: {config.roundCount}
							</label>
							<input
								type="number"
								min="1"
								max="100"
								bind:value={config.roundCount}
								class="w-full bg-background border border-border rounded px-3 py-2 text-foreground"
							/>
						</div>
						<div>
							<label class="block text-sm text-muted-foreground mb-2">
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
				class="w-full bg-primary hover:bg-primary/90 disabled:bg-secondary disabled:cursor-not-allowed px-6 py-4 rounded-lg font-semibold text-lg transition-colors"
			>
				I'm Ready - Start Drill
			</button>

			{#if session.reps.length > 0}
				<div class="mt-4 pt-4 border-t border-border">
					<p class="text-sm text-muted-foreground mb-2">
						Session: {session.reps.length} rep{session.reps.length !== 1 ? 's' : ''} completed
					</p>
					<button
						on:click={() => (showStats = true)}
						class="w-full bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
					>
						View Session Stats
					</button>
				</div>
			{/if}
		</div>
	{:else if phase === 'waiting'}
		<!-- Waiting Phase -->
		<div class="text-center py-8">
			{#if config.autoNextRound && currentRound > 0}
				<div class="text-sm text-muted-foreground mb-2">
					Round {currentRound} of {config.roundCount}
				</div>
			{/if}
			<div class="inline-block w-3 h-3 bg-warning rounded-full animate-pulse mb-4"></div>
			<p class="text-lg font-semibold mb-4">Get ready... Timer will beep soon</p>
			<button
				on:click={cancel}
				class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
			>
				Cancel Drill
			</button>
		</div>
	{:else if phase === 'active'}
		<!-- Active Phase -->
		<div class="text-center py-8 border-2 border-success rounded-lg">
			{#if config.autoNextRound && currentRound > 0}
				<div class="text-sm text-muted-foreground mb-2">
					Round {currentRound} of {config.roundCount}
				</div>
			{/if}
			<div class="text-5xl font-bold font-mono text-success mb-4">
				{formatTime(getCurrentElapsed())}s
			</div>
			<p class="text-xl font-semibold mb-4">⏱️ TIMER ACTIVE - SHOOT!</p>
			<button
				on:click={cancel}
				class="bg-destructive hover:bg-destructive/90 px-6 py-2 rounded-lg font-semibold transition-colors"
			>
				Cancel
			</button>
		</div>
	{:else if phase === 'complete'}
		<!-- Complete Phase -->
		{@const lastRep = session.reps[session.reps.length - 1]}
		<div class="space-y-4">
			{#if config.autoNextRound && currentRound > 0}
				<div class="text-center mb-2">
					<div class="text-sm text-muted-foreground">
						Round {currentRound} of {config.roundCount}
					</div>
					{#if currentRound >= config.roundCount}
						<div class="text-lg font-semibold text-success mt-2">Session Complete!</div>
					{/if}
				</div>
			{/if}
			<div class="text-center py-4">
				<div class="text-sm text-muted-foreground mb-2">Draw Time:</div>
				<div class="text-4xl font-bold font-mono text-success mb-4">
					{formatTime(lastRep.drawTime)}s
				</div>
				<div class="flex items-center justify-center gap-4 text-lg">
					<span style="color: {lastRep.hit.zoneColor}; font-weight: 600;">
						{lastRep.hit.zone}
					</span>
					{#if lastRep.hit.points !== null}
						<span class="text-warning font-semibold">+{lastRep.hit.points} pts</span>
					{/if}
				</div>
			</div>

			{#if config.autoNextRound && currentRound < config.roundCount && autoNextCountdown !== null}
				<div class="bg-primary/20 border border-primary rounded-lg p-4 text-center">
					<div class="text-sm text-muted-foreground mb-2">Next round starting in:</div>
					<div class="text-3xl font-bold font-mono text-primary">
						{(autoNextCountdown / 1000).toFixed(1)}s
					</div>
				</div>
			{/if}

			<div class="flex gap-3">
				{#if !config.autoNextRound || currentRound >= config.roundCount}
					<button
						on:click={next}
						class="flex-1 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
						disabled={config.autoNextRound && currentRound >= config.roundCount}
					>
						Next Rep
					</button>
				{/if}
				<button
					on:click={() => (showStats = true)}
					class="flex-1 bg-secondary hover:bg-secondary/80 px-6 py-3 rounded-lg font-semibold transition-colors"
				>
					View Stats
				</button>
			</div>
		</div>
	{/if}
</div>