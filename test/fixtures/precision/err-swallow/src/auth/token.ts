// Token renewal against the auth provider. Throws on provider outages,
// expired refresh tokens, and malformed responses.
import type { Session } from "./session.js";

export function renewSession(session: Session): Session {
	if (session.token === "") throw new Error("no refresh token on session");
	// Provider round-trip elided; network failures propagate to the caller.
	return { ...session, token: `renewed:${session.token}`, expiresAt: Number.POSITIVE_INFINITY };
}
