-- Run with psql -X -A -t -v ON_ERROR_STOP=1. Contains only counts and hashes.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
SELECT format(
  'SELECT %L, count(*), md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text) COLLATE "C"), '''')) FROM %I.%I AS t;',
  'table:' || schemaname || '.' || tablename, schemaname, tablename
)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename COLLATE "C"
\gexec
SELECT format('SELECT %L, last_value, is_called FROM %I.%I;',
  'sequence:' || schemaname || '.' || sequencename, schemaname, sequencename)
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename COLLATE "C"
\gexec
COMMIT;
