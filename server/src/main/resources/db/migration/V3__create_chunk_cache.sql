CREATE TABLE chunk_cache (
    id          BIGSERIAL PRIMARY KEY,
    seed        BIGINT NOT NULL,
    cx          INT NOT NULL,
    cy          INT NOT NULL,
    hex_data    JSONB NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (seed, cx, cy)
);

CREATE INDEX idx_chunk_cache_seed_coords ON chunk_cache(seed, cx, cy);
