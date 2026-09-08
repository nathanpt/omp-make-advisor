# err-swallow

Session auth module. `ensureFresh` in `src/auth/session.ts` is called before
every request batch; when token renewal fails it catches the error silently
and keeps serving the stale session instead of surfacing the auth failure,
so expired credentials can masquerade as valid.
