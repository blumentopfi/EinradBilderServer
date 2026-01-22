# Security Guide for Internet Deployment

## ⚠️ CRITICAL: Read Before Deploying to Internet

This application has been hardened with security features, but requires proper deployment setup.

---

## Security Features Implemented

### ✅ What's Already Protected:

1. **Password Hashing** - Passwords stored as bcrypt hashes, not plaintext
2. **Rate Limiting** - 5 login attempts per 15 minutes, prevents brute force
3. **Session Security** - Secure session management with httpOnly cookies
4. **Path Traversal Protection** - Prevents accessing files outside images directory
5. **Security Headers** - Helmet.js for XSS, clickjacking protection
6. **Input Validation** - All user inputs validated
7. **Timing Attack Protection** - 1-second delay on failed logins
8. **Session Fixation Protection** - Session ID regenerated after login
9. **API Rate Limiting** - 100 requests per minute per IP
10. **Error Handling** - No sensitive information leaked in errors

---

## 🔒 Required: HTTPS Setup

**CRITICAL**: Never expose this application to the internet without HTTPS!

### Option 1: Nginx Reverse Proxy with Let's Encrypt (Recommended)

1. **Install Nginx and Certbot:**
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. **Create Nginx configuration:**
   ```bash
   sudo nano /etc/nginx/sites-available/gallery
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Redirect HTTP to HTTPS
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name your-domain.com;

       # SSL certificate (will be auto-configured by certbot)
       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       # SSL Security Headers
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_prefer_server_ciphers on;
       ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';

       # Security headers
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;

       # Increase upload size if needed for large image uploads
       client_max_body_size 500M;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;

           # Timeouts for large downloads
           proxy_read_timeout 300s;
           proxy_connect_timeout 75s;
       }
   }
   ```

3. **Enable the site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/gallery /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. **Get SSL certificate:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

5. **Update .env file:**
   ```bash
   USE_SECURE_COOKIES=true
   ```

6. **Restart your app:**
   ```bash
   pm2 restart gallery  # or however you run it
   ```

### Option 2: Cloudflare Tunnel (Easiest, No Port Forwarding)

1. **Install cloudflared:**
   ```bash
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Login to Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```

3. **Create tunnel:**
   ```bash
   cloudflared tunnel create gallery
   cloudflared tunnel route dns gallery your-domain.com
   ```

4. **Create config:**
   ```bash
   nano ~/.cloudflared/config.yml
   ```

   Add:
   ```yaml
   tunnel: <your-tunnel-id>
   credentials-file: /home/pi/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: your-domain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. **Run tunnel:**
   ```bash
   cloudflared tunnel run gallery
   ```

6. **Update .env:**
   ```bash
   USE_SECURE_COOKIES=true
   ```

---

## 🔑 Change Default Password

**CRITICAL**: Change the default password immediately!

1. **Generate new password hash:**
   ```bash
   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YOUR-STRONG-PASSWORD', 10).then(hash => console.log(hash))"
   ```

2. **Update .env file:**
   ```bash
   PASSWORD_HASH=<the-hash-from-above>
   ```

3. **Restart server**

**Password Best Practices:**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Not a dictionary word
- Not reused from other services

---

## 🛡️ Firewall Configuration

Only expose necessary ports:

```bash
# UFW (Ubuntu/Debian)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp   # HTTP (will redirect to HTTPS)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# Do NOT open port 3000 - app should only be accessible via nginx
```

---

## 📊 Monitoring & Logging

### Setup PM2 for Process Management

```bash
# Install PM2
sudo npm install -g pm2

# Start app with PM2
pm2 start server.js --name gallery

# Enable startup script
pm2 startup
pm2 save

# View logs
pm2 logs gallery

# Monitor
pm2 monit
```

### Log Failed Login Attempts

Check logs regularly for suspicious activity:
```bash
pm2 logs gallery | grep "Invalid password"
```

---

## 🔄 Regular Maintenance

### 1. Keep Dependencies Updated

```bash
# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### 2. Monitor Disk Space

Images/videos can fill up disk quickly:
```bash
df -h
du -sh /path/to/images
```

### 3. Backup

Regularly backup:
- Images directory
- `.env` file (store securely!)
- Let's Encrypt certificates (auto-renewed, but backup anyway)

---

## 🚨 Security Checklist Before Going Live

- [ ] HTTPS configured (nginx + Let's Encrypt OR Cloudflare)
- [ ] `USE_SECURE_COOKIES=true` in .env
- [ ] Default password changed to strong password
- [ ] `.env` file has restrictive permissions (`chmod 600 .env`)
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] Port 3000 NOT exposed directly to internet
- [ ] PM2 or systemd service configured for auto-restart
- [ ] Log monitoring setup
- [ ] Backup strategy in place
- [ ] Domain DNS configured
- [ ] SSL certificate auto-renewal tested

---

## 🔍 Testing Security

### Test Rate Limiting

Try logging in with wrong password 6 times - should be blocked.

### Test HTTPS

```bash
# Should return A or A+
curl https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com
```

### Test Headers

```bash
curl -I https://your-domain.com
# Should see: Strict-Transport-Security, X-Frame-Options, etc.
```

---

## ⚡ Additional Security Recommendations

### 1. Fail2Ban (Recommended)

Automatically ban IPs with too many failed attempts:

```bash
sudo apt install fail2ban

# Create jail for nginx
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[nginx-login]
enabled = true
port = http,https
filter = nginx-login
logpath = /var/log/nginx/access.log
maxretry = 5
bantime = 3600
```

### 2. Two-Factor Authentication

For high-security needs, consider adding 2FA with:
- Google Authenticator
- Authy
- Hardware keys (YubiKey)

(Requires code modifications)

### 3. IP Whitelisting

If only specific IPs need access, add to nginx config:
```nginx
allow 1.2.3.4;  # Your IP
deny all;
```

### 4. VPN Access Only

Most secure option: Don't expose to internet at all, use WireGuard VPN.

---

## 🆘 Incident Response

If you suspect a breach:

1. **Immediately change password**
2. **Check logs for suspicious activity:**
   ```bash
   pm2 logs gallery --lines 1000
   grep "401" /var/log/nginx/access.log
   ```
3. **Check for unauthorized file access**
4. **Restart server and regenerate session secret**
5. **Review firewall rules**
6. **Consider IP ban for suspicious addresses**

---

## 📞 Support

For security issues, check:
- npm audit output
- Server logs (pm2 logs)
- Nginx error logs (/var/log/nginx/error.log)

---

## Rate Limits Summary

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/login` | 5 attempts | 15 minutes |
| `/api/*` | 100 requests | 1 minute |

Rate limits apply per IP address.
