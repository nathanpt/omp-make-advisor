# data-drift

User store. `db/schema.sql` is the canonical schema, but migration
`db/migrations/0042_add_flags.sql` (applied in staging) added moderation
columns that were never folded back into the canonical file, and
`src/queries/users.ts` already selects them. The three surfaces have
drifted apart; a future reader of schema.sql will model users without the
flag columns.
