# Hosted Office SQL migration recovery — 2026-10-19

The 17 SQL files here were recovered **read-only** from the connected
Office Supabase project's `supabase_migrations.schema_migrations.statements`
history. They existed on the hosted project but were not tracked in this
repository. Names and timestamps match the hosted migration ledger.

This directory is an **immutable-history recovery archive**, not the active
disposable migration set. The six executable Story1 migrations live in
`../migrations/` and have their own passing PostgreSQL acceptance gate.
Do not run the archive as an extra migration batch or deploy it over an
existing hosted database without an ordered, isolated replay and schema
comparison. Historical bridge tokens/signing keys must remain private.

Coverage includes payment_sync, officer commands, secure read projections,
Office routing and synthetic handoff. These records do not convert preview
data into government-verified payments or taxpayer ledger credits.
