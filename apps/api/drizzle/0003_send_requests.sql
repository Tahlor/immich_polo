CREATE TABLE send_requests (
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  send_id TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  asset_id TEXT,
  upload_duplicate INTEGER,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (author_id, send_id)
);
