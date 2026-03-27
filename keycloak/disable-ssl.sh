#!/bin/bash
# Wait for Keycloak to be ready, then disable SSL on master realm for dev
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "Waiting for Keycloak to start..."
until /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:9090 --realm master --user "$ADMIN_USER" --password "$ADMIN_PASS" 2>/dev/null; do
  sleep 3
done

echo "Disabling SSL on master realm..."
/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE
echo "Done — SSL disabled on master realm."
