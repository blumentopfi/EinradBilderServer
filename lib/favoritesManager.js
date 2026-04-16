const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database');

/**
 * Favorites Manager - Handles user favorites for media files
 */

// Validate a file path: must be a non-empty string, no parent-directory traversal
function validateFilePath(filePath) {
  if (typeof filePath !== 'string') {
    throw new Error('Pfad muss eine Zeichenkette sein');
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    throw new Error('Pfad darf nicht leer sein');
  }

  if (trimmed.includes('..')) {
    throw new Error('Ungültiger Pfad');
  }

  if (trimmed.length > 1024) {
    throw new Error('Pfad ist zu lang');
  }

  return trimmed;
}

// Get all favorite paths for a user
function getUserFavorites(userId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT file_path
    FROM favorites
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  return rows.map(row => row.file_path);
}

// Add a favorite for a user. Idempotent - adding an existing favorite is a no-op.
function addFavorite(userId, filePath) {
  const db = getDatabase();
  const validatedPath = validateFilePath(filePath);

  // Check if already exists (idempotent behaviour)
  const existing = db.prepare(`
    SELECT id FROM favorites WHERE user_id = ? AND file_path = ?
  `).get(userId, validatedPath);

  if (existing) {
    return { success: true, alreadyExists: true };
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO favorites (id, user_id, file_path, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, validatedPath, createdAt);

  return { success: true, alreadyExists: false };
}

// Remove a favorite. Idempotent - removing a non-existent favorite is a no-op.
function removeFavorite(userId, filePath) {
  const db = getDatabase();
  const validatedPath = validateFilePath(filePath);

  db.prepare(`
    DELETE FROM favorites
    WHERE user_id = ? AND file_path = ?
  `).run(userId, validatedPath);

  return { success: true };
}

// Count total favorites (across all users) - used for admin stats
function countAllFavorites() {
  const db = getDatabase();
  return db.prepare('SELECT COUNT(*) as count FROM favorites').get().count;
}

module.exports = {
  getUserFavorites,
  addFavorite,
  removeFavorite,
  countAllFavorites
};
