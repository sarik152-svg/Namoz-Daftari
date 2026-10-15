# VPS operations

Deployment: `/opt/namoz-daftari` on `45.94.209.69`.
HTTPS hostname: `namoz.45.94.209.69.sslip.io` (free DNS, no Railway runtime).
The hostname uses sslip.io DNS; the app and PostgreSQL run on the VPS itself.

## Safety and startup

- PostgreSQL 18 uses `namoz-daftari_namoz_pgdata18`. The earlier PostgreSQL 16
  volume is retained separately and must not be mounted into PostgreSQL 18.
- Both database and application ports bind only to loopback. Nginx handles TLS.
- `.env` must contain the original `ADMIN_PASSWORD` and `PIN_ENCRYPTION_KEY`,
  together with the destination `DB_PASSWORD`. Never commit these or a dump.
- Do not start the web service before restoring and verifying the production DB.
  Startup runs pending migrations and purges expired sessions.
- Both services use `restart: unless-stopped`; Docker is enabled at boot.

```sh
cd /opt/namoz-daftari
docker compose config -q
docker compose up -d db
# Restore ONLY into a confirmed empty destination database:
docker compose exec -T db pg_restore -U namoz -d namoz \
  --no-owner --no-acl --exit-on-error --single-transaction < /path/to/source.dump
docker compose exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U namoz -d namoz \
  < ops/database-manifest.sql
docker compose run --rm --no-deps -T web python - < ops/verify-pins.py
# Compare the manifest with the source BEFORE allowing startup migrations:
docker compose up -d web
curl --fail http://127.0.0.1:8095/health
docker compose ps
docker compose exec -T web python - < ops/smoke.py
```

The source and destination manifests must have the same table row counts, sorted
row hashes, and sequence states. An unreadable PIN or unexpected migration is a
stop condition, not something to repair by assigning new PINs.

## Backups

`ops/backup.sh` creates a transactionally consistent custom-format dump, validates
its archive table of contents, writes its SHA-256, and archives the configuration
containing the encryption key. Backups are root-only in
`/opt/backups/namoz-daftari/daily`. The timer runs daily around 03:15 Asia/Tashkent.
No automatic deletion is configured. Monitor disk space and choose retention
explicitly. These backups are on the same VPS; copy them off-server periodically
for protection against loss of the VPS itself.

```sh
systemctl start namoz-backup.service
systemctl status namoz-backup.service
systemctl list-timers namoz-backup.timer
journalctl -u namoz-backup.service --no-pager -n 30
```

For a restore rehearsal, create a **new** database, restore the dump there, and
compare its manifest. Do not use `pg_restore --clean` on the live database.

```sh
bash ops/check-backup.sh /opt/backups/namoz-daftari/daily/namoz-TIMESTAMP.dump
```

The script creates a random, dedicated test database, restores the archive,
prints its manifest, then drops only that temporary database. It never drops
or overwrites the live `namoz` database.

## TLS and health

Certbot renews the free certificate via the HTTP ACME path. The project-scoped
deploy hook `ops/renew-nginx.sh` reloads nginx after successful renewal.

```sh
certbot renew --cert-name namoz.45.94.209.69.sslip.io --dry-run
nginx -t
curl --fail https://namoz.45.94.209.69.sslip.io/health
docker compose logs --tail=100 web
```

## Browser data caveat

Server data and existing PINs are preserved by the database and original key.
Browser localStorage belongs to the old hostname: users must log in again on the
new hostname. Unsynced offline changes existing only on a user's device are not
in PostgreSQL and cannot be recovered from a server dump. Keep the old browser
data intact until any such changes have been recovered.
