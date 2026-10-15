#!/usr/bin/env bash
# Root-only, consistent logical backup; never prints database credentials.
set -euo pipefail
umask 077
cd /opt/namoz-daftari
destination=/opt/backups/namoz-daftari/daily
install -d -m 700 "$destination"
exec 9>/run/lock/namoz-backup.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="$destination/namoz-$stamp.dump"
docker compose exec -T db pg_dump -U namoz -d namoz --format=custom > "$dump.partial"
test -s "$dump.partial"
docker compose exec -T db pg_restore --list < "$dump.partial" >/dev/null
mv "$dump.partial" "$dump"
sha256sum "$dump" > "$dump.sha256"
# The key is essential to restore PINs; retain it together with each backup.
tar -czf "$destination/config-$stamp.tar.gz" .env docker-compose.yml Dockerfile .dockerignore
chmod 600 "$dump" "$dump.sha256" "$destination/config-$stamp.tar.gz"
printf 'Backup verified: %s\n' "$dump"
# No automatic deletion: review storage/retention explicitly with the owner.
