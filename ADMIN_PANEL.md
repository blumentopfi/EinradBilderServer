# Admin Panel Guide

Welcome to the Einrad Bildergalerie Admin Panel! This guide will help you manage users and upload media files.

---

## 🚀 Quick Start

1. **Login** as an admin user at `http://localhost:3000`
2. Click the **"Admin-Bereich"** button in the header
3. You'll be redirected to the admin panel at `http://localhost:3000/admin.html`

---

## 📋 Features Overview

### 1. User Management Tab (👥 Benutzerverwaltung)
Manage all user accounts in the system.

### 2. Upload Tab (📤 Medien hochladen)
Upload images and videos to the media library.

---

## 👥 User Management

### Viewing Users

The user table displays:
- **Benutzername** (Username) - Login identifier
- **Anzeigename** (Display Name) - Friendly name shown in UI
- **Rolle** (Role) - Administrator or Benutzer (User)
- **Status** - Aktiv (Active) or Inaktiv (Inactive)
- **Erstellt am** (Created At) - Account creation date
- **Letzter Login** (Last Login) - Most recent login timestamp
- **Aktionen** (Actions) - Action buttons

### Creating a New User

1. Click **"+ Neuer Benutzer"** button
2. Fill in the form:
   - **Benutzername** (Username)* - 3-30 characters, lowercase, alphanumeric + `-` `_`
   - **Passwort** (Password)* - Minimum 8 characters
   - **Anzeigename** (Display Name) - Optional friendly name
   - **Rolle** (Role)* - Select "Administrator" or "Benutzer"
3. Click **"Speichern"** (Save)

**Validation:**
- Username must be unique
- Username must be 3-30 characters
- Username can only contain: letters, numbers, `-`, `_`
- Password must be at least 8 characters
- Role must be either "admin" or "user"

**Example:**
```
Benutzername: max.mustermann
Passwort: SecurePass123
Anzeigename: Max Mustermann
Rolle: Benutzer
```

### Editing a User

1. Click **"Bearbeiten"** (Edit) button next to the user
2. Modify the following fields:
   - **Anzeigename** (Display Name)
   - **Rolle** (Role)
3. Click **"Speichern"** (Save)

**Note:** Username cannot be changed after creation.

### Resetting a User's Password

1. Click **"Passwort"** (Password) button next to the user
2. Enter the new password twice:
   - **Neues Passwort** (New Password)* - Minimum 8 characters
   - **Passwort bestätigen** (Confirm Password)*
3. Click **"Passwort zurücksetzen"** (Reset Password)

**Security:**
- Only admins can reset passwords
- User does not receive a notification
- User should be informed of the new password through a secure channel

### Deleting a User

1. Click **"Löschen"** (Delete) button next to the user
2. Confirm the deletion in the dialog
3. User is soft-deleted (deactivated, not permanently removed)

**Protection:**
- Cannot delete yourself
- Cannot delete the last admin user
- Action is logged in audit log

---

## 📤 Media Upload

### Selecting Target Folder

1. Navigate through folders by clicking on folder cards
2. Use the **breadcrumb navigation** at the top to go back
   - **🏠 Start** - Returns to root directory
   - Click any folder name to jump to that level
3. Current location is shown in the breadcrumb

### Creating a New Folder

1. Navigate to the parent folder
2. Click **"📁 Neuer Ordner"** (New Folder) button
3. Enter folder name:
   - Only letters, numbers, spaces, `-`, `_`
   - Example: `2026`, `Sommer Events`, `Team_Photos`
4. Review the creation path shown
5. Click **"Erstellen"** (Create)

**Validation:**
- Folder name cannot contain special characters or path separators
- Folder name cannot start with `.` (hidden folders)
- Folder must not already exist

### Uploading Files

**Method 1: Drag and Drop**
1. Drag files from your computer
2. Drop them onto the **drop zone** (large gray area)
3. Files are automatically added to the upload queue

**Method 2: Click to Select**
1. Click anywhere on the **drop zone**
2. A file picker opens
3. Select one or multiple files
4. Files are added to the upload queue

**Supported File Types:**
- **Images:** JPG, JPEG, PNG, GIF, WebP, BMP
- **Videos:** MP4, WebM, MOV, AVI, MKV

**File Size Limit:** 100MB per file

### Upload Queue

After adding files, the **upload queue** appears showing:
- **Thumbnail** - Preview for images, 🎬 icon for videos
- **Filename** - Original file name
- **File Size** - Size in KB/MB/GB
- **Progress Bar** - Upload progress percentage
- **Status** - Current upload status
- **Remove Button** (×) - Cancel/remove upload

**Upload States:**
- **Warte...** (Waiting) - File is in queue
- **X% (loaded / total)** - Upload in progress
- **✓ Erfolgreich hochgeladen** (Successfully uploaded) - Complete
- **✗ Error message** - Upload failed

**Note:** Successful uploads are automatically removed from the queue after 3 seconds.

### Managing Uploads

- **Cancel Individual Upload:** Click the **×** button on the upload item
- **Cancel All Uploads:** Click **"Alle abbrechen"** (Cancel All) at the top of the queue

### File Naming

- Original filename is preserved
- If a file with the same name exists, a number is appended:
  - `photo.jpg` → `photo (1).jpg` → `photo (2).jpg`
- Special characters are automatically sanitized

---

## 🔒 Security & Permissions

### Admin-Only Access

The admin panel requires:
1. **Authenticated session** - Must be logged in
2. **Admin role** - Only administrators can access
3. Non-admin users attempting to access are redirected to the gallery

### Session Management

- Sessions expire after 24 hours (configurable)
- Logout clears the session
- Session is validated on every admin action

### File Upload Security

- **Path traversal protection** - Cannot upload outside media directory
- **File type validation** - Only allowed media types
- **File size limits** - Maximum 100MB per file
- **Filename sanitization** - Dangerous characters removed
- **Directory validation** - All paths are normalized and checked

---

## 🎨 User Interface

### Color Scheme
- **Primary Orange:** `#ff6b35` (buttons, highlights)
- **Secondary Gold:** `#f7931e` (gradients)
- **Success Green:** Active status indicators
- **Error Red:** Inactive status, delete buttons
- **Neutral Gray:** Background, borders

### Responsive Design
- **Desktop:** Full table layout with all columns
- **Tablet:** Responsive grid for folders and uploads
- **Mobile:** Stacked layout, scrollable table

### Keyboard Navigation
- **Tab:** Navigate between form fields
- **Enter:** Submit forms
- **Escape:** Close modals (planned)

---

## 📊 User Roles Comparison

| Feature | Administrator | Benutzer (User) |
|---------|--------------|-----------------|
| View gallery | ✅ Yes | ✅ Yes |
| Download media | ✅ Yes | ✅ Yes |
| Access admin panel | ✅ Yes | ❌ No |
| Create users | ✅ Yes | ❌ No |
| Edit users | ✅ Yes | ❌ No |
| Reset passwords | ✅ Yes | ❌ No |
| Delete users | ✅ Yes | ❌ No |
| Upload files | ✅ Yes | ❌ No |
| Create folders | ✅ Yes | ❌ No |

---

## 🛠 Troubleshooting

### Admin Button Not Showing

**Problem:** "Admin-Bereich" button is not visible in the gallery

**Solutions:**
1. Verify you're logged in as an admin:
   ```bash
   node -e "const {getUserByUsername} = require('./lib/userManager'); console.log(getUserByUsername('admin'));"
   ```
2. Check the user's role is `admin` (not `user`)
3. Log out and log back in to refresh the session
4. Clear browser cache

---

### Cannot Access Admin Panel

**Problem:** Redirected to gallery when visiting `/admin.html`

**Solutions:**
1. Ensure you're logged in
2. Verify your user has `role: 'admin'`
3. Check browser console for JavaScript errors
4. Try logging out and back in

---

### Upload Fails

**Problem:** File upload shows error status

**Common Causes:**
1. **File too large** - Max 100MB per file
2. **Unsupported format** - Check supported file types
3. **No disk space** - Server may be out of storage
4. **Permission error** - Media directory not writable

**Solutions:**
1. Reduce file size or split large files
2. Convert to supported format (JPG, PNG, MP4, etc.)
3. Check server disk space: `df -h`
4. Fix permissions: `chmod -R 755 media/`

