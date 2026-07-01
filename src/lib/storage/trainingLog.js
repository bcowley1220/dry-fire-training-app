const DB_NAME = 'dry-fire-training-log';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const REP_STORE = 'reps';

function assertIndexedDb() {
	if (typeof indexedDB === 'undefined') {
		throw new Error('IndexedDB is not available in this environment.');
	}
}

function openDatabase() {
	assertIndexedDb();

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;

			if (!db.objectStoreNames.contains(SESSION_STORE)) {
				const sessionStore = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
				sessionStore.createIndex('startedAt', 'startedAt');
				sessionStore.createIndex('updatedAt', 'updatedAt');
			}

			if (!db.objectStoreNames.contains(REP_STORE)) {
				const repStore = db.createObjectStore(REP_STORE, { keyPath: 'id' });
				repStore.createIndex('sessionId', 'sessionId');
				repStore.createIndex('timestamp', 'timestamp');
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function runTransaction(storeNames, mode, callback) {
	return openDatabase().then(
		(db) =>
			new Promise((resolve, reject) => {
				const transaction = db.transaction(storeNames, mode);
				const stores = Array.isArray(storeNames)
					? Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]))
					: transaction.objectStore(storeNames);

				let result;

				transaction.oncomplete = () => {
					db.close();
					resolve(result);
				};
				transaction.onerror = () => {
					db.close();
					reject(transaction.error);
				};
				transaction.onabort = () => {
					db.close();
					reject(transaction.error);
				};

				result = callback(stores, transaction);
			})
	);
}

function requestToPromise(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function getAllFromIndex(storeName, indexName, query = null) {
	return openDatabase().then(async (db) => {
		try {
			const transaction = db.transaction(storeName, 'readonly');
			const index = transaction.objectStore(storeName).index(indexName);
			return await requestToPromise(index.getAll(query));
		} finally {
			db.close();
		}
	});
}

export function createSession(session) {
	const now = Date.now();
	const newSession = {
		id: session.id || crypto.randomUUID(),
		startedAt: session.startedAt || now,
		endedAt: session.endedAt || null,
		updatedAt: now,
		drillType: session.drillType || 'draw',
		targetMode: session.targetMode || 'custom',
		selectedTemplate: session.selectedTemplate || null,
		targets: session.targets || [],
		zones: session.zones || {},
		timerConfig: session.timerConfig || {},
		repCount: 0,
		totalHits: 0,
		bestTime: null,
		averageTime: null,
		notes: session.notes || ''
	};

	return runTransaction(SESSION_STORE, 'readwrite', (store) => {
		store.put(newSession);
		return newSession;
	});
}

export async function addRep(sessionId, rep) {
	const storedRep = {
		...rep,
		id: rep.id || crypto.randomUUID(),
		sessionId,
		timestamp: rep.timestamp || Date.now()
	};

	await runTransaction([SESSION_STORE, REP_STORE], 'readwrite', (stores) => {
		const sessionRequest = stores[SESSION_STORE].get(sessionId);

		sessionRequest.onsuccess = () => {
			const session = sessionRequest.result;
			if (!session) return;

			const repTime = storedRep.drillType === 'reload' ? storedRep.totalTime : storedRep.drawTime;
			const hits = storedRep.hits || (storedRep.hit ? [storedRep.hit] : []);
			const nextRepCount = session.repCount + 1;
			const previousTotal = (session.averageTime || 0) * session.repCount;

			stores[SESSION_STORE].put({
				...session,
				endedAt: storedRep.timestamp,
				updatedAt: Date.now(),
				repCount: nextRepCount,
				totalHits: session.totalHits + hits.length,
				bestTime: session.bestTime === null ? repTime : Math.min(session.bestTime, repTime),
				averageTime: (previousTotal + repTime) / nextRepCount,
				drillType: storedRep.drillType || session.drillType
			});
		};

		stores[REP_STORE].put(storedRep);
		return storedRep;
	});

	return storedRep;
}

export async function getSessions() {
	const sessions = await getAllFromIndex(SESSION_STORE, 'updatedAt');
	return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSessionWithReps(sessionId) {
	const db = await openDatabase();

	try {
		const sessionTransaction = db.transaction(SESSION_STORE, 'readonly');
		const session = await requestToPromise(
			sessionTransaction.objectStore(SESSION_STORE).get(sessionId)
		);

		const reps = await getAllFromIndex(REP_STORE, 'sessionId', sessionId);
		reps.sort((a, b) => a.timestamp - b.timestamp);

		return { session, reps };
	} finally {
		db.close();
	}
}

export function deleteSession(sessionId) {
	return runTransaction([SESSION_STORE, REP_STORE], 'readwrite', (stores) => {
		const repIndex = stores[REP_STORE].index('sessionId');
		const repsRequest = repIndex.getAllKeys(sessionId);

		repsRequest.onsuccess = () => {
			for (const key of repsRequest.result) {
				stores[REP_STORE].delete(key);
			}
			stores[SESSION_STORE].delete(sessionId);
		};
	});
}
