require('dotenv').config();
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const {
  verifyPassword,
  updateLastLogin,
  getUserByUsername,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  logAudit
} = require('./lib/userManager');

const {
  getAllFaqItems,
  getAllFaqItemsWithVotes,
  getFaqItemById,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  castVote,
  countFaqItems,
  countFaqCategories
} = require('./lib/faqManager');

const {
  getUserFavorites,
  addFavorite,
  removeFavorite,
  countAllFavorites
} = require('./lib/favoritesManager');

const { getDatabase } = require('./lib/database');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.resolve(process.env.IMAGES_DIR || './media');
const SESSION_SECRET = process.env.SESSION_SECRET;
const USE_SECURE_COOKIES = process.env.USE_SECURE_COOKIES === 'true';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '86400000');

// Security check: ensure required environment variables are set
if (!SESSION_SECRET) {
  console.error('ERROR: SESSION_SECRET must be set in .env file');
  console.error('Run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('Then add the output to your .env file as SESSION_SECRET=<output>');
  process.exit(1);
}

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: USE_SECURE_COOKIES ? [] : null, // Only upgrade when using HTTPS
    },
  },
  hsts: USE_SECURE_COOKIES ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false  // Disable HSTS when not using HTTPS
}));

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Zu viele Login-Versuche. Bitte versuchen Sie es später erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Zu viele Anfragen. Bitte verlangsamen Sie.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(express.json({ limit: '10kb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Don't use default name
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true, // Prevent XSS attacks
    secure: USE_SECURE_COOKIES, // Only send over HTTPS in production
    sameSite: 'strict', // CSRF protection
  }
}));

// Apply API rate limiting to all /api routes
app.use('/api', apiLimiter);

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated && req.session.userId) {
    // Verify user still exists and is active
    const user = getUserById(req.session.userId);
    if (user && user.isActive) {
      req.user = user; // Attach user to request
      next();
    } else {
      // User was deleted or deactivated
      req.session.destroy(() => {
        res.status(401).json({ error: 'Unauthorized' });
      });
    }
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.session.authenticated && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user && user.isActive && user.role === 'admin') {
      req.user = user;
      next();
    } else {
      res.status(403).json({ error: 'Admin access required' });
    }
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Uploader middleware (allows admin and uploader roles)
function requireUploader(req, res, next) {
  if (req.session.authenticated && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user && user.isActive && (user.role === 'admin' || user.role === 'uploader')) {
      req.user = user;
      next();
    } else {
      res.status(403).json({ error: 'Upload access required' });
    }
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Routes
app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
    }

    // Verify username and password
    const isValid = verifyPassword(username, password);

    if (isValid) {
      const user = getUserByUsername(username);

      // Regenerate session ID after login to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ error: 'Login fehlgeschlagen' });
        }

        // Store user info in session
        req.session.authenticated = true;
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;

        // Update last login timestamp
        updateLastLogin(username);

        res.json({
          success: true,
          user: {
            username: user.username,
            displayName: user.displayName,
            role: user.role
          }
        });
      });
    } else {
      // Add small delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login fehlgeschlagen' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('sessionId');
    res.json({ success: true });
  });
});

app.get('/check-auth', (req, res) => {
  if (req.session.authenticated && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user && user.isActive) {
      return res.json({
        authenticated: true,
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role
        }
      });
    }
  }
  res.json({ authenticated: false });
});

// Helper function to check if file is media
function isMediaFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
}

function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
}

