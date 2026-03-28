FROM quay.io/keycloak/keycloak:26.0

# Bake realm import and custom theme into the image
COPY stellar-hex-realm.json /opt/keycloak/data/import/
COPY themes/stellar-hex /opt/keycloak/themes/stellar-hex

ENV KC_HEALTH_ENABLED=true

ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start", "--import-realm"]
