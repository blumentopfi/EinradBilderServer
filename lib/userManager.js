const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database');

const SALT_ROUNDS = 10;

/**
 * User Manager - Handles all user-related database operations
 */

// Create a new user
function createUser(username, password, role = 'user', displayName = null, createdBy = 'system') {
  const db = getDatabase();

  // Validate username
  if (!username || username.length < 3 || username.length > 30) {
    throw new Error('Benutzername muss zwischen 3 und 30 Zeichen lang sein');
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    throw new Error('Benutzername darf nur Buchstaben, Zahlen, Punkt, _ und - enthalten');
  }

  // Validate password
  if (!password || password.length < 8) {
    throw new Error('Passwort muss mindestens 8 Zeichen lang sein');
  }

  // Validate role
  if (!['admin', 'uploader', 'user'].includes(role)) {
    throw new Error('Rolle muss "admin", "uploader" oder "user" sein');
  }

  // Check if username already exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing) {
    throw new Error('Benutzername bereits vergeben');
  }

  // Hash password
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  // Generate user ID
  const userId = uuidv4();
  const createdAt = new Date().toISOString();

  // Insert user
  const stmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, display_name, created_at, created_by, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  stmt.run(userId, username.toLowerCase(), passwordHash, role, displayName || username, createdAt, createdBy);

  // Log audit entry
  logAudit(userId, 'user_created', username, `User created with role: ${role}`);

  return {
    id: userId,
    username: username.toLowerCase(),
    role,
    displayName: displayName || username,
    createdAt,
    isActive: true
  };
}

// Get user by username
function getUserByUsername(username) {
  const db = getDatabase();
  const user = db.prepare(`
    SELECT id, username, password_hash, role, display_name, is_active, created_at, last_login
    FROM users
    WHERE username = ?
  `).get(username.toLowerCase());

  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    passwordHash: user.password_hash,
    role: user.role,
    displayName: user.display_name,
    isActive: user.is_active === 1,
    createdAt: user.created_at,
    lastLogin: user.last_login
  };
}

// Get user by ID
function getUserById(userId) {
  const db = getDatabase();
  const user = db.prepare(`
    SELECT id, username, role, display_name, is_active, created_at, last_login
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    isActive: user.is_active === 1,
    createdAt: user.created_at,
    lastLogin: user.last_login
  };
}

// Verify user password
function verifyPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user || !user.isActive) return false;

  return bcrypt.compareSync(password, user.passwordHash);
}

// Update user's last login timestamp
function updateLastLogin(username) {
  const db = getDatabase();
  const timestamp = new Date().toISOString();

  db.prepare('UPDATE users SET last_login = ? WHERE username = ?')
    .run(timestamp, username.toLowerCase());
}

// Get all users (excluding password hashes)
function getAllUsers() {
  const db = getDatabase();
  const users = db.prepare(`
    SELECT id, username, role, display_name, is_active, created_at, created_by, last_login
    FROM users
    ORDER BY created_at DESC
  `).all();

  return users.map(user => ({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    isActive: user.is_active === 1,
    createdAt: user.created_at,
    createdBy: user.created_by,
    lastLogin: user.last_login
  }));
}

// Update user
function updateUser(userId, updates, updatedBy) {
  const db = getDatabase();

  // Get current user
  const currentUser = getUserById(userId);
  if (!currentUser) {
    throw new Error('Benutzer nicht gefunden');
  }

  // Validate and handle username change
  if (updates.username && updates.username !== currentUser.username) {
    // Validate new username
    if (updates.username.length < 3 || updates.username.length > 30) {
      throw new Error('Benutzername muss zwischen 3 und 30 Zeichen lang sein');
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(updates.username)) {
      throw new Error('Benutzername darf nur Buchstaben, Zahlen, Punkt, _ und - enthalten');
    }

    // Check if new username is already taken
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(updates.username.toLowerCase(), userId);
    if (existing) {
      throw new Error('Benutzername bereits vergeben');
    }
  }

  // Build update query dynamically
  const allowedFields = ['username', 'display_name', 'role', 'is_active'];
  const updateFields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(snakeKey)) {
      updateFields.push(`${snakeKey} = ?`);
      // Lowercase username for case-insensitive storage
      values.push(snakeKey === 'username' ? value.toLowerCase() : value);
    }
  }

  if (updateFields.length === 0) {
    throw new Error('Keine gültigen Felder zum Aktualisieren');
  }

  // Validate role if being updated
  if (updates.role && !['admin', 'uploader', 'user'].includes(updates.role)) {
    throw new Error('Rolle muss "admin", "uploader" oder "user" sein');
  }

  // Check if trying to deactivate the last admin
  if (updates.isActive === false && currentUser.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get('admin').count;
    if (adminCount <= 1) {
      throw new Error('Der letzte Administrator kann nicht deaktiviert werden');
    }
  }

  // Check if trying to demote the last admin
  if (updates.role === 'user' && currentUser.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get('admin').count;
    if (adminCount <= 1) {
      throw new Error('Der letzte Administrator kann nicht herabgestuft werden');
    }
  }

  values.push(userId);

  const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  db.prepare(query).run(...values);

  // Log audit entry
  logAudit(updatedBy, 'user_updated', currentUser.username, JSON.stringify(updates));

  return getUserById(userId);
}

// Reset user password
function resetUserPassword(userId, newPassword, resetBy) {
  const db = getDatabase();

  if (!newPassword || newPassword.length < 8) {
    throw new Error('Passwort muss mindestens 8 Zeichen lang sein');
  }

  const user = getUserById(userId);
  if (!user) {
    throw new Error('Benutzer nicht gefunden');
  }

  const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(passwordHash, userId);

  // Log audit entry
  logAudit(resetBy, 'password_reset', user.username, 'Password reset by admin');

  return true;
}

// Delete user
function deleteUser(userId, deletedBy) {
  const db = getDatabase();

  const user = getUserById(userId);
  if (!user) {
    throw new Error('Benutzer nicht gefunden');
  }

  // Prevent deleting the last admin
  if (user.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get('admin').count;
    if (adminCount <= 1) {
      throw new Error('Der letzte Administrator kann nicht gelöscht werden');
    }
  }

  // Soft delete by setting is_active to 0
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);

  // Log audit entry
  logAudit(deletedBy, 'user_deleted', user.username, 'User deactivated');

  return true;
}

// Count users by role
function countUsersByRole(role) {
  const db = getDatabase();
  return db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1').get(role).count;
}

// Audit logging
function logAudit(userId, action, targetUser = null, details = null) {
  const db = getDatabase();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO audit_log (timestamp, user_id, action, target_user, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(timestamp, userId, action, targetUser, details);
}

// Get audit log (for admin viewing)
function getAuditLog(limit = 100) {
  const db = getDatabase();
  return db.prepare(`
    SELECT a.timestamp, u.username, a.action, a.target_user, a.details
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.timestamp DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  verifyPassword,
  updateLastLogin,
  getAllUsers,
  updateUser,
  resetUserPassword,
  deleteUser,
  countUsersByRole,
  logAudit,
  getAuditLog
};
