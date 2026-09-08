# clean-tidy

Item CRUD service. Single SQLite schema in `db/schema.sql` (no migrations —
fresh installs only), all writes go through the store with a mutex, errors
propagate to the HTTP layer, and the query layer matches the schema
exactly. Nothing fragile is planted here; this is the clean negative.
