#!/usr/bin/env bash
# Restore rehearsal in a NEW database. Does not modify the live database.
set -euo pipefail
umask 077
if [ "$#" -ne 1 ] || [ ! -s "$1" ]; then
    printf 'Usage: %s /absolute/path/to/backup.dump\n' "$0" >&2
    exit 2
fi
archive=$(realpath "$1")
cd /opt/namoz-daftari
suffix=$(tr -d '-' </proc/sys/kernel/random/uuid)
check_db="namoz_restore_check_${suffix}"
created=false
cleanup() {
    if [ "$created" = true ]; then
        # This name is generated above and is never supplied by the caller.
        docker compose exec -T db dropdb -U namoz --if-exists "$check_db"
    fi
}
trap cleanup EXIT
docker compose exec -T db createdb -U namoz -T template0 "$check_db"
created=true
docker compose exec -T db pg_restore -U namoz -d "$check_db" \
    --no-owner --no-acl --exit-on-error --single-transaction < "$archive"
docker compose exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U namoz -d "$check_db" \
    < ops/database-manifest.sql
printf 'Restore rehearsal passed. Temporary database will be removed.\n' >&2
