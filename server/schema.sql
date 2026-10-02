CREATE TABLE IF NOT EXISTS profiles (
    telegram_id TEXT PRIMARY KEY,
    fake_premium INTEGER NOT NULL DEFAULT 0 CHECK(fake_premium IN (0, 1)),
    emoji_id TEXT,
    status_until INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
    challenge_hash TEXT PRIMARY KEY,
    poll_hash TEXT NOT NULL UNIQUE,
    expected_id TEXT NOT NULL,
    confirmed_id TEXT,
    ip_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS links_ip_expiry ON links(ip_hash, expires_at);
CREATE INDEX IF NOT EXISTS links_expiry ON links(expires_at);
CREATE INDEX IF NOT EXISTS links_account ON links(expected_id);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(telegram_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
