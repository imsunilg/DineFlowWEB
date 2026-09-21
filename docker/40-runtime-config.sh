#!/bin/sh
# Writes /config.json from environment variables so one image can serve any environment or tenant.
set -eu
cat > /usr/share/nginx/html/config.json <<EOF
{ "apiBaseUrl": "${API_BASE_URL:-/api/v1}", "defaultTenantCode": "${DEFAULT_TENANT_CODE:-}" }
EOF
echo "config.json: apiBaseUrl=${API_BASE_URL:-/api/v1} defaultTenantCode=${DEFAULT_TENANT_CODE:-}"
