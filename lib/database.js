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

  // Create game scores table
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      difficulty_reached INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_scores_score ON game_scores(score DESC);
    CREATE INDEX IF NOT EXISTS idx_scores_user ON game_scores(user_id);
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
