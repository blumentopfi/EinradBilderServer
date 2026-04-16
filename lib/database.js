const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path (configurable via environment variable)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gallery.db');

// Initialize database connection
let db = null;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Better performance for concurrent reads
    initializeTables();
  }
  return db;
}

function initializeTables() {
  const db = getDatabase();

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'uploader', 'user')),
      display_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      created_by TEXT,
      last_login TEXT
    );
  `);

  // Create audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user TEXT,
      details TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Create favorites table
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, file_path),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create FAQ votes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS faq_votes (
      id TEXT PRIMARY KEY,
      faq_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL CHECK(vote IN (-1, 1)),
      created_at TEXT NOT NULL,
      UNIQUE(faq_id, user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create share links table
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_links (
      token TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('file', 'folder')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_faq_votes_faq ON faq_votes(faq_id);
    CREATE INDEX IF NOT EXISTS idx_faq_votes_user ON faq_votes(user_id);
    CREATE INDEX IF NOT EXISTS idx_share_links_user ON share_links(created_by);
  `);

  console.log('Database initialized successfully');
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// Graceful shutdown
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

module.exports = {
  getDatabase,
  closeDatabase
};
