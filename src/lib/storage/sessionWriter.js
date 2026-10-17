// Keep in-flight writes attached to the session that produced them, even if the
// user starts another session before IndexedDB finishes opening.
export function createSessionWriter({ createSession, addRep }) {
	let current = null;
	return {
		reset() {
			current = null;
		},
		async save(rep, snapshot) {
			const sessionSnapshot = JSON.parse(JSON.stringify(snapshot));
			const storedRep = JSON.parse(JSON.stringify(rep));
			const key = JSON.stringify(sessionSnapshot);
			if (!current || current.key !== key) {
				current = { key, promise: createSession(sessionSnapshot) };
			}
			const pending = current;
			try {
				const session = await pending.promise;
				return await addRep(session.id, storedRep);
			} catch (error) {
				if (current === pending) current = null;
				throw error;
			}
		}
	};
}
