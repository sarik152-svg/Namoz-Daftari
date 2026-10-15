# Migration verification — 19 September 2026

Live URL: https://namoz.45.94.209.69.sslip.io/

## Result

Application and database run on the existing VPS `45.94.209.69`, independently of
Railway. No paid Railway plan, domain purchase, or certificate purchase was used.
No new VPS instance was purchased. The free hostname depends on sslip.io
DNS; database/application hosting does not depend on that service or on Railway.

Railway's expired trial was changed to Free with the user's explicit approval.
The Amsterdam free-tier deployment restriction ended at 18:00 UTC. PostgreSQL was
temporarily started for export; the old web services stayed stopped throughout.

## Data verification

- Source runtime commit: `f538a76a1cd857d124604242211ad6cc7998b046`.
- Local runtime code and SQL migrations match that deployed source revision.
- Source and destination PostgreSQL: 18.6.
- 29 tables, 15 sequences, 307 total table rows at the migration snapshot.
- 11 members, 85 day records, 34 already-applied migrations.
- Source manifests taken before and after export match exactly.
- Restored VPS manifest matches the source: all table row counts, sorted row
  hashes, and sequence values are identical.
- All 11 PINs decrypt with the original key; none missing or unreadable.
- Original admin password retained; admin login, identity check and logout passed.
- Startup applied no new migrations and purged zero sessions.
- 232 Python tests and 278 client tests passed.

Source custom-format archive SHA-256:
`21d9290e914b3b8345ab036a66d3b836aba103d0b093ffc463a9aefa4608d6d1`

Complete source cluster SQL gzip SHA-256:
`61cd99b168ec54ad53108f96c4a61e0f064335e5f160c033e5ae6876267e547e`

## Operations checked

- HTTPS homepage returns 200, `/health` returns `{"status":"ok"}`.
- HTTP redirects to HTTPS; unauthenticated `/api/v1/state` returns 401.
- Safari opens the new login page without a TLS warning.
- Application restart succeeded; both containers healthy.
- PostgreSQL port5433 and application port8095 bind to loopback only.
- Docker/nginx enabled at boot; containers restart unless explicitly stopped.
- Free TLS certificate issued; renewal dry-run passed; nginx renewal hook installed.
- Daily backup timer enabled, around 03:15–03:20 Asia/Tashkent.
- First real backup restored into a separate temporary database; its complete
  manifest matched the live database. That temporary database was then removed.
- Migration-only Railway SSH key revoked after export.
- Temporary source deployment confirmed `REMOVED`; source volume remains Ready
  and is not marked for deletion. VPS HTTPS health still passes with Railway off.

## Backups and rollback material

Root-only VPS directory: `/opt/backups/namoz-daftari`.

It contains the untouched source dump, full-cluster SQL archive, source/destination
manifests, original Railway environment files, pre-migration project archive,
Git history bundle, and current code archive. Recurring backups are in `daily/`
with a matching configuration archive containing the original PIN encryption key.
The first real recurring backup is `namoz-20260919T180245Z.dump`.

An off-server copy of the source database, keys, code/history and first real backup
is retained on the user's Mac in the private migration directory. Daily backups
currently stay on the VPS: copy them off-server regularly for VPS-loss protection.
The earlier empty PostgreSQL16 volume was retained, not reused or erased.
The original Railway data volume was retained, not deleted.

## User-facing change

Use the new HTTPS URL and log in with the same login/PIN. The old Railway-hosted
URL is not the new production entry point. Browser sessions/localStorage do not
automatically transfer between hostnames. Unsynced offline records stored only on
a user's device are not in the server database dump and need separate recovery if
any exist. Do not clear old browser storage until such records are accounted for.
