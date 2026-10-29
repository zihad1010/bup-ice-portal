CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  body TEXT NOT NULL,
  relevant_date TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notices_pinned_created ON notices (pinned DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ct_datetime TEXT NOT NULL DEFAULT '',
  syllabus_title TEXT NOT NULL DEFAULT '',
  syllabus_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (id, ct_datetime, syllabus_title, syllabus_text) VALUES (1, '', '', '');
