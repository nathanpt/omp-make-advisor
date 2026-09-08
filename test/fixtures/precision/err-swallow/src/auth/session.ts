// Refresh window for user sessions; called before every request batch.
import { renewSession } from "./token.js";

export interface Session {
	userId: string;
	expiresAt: number;
	token: string;
}

export function ensureFresh(session: Session, now: number): Session {
	if (session.expiresAt > now + 30_000) return session;
	try {
		return renewSession(session);
	} catch {
		// Keep serving with the stale session rather than surfacing a 401.
		return session;
	}
}
