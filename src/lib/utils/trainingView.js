export function repTime(rep) {
	return rep?.drillType === 'reload' ? rep.totalTime : rep?.drawTime;
}

export function formatTime(ms) {
	return Number.isFinite(ms) ? (ms / 1000).toFixed(2) : '—';
}

export function sessionSummary(reps) {
	const times = reps.map(repTime).filter(Number.isFinite);
	return {
		count: reps.length,
		best: times.length ? Math.min(...times) : null,
		average: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : null,
		failures: reps.filter((rep) => rep.isFailure).length
	};
}

export function trainingStatus({
	phase,
	waitingForClear,
	callOutTarget,
	autoNextCountdown,
	sessionFinished
}) {
	if (waitingForClear) return 'Clear the malfunction';
	if (phase === 'waiting') return 'Stand by';
	if (phase === 'reloading') return 'Reload and fire';
	if (phase === 'active') return callOutTarget || 'Go';
	if (autoNextCountdown !== null) return 'Next rep in';
	if (phase === 'complete') return sessionFinished ? 'Session complete' : 'Rep complete';
	return 'Ready when you are';
}