// Get list of images, videos, and folders
app.get('/api/browse', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.query.path || '';

    // Security: validate path
    if (requestedPath.includes('..') || requestedPath.includes('\\')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.join(IMAGES_DIR, requestedPath);
    const normalizedPath = path.normalize(fullPath);

    // Security check: ensure path is within IMAGES_DIR
    if (!normalizedPath.startsWith(IMAGES_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const folders = [];
    const files = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip hidden folders
        if (entry.name.startsWith('.')) continue;

        folders.push({
          name: entry.name,
          type: 'folder',
          path: requestedPath ? `${requestedPath}/${entry.name}` : entry.name
        });
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        files.push({
          name: entry.name,
          type: isVideoFile(entry.name) ? 'video' : 'image',
          path: requestedPath ? `${requestedPath}/${entry.name}` : entry.name
        });
      }
    }

    // Sort: folders first (alphabetically), then files (alphabetically)
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      currentPath: requestedPath,
      folders: folders,
      files: files
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Legacy endpoint - just redirect to browse
app.get('/api/images', (req, res) => {
  const path = req.query.path || '';
  const newUrl = `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`;
  res.redirect(newUrl);
});

// Serve individual images/videos (supports paths)
app.get('/api/media/*', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.params[0];

    // Validate path - no parent directory references
    if (requestedPath.includes('..')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filepath = path.join(IMAGES_DIR, requestedPath);

    // Security check: prevent directory traversal
    const normalizedPath = path.normalize(filepath);
    if (!normalizedPath.startsWith(IMAGES_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check file exists
    await fs.access(filepath);

    // Check it's actually a media file
    if (!isMediaFile(path.basename(filepath))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.sendFile(filepath);
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Download multiple images as zip
app.post('/api/download', requireAuth, async (req, res) => {
  try {
    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images specified' });
    }

    // Limit number of files that can be downloaded at once
    if (images.length > 100) {
      return res.status(400).json({ error: 'Too many files requested' });
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=bilder.zip');

    // Create zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });

    archive.pipe(res);

    // Add each image to the archive
    for (const filePath of images) {
      // Validate path
      if (typeof filePath !== 'string' || filePath.includes('..')) {
        continue;
      }

      const fullPath = path.join(IMAGES_DIR, filePath);

      // Security check
      const normalizedPath = path.normalize(fullPath);
      if (!normalizedPath.startsWith(IMAGES_DIR)) {
        continue;
      }

      try {
        await fs.access(fullPath);
        // Use just the filename in the archive (not the full path)
        const filename = path.basename(filePath);
        archive.file(fullPath, { name: filename });
      } catch (error) {
        console.error(`File not found: ${filePath}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

// ===== ADMIN API ENDPOINTS =====

// Get all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Benutzer' });
  }
});

// Create new user
app.post('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const { username, password, role, displayName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
    }

    const user = createUser(
      username,
      password,
      role || 'user',
      displayName,
      req.session.username
    );

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update user
app.put('/api/admin/users/:userId', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Prevent admins from demoting themselves
    if (userId === req.session.userId && updates.role === 'user') {
      return res.status(403).json({ error: 'Sie können Ihre eigene Rolle nicht ändern' });
    }

    // Prevent admins from deactivating themselves
    if (userId === req.session.userId && updates.isActive === false) {
      return res.status(403).json({ error: 'Sie können sich nicht selbst deaktivieren' });
    }

    const user = updateUser(userId, updates, req.session.userId);

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Reset user password
app.post('/api/admin/users/:userId/reset-password', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Neues Passwort erforderlich' });
    }

    resetUserPassword(userId, newPassword, req.session.userId);

    res.json({
      success: true,
      message: 'Passwort erfolgreich zurückgesetzt'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.session.userId) {
      return res.status(403).json({ error: 'Sie können sich nicht selbst löschen' });
    }

    deleteUser(userId, req.session.userId);

    res.json({
      success: true,
      message: 'Benutzer erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===== USER PROFILE ENDPOINTS =====

// Change own password
app.post('/api/profile/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
    }

    // Verify current password
    const user = getUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const isValid = verifyPassword(user.username, currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    // Change password
    resetUserPassword(req.session.userId, newPassword, req.session.userId);

    res.json({
      success: true,
      message: 'Passwort erfolgreich geändert'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===== FILE UPLOAD ENDPOINTS =====

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use a temporary location, we'll move it in the route handler
    cb(null, IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    // Generate temporary unique filename
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[<>:"|?*\\\/]/g, '').replace(/\.\./g, '').trim();
    cb(null, `temp_${timestamp}_${sanitized}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov|avi|mkv)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Dateiformat nicht unterstützt'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Upload file endpoint
app.post('/api/admin/upload', requireUploader, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const targetPath = req.body.targetPath || '';
    const targetDir = path.join(IMAGES_DIR, targetPath);

    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Sanitize original filename
    const sanitized = req.file.originalname.replace(/[<>:"|?*\\\/]/g, '').replace(/\.\./g, '').trim();
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);

    // Find available filename (handle conflicts)
    let counter = 1;
    let finalFilename = sanitized;
    while (fsSync.existsSync(path.join(targetDir, finalFilename))) {
      finalFilename = `${base} (${counter})${ext}`;
      counter++;
    }

    // Move file from temp location to target location
    const tempPath = req.file.path;
    const finalPath = path.join(targetDir, finalFilename);
    await fs.rename(tempPath, finalPath);

    const relativePath = targetPath ? `${targetPath}/${finalFilename}` : finalFilename;

    console.log(`File uploaded: ${relativePath}`);

    res.json({
      success: true,
      filename: finalFilename,
      path: relativePath,
      size: req.file.size,
      type: req.file.mimetype.startsWith('image/') ? 'image' : 'video'
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file if it exists
    if (req.file && req.file.path) {
      fsSync.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: 'Upload fehlgeschlagen' });
  }
});

// Helper: validate a path is safe and resolves inside IMAGES_DIR.
// Returns the absolute resolved path, or null on rejection.
function resolveMediaPath(relativePath) {
  if (typeof relativePath !== 'string') return null;
  if (relativePath.includes('..') || relativePath.includes('\\')) return null;
  const fullPath = path.join(IMAGES_DIR, relativePath);
  const normalized = path.normalize(fullPath);
  if (!normalized.startsWith(IMAGES_DIR)) return null;
  return normalized;
}

// Rename a file or folder (same parent directory)
app.post('/api/admin/rename', requireUploader, async (req, res) => {
  try {
    const { path: targetPath, newName } = req.body;

    if (typeof targetPath !== 'string' || typeof newName !== 'string') {
      return res.status(400).json({ error: 'Pfad und neuer Name erforderlich' });
    }

    if (targetPath.length === 0) {
      return res.status(400).json({ error: 'Ungültiger Pfad' });
    }

    // Validate new name: only safe chars, no separators
    if (!/^[a-zA-Z0-9äöüÄÖÜß _.-]+$/.test(newName)) {
      return res.status(400).json({ error: 'Ungültiger Name' });
    }
    if (newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
      return res.status(400).json({ error: 'Ungültiger Name' });
    }

    const sourceAbs = resolveMediaPath(targetPath);
    if (!sourceAbs) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    // Compute new relative and absolute paths (same parent)
    const parentRel = path.posix.dirname(targetPath.replace(/\\/g, '/'));
    const parentIsRoot = parentRel === '.' || parentRel === '';
    const newRel = parentIsRoot ? newName : `${parentRel}/${newName}`;
    const newAbs = resolveMediaPath(newRel);
    if (!newAbs) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    // Source must exist
    try {
      await fs.access(sourceAbs);
    } catch {
      return res.status(404).json({ error: 'Quelle nicht gefunden' });
    }

    // Reject if target already exists (case-sensitive check; if same inode on case-insensitive FS
    // and only case is changing, allow rename by comparing absolute paths).
    if (sourceAbs !== newAbs) {
      try {
        await fs.access(newAbs);
        return res.status(409).json({ error: 'Ziel existiert bereits' });
      } catch {
        // Target does not exist, safe to proceed
      }
    }

    await fs.rename(sourceAbs, newAbs);

    try {
      logAudit(req.session.userId, 'RENAME', null, JSON.stringify({ fromPath: targetPath, toPath: newRel }));
    } catch (err) {
      console.error('Audit log error (RENAME):', err);
    }

    res.json({ success: true, newPath: newRel });
  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Fehler beim Umbenennen' });
  }
});

// Move multiple files/folders into a target folder
app.post('/api/admin/move', requireUploader, async (req, res) => {
  try {
    const { paths, targetFolder } = req.body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Pfade erforderlich' });
    }

    if (paths.length > 500) {
      return res.status(400).json({ error: 'Zu viele Einträge' });
    }

    if (typeof targetFolder !== 'string') {
      return res.status(400).json({ error: 'Zielordner erforderlich' });
    }

    // Resolve target folder (empty string = root)
    const targetAbs = targetFolder === ''
      ? IMAGES_DIR
      : resolveMediaPath(targetFolder);

    if (!targetAbs) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    // Ensure target exists and is a directory
    try {
      const stat = await fs.stat(targetAbs);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Zielordner ist kein Verzeichnis' });
      }
    } catch {
      return res.status(404).json({ error: 'Zielordner nicht gefunden' });
    }

    let moved = 0;
    const errors = [];

    for (const itemPath of paths) {
      if (typeof itemPath !== 'string' || itemPath.length === 0) {
        errors.push({ path: String(itemPath), error: 'Ungültiger Pfad' });
        continue;
      }

      const sourceAbs = resolveMediaPath(itemPath);
      if (!sourceAbs) {
        errors.push({ path: itemPath, error: 'Ungültiger Pfad' });
        continue;
      }

      const baseName = path.basename(sourceAbs);
      const destAbs = path.join(targetAbs, baseName);

      // Don't allow moving into itself or its own subtree (folder case)
      const sourceWithSep = sourceAbs + path.sep;
      if (destAbs === sourceAbs || targetAbs === sourceAbs || (targetAbs + path.sep).startsWith(sourceWithSep)) {
        errors.push({ path: itemPath, error: 'Kann nicht in sich selbst verschoben werden' });
        continue;
      }

      // Skip overwrites
      try {
        await fs.access(destAbs);
        errors.push({ path: itemPath, error: 'Ziel existiert bereits' });
        continue;
      } catch {
        // OK to proceed
      }

      try {
        await fs.access(sourceAbs);
      } catch {
        errors.push({ path: itemPath, error: 'Quelle nicht gefunden' });
        continue;
      }

      try {
        await fs.rename(sourceAbs, destAbs);
        moved++;

        const newRel = targetFolder === '' ? baseName : `${targetFolder}/${baseName}`;
        try {
          logAudit(req.session.userId, 'MOVE', null, JSON.stringify({ fromPath: itemPath, toPath: newRel }));
        } catch (err) {
          console.error('Audit log error (MOVE):', err);
        }
      } catch (err) {
        console.error('Move error for', itemPath, err);
        errors.push({ path: itemPath, error: 'Fehler beim Verschieben' });
      }
    }

    res.json({ success: true, moved, errors });
  } catch (error) {
    console.error('Move error:', error);
    res.status(500).json({ error: 'Fehler beim Verschieben' });
  }
});

// Delete files and/or folders (folders deleted recursively)
app.delete('/api/admin/media', requireUploader, async (req, res) => {
  try {
    const { paths } = req.body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Pfade erforderlich' });
    }

    if (paths.length > 500) {
      return res.status(400).json({ error: 'Zu viele Einträge' });
    }

    let deleted = 0;
    const errors = [];

    for (const itemPath of paths) {
      if (typeof itemPath !== 'string' || itemPath.length === 0) {
        errors.push({ path: String(itemPath), error: 'Ungültiger Pfad' });
        continue;
      }

      const targetAbs = resolveMediaPath(itemPath);
      if (!targetAbs) {
        errors.push({ path: itemPath, error: 'Ungültiger Pfad' });
        continue;
      }

      // Never allow deleting IMAGES_DIR itself
      if (targetAbs === IMAGES_DIR) {
        errors.push({ path: itemPath, error: 'Root-Verzeichnis kann nicht gelöscht werden' });
        continue;
      }

      try {
        await fs.access(targetAbs);
      } catch {
        errors.push({ path: itemPath, error: 'Nicht gefunden' });
        continue;
      }

      try {
        await fs.rm(targetAbs, { recursive: true, force: true });
        deleted++;
        try {
          logAudit(req.session.userId, 'DELETE_MEDIA', null, JSON.stringify({ path: itemPath }));
        } catch (err) {
          console.error('Audit log error (DELETE_MEDIA):', err);
        }
      } catch (err) {
        console.error('Delete error for', itemPath, err);
        errors.push({ path: itemPath, error: 'Fehler beim Löschen' });
      }
    }

    res.json({ success: true, deleted, errors });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
});

// Create folder endpoint
app.post('/api/admin/folders', requireUploader, async (req, res) => {
  try {
    const { folderName, parentPath } = req.body;

    if (!folderName || typeof folderName !== 'string') {
      return res.status(400).json({ error: 'Ordnername erforderlich' });
    }

    // Validate folder name
    if (!/^[a-zA-Z0-9äöüÄÖÜß _-]+$/.test(folderName)) {
      return res.status(400).json({ error: 'Ungültiger Ordnername' });
    }

    // Prevent path traversal
    if (folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      return res.status(400).json({ error: 'Ungültiger Ordnername' });
    }

    const parentFullPath = path.join(IMAGES_DIR, parentPath || '');
    const newFolderPath = path.join(parentFullPath, folderName);

    // Security check
    const normalizedPath = path.normalize(newFolderPath);
    if (!normalizedPath.startsWith(IMAGES_DIR)) {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }

    // Check if folder already exists
    try {
      await fs.access(newFolderPath);
      return res.status(400).json({ error: 'Ordner existiert bereits' });
    } catch (error) {
      // Folder doesn't exist, continue
    }

    // Create folder
    await fs.mkdir(newFolderPath, { recursive: true });

    const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName;

    res.json({
      success: true,
      path: relativePath,
      message: 'Ordner erfolgreich erstellt'
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Ordners' });
  }
});

// ===== FAQ API ENDPOINTS =====

// Get all FAQ items (accessible to all authenticated users). Includes upvotes,
// downvotes, and this user's current vote for each item.
app.get('/api/faq', requireAuth, (req, res) => {
  try {
    const items = getAllFaqItemsWithVotes(req.session.userId);
    res.json({ items });
  } catch (error) {
    console.error('Get FAQ items error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der FAQ-Einträge' });
  }
});

// Vote on a FAQ item. Body: { vote: 1 | -1 | 0 } (0 removes the vote).
app.post('/api/faq/:id/vote', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { vote } = req.body;

    if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
      return res.status(400).json({ error: 'Ungültige FAQ-ID' });
    }

    if (typeof vote !== 'number' || ![1, -1, 0].includes(vote)) {
      return res.status(400).json({ error: 'Stimme muss 1, -1 oder 0 sein' });
    }

    const result = castVote(id, req.session.userId, vote);

    res.json({
      success: true,
      upvotes: result.upvotes,
      downvotes: result.downvotes,
      userVote: result.userVote
    });
  } catch (error) {
    console.error('FAQ vote error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create FAQ item (admin only)
app.post('/api/faq', requireAdmin, (req, res) => {
  try {
    const { question, answer, category, displayOrder } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Frage und Antwort erforderlich' });
    }

    const item = createFaqItem(
      question,
      answer,
      category || null,
      displayOrder || 0,
      req.session.username
    );

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Create FAQ item error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update FAQ item (admin only)
app.put('/api/faq/:itemId', requireAdmin, (req, res) => {
  try {
    const { itemId } = req.params;
    const updates = req.body;

    const item = updateFaqItem(itemId, updates, req.session.username);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Update FAQ item error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete FAQ item (admin only)
app.delete('/api/faq/:itemId', requireAdmin, (req, res) => {
  try {
    const { itemId } = req.params;

    deleteFaqItem(itemId, req.session.username);

    res.json({
      success: true,
      message: 'FAQ-Eintrag erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Delete FAQ item error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===== FAVORITES API ENDPOINTS =====

// Get the authenticated user's favorites
app.get('/api/favorites', requireAuth, (req, res) => {
  try {
    const favorites = getUserFavorites(req.session.userId);
    res.json({ favorites });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Favoriten' });
  }
});

// Add a favorite. Idempotent - adding an existing favorite returns success.
app.post('/api/favorites', requireAuth, (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Pfad muss eine Zeichenkette sein' });
    }

    addFavorite(req.session.userId, filePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Remove a favorite. Idempotent - removing a non-existent favorite returns success.
app.delete('/api/favorites', requireAuth, (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Pfad muss eine Zeichenkette sein' });
    }

    removeFavorite(req.session.userId, filePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ===== ADMIN DASHBOARD + AUDIT ENDPOINTS =====

// Recursively walk a directory to count files/folders and sum sizes.
// Skips symlinks, hidden entries, and errors on individual files.
async function walkMediaStats(rootDir) {
  let totalFiles = 0;
  let totalFolders = 0;
  let storageBytes = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      // Skip unreadable directories
      return;
    }

    for (const entry of entries) {
      // Skip hidden entries
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      // Skip symlinks to avoid cycles and unsafe paths
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        totalFolders++;
        await walk(fullPath);
      } else if (entry.isFile()) {
        totalFiles++;
        try {
          const stat = await fs.stat(fullPath);
          storageBytes += stat.size;
        } catch (err) {
          // Skip files we can't stat
        }
      }
    }
  }

  try {
    await walk(rootDir);
  } catch (err) {
    console.error('Media stats walk error:', err);
  }

  return { totalFiles, totalFolders, storageBytes };
}

// Admin dashboard stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const db = getDatabase();

    // User stats
    const userCounts = db.prepare(`
      SELECT role, COUNT(*) as count
      FROM users
      WHERE is_active = 1
      GROUP BY role
    `).all();

    const userStats = { admin: 0, uploader: 0, user: 0, total: 0, activeLast7Days: 0 };
    for (const row of userCounts) {
      if (row.role in userStats) {
        userStats[row.role] = row.count;
      }
      userStats.total += row.count;
    }

    // Active users in last 7 days
    const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const activeRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM users
      WHERE is_active = 1 AND last_login IS NOT NULL AND last_login >= ?
    `).get(cutoff);
    userStats.activeLast7Days = activeRow.count;

    // FAQ stats
    const faqStats = {
      total: countFaqItems(),
      categories: countFaqCategories()
    };

    // Media stats (walk IMAGES_DIR)
    const mediaStats = await walkMediaStats(IMAGES_DIR);

    // Favorites stats
    const favoritesStats = {
      total: countAllFavorites()
    };

    // Activity stats
    // TODO: upload history is not tracked yet; uploadsLast7Days is always 0 for now
    const activityStats = {
      uploadsLast7Days: 0
    };

    res.json({
      users: userStats,
      faq: faqStats,
      media: mediaStats,
      favorites: favoritesStats,
      activity: activityStats
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Statistiken' });
  }
});

// Admin audit log listing
app.get('/api/admin/audit-log', requireAdmin, (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 500) limit = 500;

    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const db = getDatabase();

    const rows = db.prepare(`
      SELECT a.id, a.timestamp, a.user_id, u.username, a.action, a.target_user, a.details
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

    const entries = rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      targetUser: row.target_user,
      details: row.details
    }));

    res.json({ entries, total });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Audit-Logs' });
  }
});

// Bulk user actions: activate, deactivate, delete
app.post('/api/admin/users/bulk', requireAdmin, (req, res) => {
  try {
    const { userIds, action } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Benutzer-IDs erforderlich' });
    }

    if (userIds.length > 500) {
      return res.status(400).json({ error: 'Zu viele Benutzer-IDs' });
    }

    if (!['activate', 'deactivate', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Ungültige Aktion' });
    }

    let affected = 0;
    let skipped = 0;
    const errors = [];

    for (const userId of userIds) {
      if (typeof userId !== 'string' || userId.length === 0) {
        skipped++;
        errors.push({ userId: String(userId), error: 'Ungültige Benutzer-ID' });
        continue;
      }

      // Prevent self-harm on destructive actions
      if ((action === 'deactivate' || action === 'delete') && userId === req.session.userId) {
        skipped++;
        errors.push({ userId, error: 'Sie können sich nicht selbst bearbeiten' });
        continue;
      }

      try {
        if (action === 'activate') {
          updateUser(userId, { isActive: true }, req.session.userId);
          logAudit(req.session.userId, 'BULK_USER_ACTIVATE', userId, 'Bulk activation');
          affected++;
        } else if (action === 'deactivate') {
          updateUser(userId, { isActive: false }, req.session.userId);
          logAudit(req.session.userId, 'BULK_USER_DEACTIVATE', userId, 'Bulk deactivation');
          affected++;
        } else if (action === 'delete') {
          deleteUser(userId, req.session.userId);
          logAudit(req.session.userId, 'BULK_USER_DELETE', userId, 'Bulk deletion');
          affected++;
        }
      } catch (err) {
        skipped++;
        errors.push({ userId, error: err.message });
      }
    }

    res.json({
      success: true,
      affected,
      skipped,
      errors
    });
  } catch (error) {
    console.error('Bulk user action error:', error);
    res.status(500).json({ error: 'Fehler bei Massen-Aktion' });
  }
});

// Serve static files
app.use(express.static('public', {
  maxAge: '1d', // Cache static assets for 1 day
  etag: true
}));

// Serve HTML documents from root (with authentication)
const htmlDocuments = [
  'Fall 2 - Glühende Hallen Vertraulicher Bericht.html',
  'Fall 2 - Krellins Verzweiflungsnotizen.html',
  'Fall 2 - Medizinisches Beobachtungsprotokoll.html',
  'Fall 2 - Stadtwache Einbruchsbericht.html',
  'Fall 2 - Torvalds Forschungstagebuch.html',
  'Fenris_Tagebuch.html',
  'Goblin-Lösegeld-Notiz.html',
  'eisenhafen-bote.html'
];

htmlDocuments.forEach(filename => {
  app.get(`/${filename}`, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, filename));
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Image Gallery Server running on http://localhost:${PORT}`);
  console.log(`Images directory: ${IMAGES_DIR}`);
  console.log(`Security: Rate limiting enabled, password hashing enabled`);
  console.log(`HTTPS mode: ${USE_SECURE_COOKIES ? 'enabled' : 'disabled'}`);
  if (!USE_SECURE_COOKIES) {
    console.warn('WARNING: Running without HTTPS. Set USE_SECURE_COOKIES=true when using HTTPS.');
  }
});
