#!/usr/bin/env sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/namoz.45.94.209.69.sslip.io ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi
