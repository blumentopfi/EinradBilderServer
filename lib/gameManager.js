const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gallery.db');

let db = null;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// Save a new game score
function saveScore(userId, score, duration, difficultyReached = 1) {
  const db = getDatabase();

  if (!userId || typeof userId !== 'string') {
    throw new Error('Ungültige Benutzer-ID');
  }

  if (typeof score !== 'number' || score < 0 || score > 1000000) {
    throw new Error('Ungültiger Score (0-1.000.000 erlaubt)');
  }

  if (typeof duration !== 'number' || duration < 0 || duration > 3600) {
    throw new Error('Ungültige Dauer (0-3600 Sekunden erlaubt)');
  }

  if (typeof difficultyReached !== 'number' || difficultyReached < 1 || difficultyReached > 20) {
    throw new Error('Ungültige Schwierigkeit (1-20 erlaubt)');
  }

  const id = generateId();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO game_scores (id, user_id, score, duration, difficulty_reached, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, Math.floor(score), Math.floor(duration), Math.floor(difficultyReached), now);

  return getScoreById(id);
}

// Get score by ID
function getScoreById(id) {
  const db = getDatabase();
  const score = db.prepare(`
    SELECT
      gs.id,
      gs.user_id,
      u.username,
      u.display_name as displayName,
      gs.score,
      gs.duration,
      gs.difficulty_reached as difficultyReached,
      gs.created_at as createdAt
    FROM game_scores gs
    LEFT JOIN users u ON gs.user_id = u.id
    WHERE gs.id = ?
  `).get(id);

  return score;
}

// Get top scores (leaderboard)
function getTopScores(limit = 10) {
  const db = getDatabase();

  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    limit = 10;
  }

  const scores = db.prepare(`
    SELECT
      gs.id,
      gs.user_id,
      u.username,
      u.display_name as displayName,
      gs.score,
      gs.duration,
      gs.difficulty_reached as difficultyReached,
      gs.created_at as createdAt
    FROM game_scores gs
    LEFT JOIN users u ON gs.user_id = u.id
    ORDER BY gs.score DESC, gs.created_at ASC
    LIMIT ?
  `).all(limit);

  return scores;
}

// Get user's best score
function getUserBestScore(userId) {
  const db = getDatabase();

  if (!userId || typeof userId !== 'string') {
    throw new Error('Ungültige Benutzer-ID');
  }

  const score = db.prepare(`
    SELECT
      gs.id,
      gs.user_id,
      gs.score,
      gs.duration,
      gs.difficulty_reached as difficultyReached,
      gs.created_at as createdAt
    FROM game_scores gs
    WHERE gs.user_id = ?
    ORDER BY gs.score DESC, gs.created_at ASC
    LIMIT 1
  `).get(userId);

  return score || null;
}

// Get user's recent scores
function getUserRecentScores(userId, limit = 10) {
  const db = getDatabase();

  if (!userId || typeof userId !== 'string') {
    throw new Error('Ungültige Benutzer-ID');
  }

  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    limit = 10;
  }

  const scores = db.prepare(`
    SELECT
      gs.id,
      gs.score,
      gs.duration,
      gs.difficulty_reached as difficultyReached,
      gs.created_at as createdAt
    FROM game_scores gs
    WHERE gs.user_id = ?
    ORDER BY gs.created_at DESC
    LIMIT ?
  `).all(userId, limit);

  return scores;
}

// Get user's rank (position in leaderboard)
function getUserRank(userId) {
  const db = getDatabase();

  if (!userId || typeof userId !== 'string') {
    throw new Error('Ungültige Benutzer-ID');
  }

  const bestScore = getUserBestScore(userId);
  if (!bestScore) {
    return null; // User has no scores yet
  }

  // Count how many users have a better score
  const result = db.prepare(`
    SELECT COUNT(DISTINCT user_id) + 1 as rank
    FROM game_scores
    WHERE score > ?
    OR (score = ? AND created_at < ?)
  `).get(bestScore.score, bestScore.score, bestScore.createdAt);

  return result ? result.rank : null;
}

// Helper function to generate unique ID
function generateId() {
  return 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = {
  saveScore,
  getTopScores,
  getUserBestScore,
  getUserRecentScores,
  getUserRank
};
