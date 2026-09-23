#!/bin/sh
# Writes /config.json from environment variables so one image can serve any environment or tenant.
# Demo Login defaults OFF here: it must be turned on only for a development/demo deployment, never in production.
set -eu
demo_login="${DEMO_LOGIN_ENABLED:-false}"
cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiBaseUrl": "${API_BASE_URL:-/api/v1}",
  "defaultTenantCode": "${DEFAULT_TENANT_CODE:-}",
  "features": { "demoLogin": ${demo_login} },
  "demoUsers": [
    { "label": "Login as Admin", "loginId": "admin", "password": "DineFlow@123" },
    { "label": "Login as Manager", "loginId": "manager", "password": "Demo@123" }
  ]
}
EOF
echo "config.json: apiBaseUrl=${API_BASE_URL:-/api/v1} defaultTenantCode=${DEFAULT_TENANT_CODE:-} demoLogin=${demo_login}"
