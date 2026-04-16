const crypto = require('crypto');
const { getDatabase } = require('./database');

/**
 * Share Manager - Public share links for files or folders.
 *
 * Tokens are 32-char hex strings. Links may have an optional expiration
 * (expires_at ISO timestamp); null means "never expires". Expired links
 * are not actively cleaned up; callers check expires_at on each request.
 */

// Validate a media path: must be a non-empty string, no parent-directory traversal.
function validateSharePath(filePath) {
  if (typeof filePath !== 'string') {
    throw new Error('Pfad muss eine Zeichenkette sein');
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    throw new Error('Pfad darf nicht leer sein');
  }

  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new Error('Ungültiger Pfad');
  }

  if (trimmed.length > 1024) {
    throw new Error('Pfad ist zu lang');
  }

  return trimmed;
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Create a new share link. `kind` must be 'file' or 'folder'.
// `expiresInHours` may be a positive number or null/undefined (never expires).
function createShareLink(userId, filePath, kind, expiresInHours) {
  if (!['file', 'folder'].includes(kind)) {
    throw new Error('Typ muss "file" oder "folder" sein');
  }

  const validatedPath = validateSharePath(filePath);

  let expiresAt = null;
  if (expiresInHours !== null && expiresInHours !== undefined) {
    const hours = Number(expiresInHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365 * 10) {
      throw new Error('Ungültige Ablaufzeit');
    }
    expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  const db = getDatabase();
  const token = generateToken();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO share_links (token, path, kind, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, validatedPath, kind, userId, createdAt, expiresAt);

  return {
    token,
    path: validatedPath,
    kind,
    createdAt,
    expiresAt
  };
}

// Look up a share link by token. Returns row or null. Does NOT check expiration.
function getShareLinkByToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return null;
  }

  const db = getDatabase();
  const row = db.prepare(`
    SELECT token, path, kind, created_by, created_at, expires_at
    FROM share_links
    WHERE token = ?
  `).get(token);

  if (!row) return null;

  return {
    token: row.token,
    path: row.path,
    kind: row.kind,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

// Return true if the link's expires_at is set and has passed.
function isExpired(link) {
  if (!link || !link.expiresAt) return false;
  return new Date(link.expiresAt).getTime() <= Date.now();
}

// List all share links created by `userId`.
function listShareLinksByUser(userId) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT token, path, kind, created_by, created_at, expires_at
    FROM share_links
    WHERE created_by = ?
    ORDER BY created_at DESC
  `).all(userId);

  return rows.map(row => ({
    token: row.token,
    path: row.path,
    kind: row.kind,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

// Delete a share link. Returns true if a row was deleted.
function deleteShareLink(token) {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM share_links WHERE token = ?').run(token);
  return result.changes > 0;
}

module.exports = {
  createShareLink,
  getShareLinkByToken,
  isExpired,
  listShareLinksByUser,
  deleteShareLink,
  validateSharePath
};
