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
  deleteUser
} = require('./lib/userManager');

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

// Serve static files
app.use(express.static('public', {
  maxAge: '1d', // Cache static assets for 1 day
  etag: true
}));

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
