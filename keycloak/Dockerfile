FROM quay.io/keycloak/keycloak:26.0 AS builder

# Bake realm import and custom theme into the image
COPY import/stellar-hex-realm.json /opt/keycloak/data/import/
COPY themes/stellar-hex /opt/keycloak/themes/stellar-hex

ENV KC_HEALTH_ENABLED=true
ENV KC_DB=postgres

# Build the optimized Keycloak image at build time (not at startup)
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.0

COPY --from=builder /opt/keycloak/ /opt/keycloak/

ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start", "--optimized"]
