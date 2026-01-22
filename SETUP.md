# Setup Guide - Multi-User Authentication

This guide will help you set up the Einrad Bildergalerie with SQLite-based multi-user authentication.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `better-sqlite3` - SQLite database
- `uuid` - User ID generation
- All existing dependencies (express, bcrypt, etc.)

---

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your `SESSION_SECRET`:

```bash
# Generate a random session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it into your `.env` file:

```env
SESSION_SECRET=<paste-the-generated-secret-here>
```

**Example `.env` file:**
```env
PORT=3000
IMAGES_DIR=./media
DB_PATH=./gallery.db
SESSION_SECRET=a1b2c3d4e5f6... (your generated secret)
SESSION_MAX_AGE=86400000
USE_SECURE_COOKIES=false
```

---

### 3. Create Admin User

Run the interactive setup script:

```bash
npm run setup
```

or

```bash
node setup-admin.js
```

The script will prompt you for:
- **Benutzername** (username): 3-30 characters, lowercase, alphanumeric + `-` and `_`
- **Anzeigename** (display name): Optional friendly name
- **Passwort** (password): Minimum 8 characters
- **Passwort bestätigen** (confirm password)

**Example:**
```
Benutzername: admin
Anzeigename: Administrator
Passwort: SecurePass123
Passwort bestätigen: SecurePass123
```

---

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

---

### 5. Login

1. Open your browser to `http://localhost:3000`
2. Enter your username and password
3. You'll see "Angemeldet als: [Your Display Name]" in the header
4. As an admin, you'll see an "Admin-Bereich" button (coming soon!)

---

## Database Structure

The application uses SQLite with the following tables:

### `users` Table
- `id` - Unique UUID
- `username` - Unique username (lowercase)
- `password_hash` - Bcrypt password hash
- `role` - 'admin' or 'user'
- `display_name` - Friendly display name
- `is_active` - Active status (1 = active, 0 = deactivated)
- `created_at` - ISO 8601 timestamp
- `created_by` - Username of creator
- `last_login` - ISO 8601 timestamp of last login

### `audit_log` Table
- `id` - Auto-increment ID
- `timestamp` - ISO 8601 timestamp
- `user_id` - User who performed the action
- `action` - Action type (user_created, user_updated, etc.)
- `target_user` - Target of the action
- `details` - JSON details

---

## Admin API Endpoints

All admin endpoints require authentication with an admin role.

### Get All Users
```http
GET /api/admin/users
Authorization: Session cookie
```

### Create User
```http
POST /api/admin/users
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "role": "user",
  "displayName": "New User"
}
```

### Update User
```http
PUT /api/admin/users/:userId
Content-Type: application/json

{
  "displayName": "Updated Name",
  "role": "admin",
  "isActive": true
}
```

### Reset Password
```http
POST /api/admin/users/:userId/reset-password
Content-Type: application/json

{
  "newPassword": "newpassword123"
}
```

### Delete User (Soft Delete)
```http
DELETE /api/admin/users/:userId
```

---

## Security Features

### Password Requirements
- Minimum 8 characters
- Bcrypt hashing (10 rounds)
- Passwords never stored in plain text

### Admin Protections
- Cannot delete the last admin user
- Cannot demote the last admin user
- Admins cannot delete or deactivate themselves
- Cannot demote themselves

### Session Security
- Session cookie with httpOnly flag
- SameSite: strict
- Secure flag when HTTPS enabled
- 24-hour session timeout (configurable)

### Rate Limiting
- Login: 5 attempts per 15 minutes
- API: 100 requests per minute

### Audit Logging
All admin actions are logged in the `audit_log` table:
- User creation
- User updates
- Password resets
- User deletions

---

## User Management

### Creating Additional Admin Users

Run the setup script again:

```bash
npm run setup
```

It will ask if you want to create another administrator.

### Creating Regular Users

Currently, regular users can only be created through the API or directly in the database. The admin panel UI is coming soon.

**Via API:**
```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" \
  -b "sessionId=<your-session-cookie>" \
  -d '{
    "username": "user1",
    "password": "password123",
    "role": "user",
    "displayName": "Regular User"
  }'
```

---

## Migration from Single Password

If you're upgrading from the old single-password system:

1. **Backup your `.env` file** (contains your old PASSWORD_HASH)
2. Follow the setup steps above
3. Run `npm run setup` to create your first admin user
4. The old `PASSWORD_HASH` environment variable is no longer used
5. All authentication now uses the SQLite database

---

## Troubleshooting

### Database Not Initializing

**Error:** "Cannot find module './lib/database'"

**Solution:**
```bash
# Ensure dependencies are installed
npm install

# Check that lib directory exists
ls -la lib/
```

---

### Cannot Login with New Credentials

**Check:**
1. Ensure the database was created: `ls -la gallery.db`
2. Verify user exists:
```bash
node -e "const {getAllUsers} = require('./lib/userManager'); console.log(getAllUsers())"
```
3. Check server logs for errors

---

### Session Not Persisting

**Check:**
1. `SESSION_SECRET` is set in `.env`
2. Browser cookies are enabled
3. Not using Incognito/Private mode with strict cookie settings

---

### Admin Button Not Showing

**Check:**
1. User role is `admin` (not `user`)
2. Verify in database:
```bash
node -e "const {getUserByUsername} = require('./lib/userManager'); console.log(getUserByUsername('admin'))"
```

---

## Database Management

### View All Users
```bash
node -e "const {getAllUsers} = require('./lib/userManager'); console.log(JSON.stringify(getAllUsers(), null, 2))"
```

### View Audit Log
```bash
node -e "const {getAuditLog} = require('./lib/userManager'); console.log(JSON.stringify(getAuditLog(50), null, 2))"
```

### Backup Database
```bash
cp gallery.db gallery.db.backup
```

### Reset Database
```bash
rm gallery.db
npm run setup
```

---

## Files Overview

### New Files
- `lib/database.js` - Database initialization and connection
- `lib/userManager.js` - User CRUD operations
- `setup-admin.js` - Interactive admin user creation
- `gallery.db` - SQLite database (created on first run)
- `SETUP.md` - This file

### Modified Files
- `server.js` - Updated authentication to use SQLite
- `public/index.html` - Added username field to login form
- `public/app.js` - Updated login logic for username/password
- `public/styles.css` - Added user info display styles
- `.gitignore` - Added database files
- `.env.example` - Updated configuration template
- `package.json` - Added setup script

---

## Next Steps

1. **Admin Panel UI** - Visual interface for user management (coming soon)
2. **Upload Functionality** - Admin file upload interface (coming soon)
3. **User Profile** - Allow users to change their own password
4. **Email Notifications** - Password reset via email
5. **Two-Factor Authentication** - Enhanced security

---

## Support

For issues or questions:
1. Check this documentation
2. Review `CLAUDE.md` for complete project documentation
3. Check server logs: `npm start` (look for error messages)
4. Verify database state using the commands above

---

**Version:** 2.0.0 (Multi-User Authentication)
**Last Updated:** 2026-01-22
