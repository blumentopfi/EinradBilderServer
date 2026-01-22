# Einrad Bildergalerie - Project Documentation

This document contains a complete overview of the image gallery application built with Claude Code.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Configuration](#configuration)
6. [Security Features](#security-features)
7. [API Endpoints](#api-endpoints)
8. [Frontend Architecture](#frontend-architecture)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

A self-hosted, password-protected image and video gallery application with folder navigation support. Designed for deployment on Raspberry Pi and internet exposure with proper security measures.

**Primary Use Case:** Organize and share unicycle-related images and videos with a clean, branded interface.

---

## ✨ Features

### Core Functionality
- **Media Gallery**: Display images (JPG, PNG, GIF, WebP, BMP) and videos (MP4, WebM, MOV, AVI, MKV)
- **Folder Navigation**: Hierarchical folder structure with breadcrumb navigation
- **Multi-Select**: Select multiple files with checkboxes
- **Bulk Download**: Download selected files as a ZIP archive
- **Preview Modal**: Full-screen preview with keyboard navigation (arrow keys, ESC)
- **Video Preview**: Hover over video thumbnails for muted auto-play preview

### Organization
- Folder-based organization
- Breadcrumb navigation (🏠 Start / Folder1 / Folder2)
- Back button for quick navigation
- Smart sorting (folders first, then files, both alphabetical)

### User Interface
- Unicycle-themed branding with custom icon
- German language throughout
- Responsive design (mobile & desktop)
- Clean, modern UI with neutral background
- Orange accent colors matching unicycle theme

### Security (Production-Ready)
- Password hashing with bcrypt
- Rate limiting (5 login attempts per 15 minutes)
- Session security (httpOnly, sameSite cookies)
- Security headers (Helmet.js)
- Path traversal protection
- Input validation on all endpoints
- CSRF protection
- Environment variable configuration

---

## 🛠 Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **express-session** - Session management
- **bcrypt** - Password hashing
- **express-rate-limit** - Rate limiting
- **helmet** - Security headers
- **archiver** - ZIP file creation
- **dotenv** - Environment variable management

### Frontend
- **Vanilla JavaScript** - No frameworks
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with animations
- **Fetch API** - AJAX requests

---

## 📁 Project Structure

```
EinradBilderServer/
├── server.js                 # Express server with API routes
├── package.json              # Node.js dependencies
├── .env                      # Environment variables (SECRET - not in git)
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
├── config.json              # Legacy config (deprecated)
├── generate-password.js     # Password hash generator utility
│
├── public/                  # Frontend files
│   ├── index.html          # Main HTML
│   ├── styles.css          # Styling
│   ├── app.js              # Frontend JavaScript
│   └── unicycle.png        # Branding logo
│
├── media/                   # Media directory (configurable)
│   ├── .gitkeep
│   ├── 2024/               # Example folder structure
│   ├── 2025/
│   └── Events/
│
├── README.md               # Installation & usage guide
├── SECURITY.md             # Security deployment guide
└── CLAUDE.md              # This file - complete documentation
```

---

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Server Configuration
PORT=3000
IMAGES_DIR=./media

# Security - IMPORTANT: Change these values!
SESSION_SECRET=<random-32-byte-hex-string>
PASSWORD_HASH=<bcrypt-hash>

# Session Configuration (24 hours in milliseconds)
SESSION_MAX_AGE=86400000

# Set to 'true' when using HTTPS
USE_SECURE_COOKIES=false
```

### Generate Secure Values

**Session Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Password Hash:**
```bash
node generate-password.js
# Or:
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(hash => console.log(hash))"
```

---

## 🔒 Security Features

### Authentication
- **Bcrypt Password Hashing**: Passwords stored as irreversible hashes
- **Session Management**: Secure session cookies with httpOnly and sameSite flags
- **Session Regeneration**: New session ID after login (prevents session fixation)
- **Timing Attack Protection**: 1-second delay on failed login attempts

### Rate Limiting
- **Login Endpoint**: 5 attempts per 15 minutes per IP
- **API Endpoints**: 100 requests per minute per IP
- Automatic IP-based blocking

### Security Headers (Helmet.js)
- **Content Security Policy**: Restricts resource loading
- **HSTS**: HTTP Strict Transport Security (when HTTPS enabled)
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **XSS Protection**: Cross-site scripting protection

### Input Validation
- Path traversal prevention (multiple layers)
- Filename validation
- Request payload size limits (10KB)
- Type checking on all inputs

### Additional Security
- Hidden folders (starting with .) are ignored
- Download limit: max 100 files per request
- Proper error handling (no information leakage)
- Environment variable configuration (secrets not in code)

---

## 🌐 API Endpoints

### Authentication

#### POST `/login`
Authenticate user with password.

**Request:**
```json
{
  "password": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

**Rate Limit:** 5 attempts per 15 minutes

---

#### POST `/logout`
Destroy session and logout.

**Response:**
```json
{
  "success": true
}
```

---

#### GET `/check-auth`
Check if user is authenticated.

**Response:**
```json
{
  "authenticated": true
}
```

---

### Media Browsing

#### GET `/api/browse?path=<folder-path>`
Get folders and files in a directory.

**Parameters:**
- `path` (optional): Relative path from media root

**Response:**
```json
{
  "currentPath": "2024/Summer",
  "folders": [
    {
      "name": "Events",
      "type": "folder",
      "path": "2024/Summer/Events"
    }
  ],
  "files": [
    {
      "name": "photo.jpg",
      "type": "image",
      "path": "2024/Summer/photo.jpg"
    },
    {
      "name": "video.mp4",
      "type": "video",
      "path": "2024/Summer/video.mp4"
    }
  ]
}
```

---

#### GET `/api/media/<file-path>`
Serve individual media file.

**Example:** `/api/media/2024/Summer/photo.jpg`

**Response:** File content with appropriate content-type

---

#### POST `/api/download`
Download multiple files as ZIP.

**Request:**
```json
{
  "images": [
    "2024/photo1.jpg",
    "2024/photo2.jpg"
  ]
}
```

**Response:** ZIP file (`bilder.zip`)

**Limits:**
- Max 100 files per request
- Rate limited to 100 requests/minute

---

### Legacy Endpoints

#### GET `/api/images`
Redirects to `/api/browse` for backwards compatibility.

---

## 🎨 Frontend Architecture

### State Management

```javascript
let images = [];           // Current files in view
let folders = [];          // Current folders in view
let currentPath = '';      // Current directory path
let selectedImages = new Set();  // Selected file paths
let currentPreviewIndex = -1;    // Preview modal state
```

### Key Functions

#### Navigation
- `loadImages(path)` - Load folder contents
- `renderBreadcrumb()` - Render navigation breadcrumbs
- `renderGallery()` - Render folders and files

#### Media Cards
- `createFolderCard(folder)` - Create folder card element
- `createMediaCard(fileObj, index)` - Create image/video card
- `createBackButton()` - Create back navigation button

#### Selection
- `toggleSelection(path, card)` - Toggle file selection
- `updateSelectedCount()` - Update selected count display

#### Preview
- `openPreview(index)` - Open preview modal
- `updatePreview()` - Update preview content
- `showPrevImage()` / `showNextImage()` - Navigate preview

---

## 🚀 Deployment

### Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Generate password hash
node generate-password.js

# Start server
npm start
```

Server runs at `http://localhost:3000`

---

### Raspberry Pi Production

#### 1. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Setup Project
```bash
cd /home/pi
# Copy project files
npm install
```

#### 3. Configure Environment
```bash
cp .env.example .env
nano .env
# Set strong password and session secret
```

#### 4. Setup HTTPS (REQUIRED for internet deployment)

**Option A: Nginx + Let's Encrypt**
```bash
sudo apt install nginx certbot python3-certbot-nginx

# Configure nginx (see SECURITY.md for full config)
sudo nano /etc/nginx/sites-available/gallery

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Update .env
USE_SECURE_COOKIES=true
```

**Option B: Cloudflare Tunnel**
```bash
# Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Setup tunnel (see SECURITY.md for full guide)
cloudflared tunnel login
cloudflared tunnel create gallery
```

#### 5. Process Management with PM2
```bash
sudo npm install -g pm2

# Start application
pm2 start server.js --name gallery

# Enable startup script
pm2 startup
pm2 save

# View logs
pm2 logs gallery
```

#### 6. Firewall Configuration
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Do NOT expose port 3000 directly
```

---

## 🐛 Troubleshooting

### HSTS Protocol Error

**Problem:** Browser shows `ERR_SSL_PROTOCOL_ERROR` on `http://localhost:3000`

**Cause:** Browser cached HSTS header forcing HTTPS

**Solution:**
1. **Chrome/Edge**: Go to `chrome://net-internals/#hsts`, delete `localhost`
2. **Firefox**: Delete `SiteSecurityServiceState.txt` from profile
3. **Safari**: Delete `~/Library/Cookies/HSTS.plist`
4. **Quick Fix**: Use Incognito/Private window

---

### Images Not Loading

**Problem:** "Keine Medien im Verzeichnis gefunden"

**Check:**
1. Verify `IMAGES_DIR` in `.env` points to correct directory
2. Check file permissions: `ls -la media/`
3. Verify supported formats: JPG, PNG, GIF, WebP, BMP, MP4, WebM, MOV, AVI, MKV
4. Check server logs for errors

---

### Login Issues

**Problem:** "Ungültiges Passwort" even with correct password

**Check:**
1. Verify `PASSWORD_HASH` in `.env` is correct bcrypt hash
2. Regenerate hash: `node generate-password.js`
3. Check if rate limited (5 attempts per 15 min)
4. Check server logs for errors

---

### Rate Limit Exceeded

**Problem:** "Zu viele Login-Versuche"

**Solution:**
- Wait 15 minutes
- Or restart server to clear rate limit counter (development only)

---

### Download Fails

**Problem:** ZIP download doesn't start

**Check:**
1. Verify files selected (check selection count)
2. Check browser console for errors
3. Verify file paths are valid
4. Check server logs
5. Try with fewer files (limit: 100 files)

---

### Video Preview Not Working

**Problem:** Videos don't play on hover

**Check:**
1. Browser supports video format (MP4 most compatible)
2. Video file not corrupted
3. File size reasonable (large files may be slow)
4. Check browser console for errors

---

## 📝 Developer Notes

### Adding New Media Formats

Edit `server.js`:
```javascript
function isMediaFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', /* ADD HERE */].includes(ext);
}
```

### Changing Session Duration

Edit `.env`:
```bash
# 24 hours = 86400000 milliseconds
SESSION_MAX_AGE=86400000
```

### Customizing Rate Limits

Edit `server.js`:
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts
  // ...
});
```

### Customizing Branding

Replace files:
- `public/unicycle.png` - Logo image
- `public/styles.css` - Colors and styling
- `public/index.html` - Text and titles

Color scheme:
- Primary: `#ff6b35` (orange)
- Secondary: `#f7931e` (gold)
- Background: `#f5f7fa` (light gray)

---

## 🔐 Security Checklist Before Internet Deployment

- [ ] HTTPS configured (nginx + Let's Encrypt OR Cloudflare)
- [ ] `USE_SECURE_COOKIES=true` in .env
- [ ] Strong password set (12+ characters, mixed case, numbers, symbols)
- [ ] Session secret is random and unique
- [ ] `.env` file has restrictive permissions (`chmod 600 .env`)
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] Port 3000 NOT exposed directly to internet
- [ ] PM2 or systemd configured for auto-restart
- [ ] Log monitoring setup
- [ ] Backup strategy in place
- [ ] Domain DNS configured
- [ ] SSL certificate auto-renewal tested

---

## 📚 Additional Resources

- **Installation Guide**: `README.md`
- **Security Guide**: `SECURITY.md`
- **Password Generator**: `generate-password.js`
- **Environment Template**: `.env.example`

---

## 🎯 Future Enhancement Ideas

- [ ] User accounts with different permission levels
- [ ] Image upload through web interface
- [ ] Image editing (crop, rotate, resize)
- [ ] Comments on images
- [ ] Tags and search functionality
- [ ] Slideshow mode
- [ ] Share links with expiration
- [ ] Two-factor authentication
- [ ] Mobile app
- [ ] Image metadata display (EXIF data)
- [ ] Favorites/starring system
- [ ] Album creation

---

## 📄 License

This project was built with Claude Code for personal/educational use.

---

## 🙋 Support

For issues and questions:
1. Check this documentation
2. Review `SECURITY.md` for security-related issues
3. Check server logs: `pm2 logs gallery` or console output
4. Review browser console for frontend errors

---

**Last Updated:** 2026-01-22
**Version:** 1.0.0
**Author:** Built with Claude Code
