CREATE TABLE game_saves (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    save_name     VARCHAR(100) NOT NULL DEFAULT 'Autosave',
    state_json    JSONB NOT NULL,
    camera_json   JSONB,
    waypoints_json JSONB,
    turn          INT NOT NULL DEFAULT 1,
    player_name   VARCHAR(100),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_saves_user_id ON game_saves(user_id);
