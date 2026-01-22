require('dotenv').config();
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.resolve(process.env.IMAGES_DIR || './images');
const PASSWORD_HASH = process.env.PASSWORD_HASH;
const SESSION_SECRET = process.env.SESSION_SECRET;
const USE_SECURE_COOKIES = process.env.USE_SECURE_COOKIES === 'true';
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '86400000');

// Security check: ensure required environment variables are set
if (!PASSWORD_HASH || !SESSION_SECRET) {
  console.error('ERROR: PASSWORD_HASH and SESSION_SECRET must be set in .env file');
  console.error('See .env.example for instructions');
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
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Routes
app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Compare password with bcrypt hash
    const isValid = await bcrypt.compare(password, PASSWORD_HASH);

    if (isValid) {
      req.session.authenticated = true;
      // Regenerate session ID after login to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        req.session.authenticated = true;
        res.json({ success: true });
      });
    } else {
      // Add small delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
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
  res.json({ authenticated: !!req.session.authenticated });
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