---

### Folder Creation Fails

**Problem:** "Fehler beim Erstellen des Ordners"

**Common Causes:**
1. **Folder already exists** - Choose a different name
2. **Invalid characters** - Use only letters, numbers, spaces, `-`, `_`
3. **Permission error** - Parent directory not writable

**Solutions:**
1. Check if folder exists: `ls media/`
2. Use valid characters in folder name
3. Fix permissions: `chmod -R 755 media/`

---

### User Creation Fails

**Problem:** Error when creating new user

**Common Causes:**
1. **Username already exists** - Choose a unique username
2. **Password too short** - Minimum 8 characters
3. **Invalid username format** - 3-30 chars, alphanumeric + `-` `_`

**Solutions:**
1. Try a different username
2. Use a longer password
3. Remove special characters from username

---

### Cannot Delete User

**Problem:** "Der letzte Administrator kann nicht gelöscht werden"

**Explanation:** System requires at least one active admin user for security.

**Solution:** Create another admin user before deleting this one.

---

## 💡 Tips & Best Practices

### User Management
- ✅ Use descriptive display names (e.g., "Max Mustermann" instead of "user1")
- ✅ Create unique usernames (e.g., "max.mustermann" instead of "admin2")
- ✅ Keep at least 2 admin users for redundancy
- ✅ Deactivate users instead of deleting them (preserves audit trail)
- ✅ Use strong passwords (12+ characters, mixed case, numbers, symbols)

### File Organization
- ✅ Create a logical folder structure (e.g., by year, event, category)
- ✅ Use consistent naming conventions (e.g., `2026_Events`, `Team_Photos`)
- ✅ Upload files to appropriate folders (don't put everything in root)
- ✅ Create folders before uploading (easier to organize)

### Security
- ✅ Log out when done with admin tasks
- ✅ Don't share admin credentials
- ✅ Review user list regularly
- ✅ Deactivate users who no longer need access
- ✅ Use HTTPS in production (set `USE_SECURE_COOKIES=true`)

### Performance
- ✅ Upload files in batches (not hundreds at once)
- ✅ Compress large images before uploading
- ✅ Convert videos to web-friendly formats (MP4, WebM)
- ✅ Monitor disk space regularly

---

## 📱 Mobile Usage

The admin panel is fully responsive and works on mobile devices:

### User Management on Mobile
- Table scrolls horizontally
- Action buttons stack vertically
- Forms adapt to narrow screens

### Upload on Mobile
- Tap drop zone to select files from device
- Drag and drop supported on compatible browsers
- Upload queue shows one item per row

---

## 🔮 Planned Features

Future enhancements for the admin panel:

- [ ] Bulk user operations (create, delete, export)
- [ ] User import from CSV
- [ ] Activity dashboard with charts
- [ ] Advanced audit log viewer
- [ ] Image preview before upload
- [ ] Bulk file operations (move, rename, delete)
- [ ] Media library search and filtering
- [ ] User groups and permissions
- [ ] Email notifications for password resets
- [ ] Two-factor authentication
- [ ] Toast notifications (instead of alerts)
- [ ] Keyboard shortcuts

---

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review `SETUP.md` for installation issues
3. Check server logs: `npm start` (console output)
4. Verify database state using CLI commands in SETUP.md

---

## 🎯 Quick Reference

### Default Test Credentials
- **Username:** `admin`
- **Password:** `admin123`
- **Role:** Administrator

**⚠️ Change this password immediately in production!**

### Common Paths
- **Gallery:** `http://localhost:3000/`
- **Admin Panel:** `http://localhost:3000/admin.html`
- **Media Directory:** `./media/` (configurable in `.env`)
- **Database:** `./gallery.db`

### Quick Commands
```bash
# Start server
npm start

# Create admin user
npm run setup

# View all users
node -e "const {getAllUsers} = require('./lib/userManager'); console.log(JSON.stringify(getAllUsers(), null, 2));"

# View audit log
node -e "const {getAuditLog} = require('./lib/userManager'); console.log(JSON.stringify(getAuditLog(50), null, 2));"
```

---

**Version:** 2.0.0 (Admin Panel)
**Last Updated:** 2026-01-22
