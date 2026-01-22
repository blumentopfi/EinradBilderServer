# HTTPS Setup Guide for Einrad Bildergalerie

This guide covers multiple methods to set up HTTPS for your image gallery when deploying to a Raspberry Pi and exposing it to the internet.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Option 1: Nginx + Let's Encrypt (Recommended)](#option-1-nginx--lets-encrypt-recommended)
3. [Option 2: Cloudflare Tunnel (Easiest)](#option-2-cloudflare-tunnel-easiest)
4. [Option 3: Caddy (Automatic HTTPS)](#option-3-caddy-automatic-https)
5. [Update Application Settings](#update-application-settings)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Domain Name
You need a domain name pointing to your Raspberry Pi's public IP address.

**Get your public IP:**
```bash
curl ifconfig.me
```

**DNS Setup:**
- Go to your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare)
- Create an A record: `gallery.yourdomain.com` → `YOUR_PUBLIC_IP`
- Wait 5-60 minutes for DNS propagation

**Check DNS propagation:**
```bash
nslookup gallery.yourdomain.com
```

### 2. Port Forwarding (Not needed for Cloudflare Tunnel)
Forward ports on your router:
- Port 80 (HTTP) → Raspberry Pi IP:80
- Port 443 (HTTPS) → Raspberry Pi IP:443

### 3. Static IP for Raspberry Pi
Set a static local IP on your Raspberry Pi:
```bash
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

Reboot:
```bash
sudo reboot
```

---

## Option 1: Nginx + Let's Encrypt (Recommended)

Best for: Full control, standard setup, production environments

### Step 1: Install Nginx

```bash
sudo apt update
sudo apt install nginx -y
```

### Step 2: Configure Nginx

Create nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/gallery
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name gallery.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gallery.yourdomain.com;

    # SSL certificate paths (will be added by certbot)
    ssl_certificate /etc/letsencrypt/live/gallery.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gallery.yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to Node.js application
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

        # Increase timeouts for large downloads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    # Increase body size limit for potential future uploads
    client_max_body_size 100M;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/gallery /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Step 3: Install Certbot (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Step 4: Get SSL Certificate

```bash
sudo certbot --nginx -d gallery.yourdomain.com
```

Follow the prompts:
- Enter your email address
- Agree to terms of service
- Choose whether to redirect HTTP to HTTPS (select YES)

Certbot will automatically:
- Obtain the SSL certificate
- Update your nginx configuration
- Set up automatic renewal

### Step 5: Test Auto-Renewal

```bash
sudo certbot renew --dry-run
```

If successful, your certificates will auto-renew before expiration.

### Step 6: Start Your Application

```bash
cd /path/to/EinradBilderServer
pm2 start server.js --name gallery
pm2 save
```

---

## Option 2: Cloudflare Tunnel (Easiest)

Best for: No port forwarding needed, easiest setup, built-in DDoS protection

### Advantages:
- No port forwarding required
- No public IP needed
- Built-in DDoS protection
- Free SSL certificates
- Hides your home IP address

### Step 1: Install Cloudflared

```bash
# Download latest cloudflared for ARM (Raspberry Pi)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb

# Install
sudo dpkg -i cloudflared-linux-arm64.deb
```

For 32-bit Raspberry Pi:
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb
sudo dpkg -i cloudflared-linux-arm.deb
```

### Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window. Log in to your Cloudflare account and select your domain.

### Step 3: Create a Tunnel

```bash
cloudflared tunnel create gallery
```

Save the Tunnel ID shown in the output.

### Step 4: Configure the Tunnel

Create configuration file:
```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Add this configuration:
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/pi/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: gallery.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Replace:
- `YOUR_TUNNEL_ID` with your actual tunnel ID
- `gallery.yourdomain.com` with your domain

### Step 5: Route DNS to Tunnel

```bash
cloudflared tunnel route dns gallery gallery.yourdomain.com
```

### Step 6: Run the Tunnel

Test first:
```bash
cloudflared tunnel run gallery
```

If it works, set up as a service:
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### Step 7: Start Your Application

```bash
cd /path/to/EinradBilderServer
pm2 start server.js --name gallery
pm2 save
```

Your gallery is now accessible at `https://gallery.yourdomain.com`!

---

## Option 3: Caddy (Automatic HTTPS)

Best for: Simplicity, automatic HTTPS without manual certificate management

### Step 1: Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Step 2: Configure Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace contents with:
```
gallery.yourdomain.com {
    reverse_proxy localhost:3000

    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
}
```

### Step 3: Reload Caddy

```bash
sudo systemctl reload caddy
```

Caddy will automatically:
- Obtain SSL certificates from Let's Encrypt
- Renew certificates before expiration
- Redirect HTTP to HTTPS

### Step 4: Start Your Application

```bash
cd /path/to/EinradBilderServer
pm2 start server.js --name gallery
pm2 save
```

---

## Update Application Settings

After setting up HTTPS with any method, update your `.env` file:

```bash
nano .env
```

Change this line:
```bash
USE_SECURE_COOKIES=true
```

Restart your application:
```bash
pm2 restart gallery
```

This enables secure cookies that only work over HTTPS.

---

## Verification

### 1. Test HTTPS Connection

Visit in browser:
```
https://gallery.yourdomain.com
```

### 2. Check SSL Certificate

```bash
openssl s_client -connect gallery.yourdomain.com:443 -servername gallery.yourdomain.com
```

Look for:
- `Verify return code: 0 (ok)`
- Certificate chain information

### 3. SSL Labs Test

Go to: https://www.ssllabs.com/ssltest/

Enter your domain and run the test. Aim for an A or A+ rating.

### 4. Check Security Headers

```bash
curl -I https://gallery.yourdomain.com
```

Look for security headers:
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`

---

## Troubleshooting

### Issue: "Connection Refused"

**Check if application is running:**
```bash
pm2 status
pm2 logs gallery
```

**Check if port 3000 is listening:**
```bash
sudo netstat -tlnp | grep 3000
```

### Issue: "502 Bad Gateway" (Nginx)

**Check nginx error logs:**
```bash
sudo tail -f /var/log/nginx/error.log
```

**Verify application is running on port 3000:**
```bash
curl http://localhost:3000
```

### Issue: Certificate Errors

**Nginx/Caddy - Check certificate renewal:**
```bash
sudo certbot certificates  # For nginx
```

**Force certificate renewal:**
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### Issue: Cloudflare Tunnel Not Working

**Check tunnel status:**
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

**Restart tunnel:**
```bash
sudo systemctl restart cloudflared
```

### Issue: DNS Not Resolving

**Check DNS propagation:**
```bash
nslookup gallery.yourdomain.com
dig gallery.yourdomain.com
```

Wait 5-60 minutes for DNS changes to propagate globally.

### Issue: Firewall Blocking Connections

**Check firewall status:**
```bash
sudo ufw status
```

**Allow necessary ports (Nginx/Caddy only, NOT Cloudflare Tunnel):**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow ssh
sudo ufw enable
```

**For Cloudflare Tunnel - ONLY allow SSH:**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw enable
```

### Issue: "HSTS Protocol Error" in Browser

You tested locally with HTTPS headers enabled. Clear HSTS cache:

**Chrome/Edge:**
1. Go to `chrome://net-internals/#hsts`
2. Delete domain security policies for `localhost`

**Firefox:**
Delete `SiteSecurityServiceState.txt` from profile folder

---

## Security Recommendations

### 1. Keep Software Updated

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Monitor Logs

**Application logs:**
```bash
pm2 logs gallery
```

**Nginx logs:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**Cloudflare Tunnel logs:**
```bash
sudo journalctl -u cloudflared -f
```

### 3. Regular Backups

Backup your configuration and media:
```bash
tar -czf gallery-backup-$(date +%Y%m%d).tar.gz ~/EinradBilderServer
```

### 4. Fail2Ban (Optional but Recommended)

Protect against brute force attacks:
```bash
sudo apt install fail2ban -y
```

---

## Comparison: Which Option Should You Choose?

| Feature | Nginx + Let's Encrypt | Cloudflare Tunnel | Caddy |
|---------|----------------------|-------------------|-------|
| **Difficulty** | Medium | Easy | Easy |
| **Port Forwarding** | Required | Not Required | Required |
| **Public IP Needed** | Yes | No | Yes |
| **DDoS Protection** | Basic | Excellent | Basic |
| **Speed** | Fastest | Fast | Fast |
| **Privacy** | Best | Good | Best |
| **Cost** | Free | Free | Free |
| **Best For** | Advanced users | Beginners | Simple setups |

### Recommendations:

- **Choose Nginx** if you want maximum control and performance
- **Choose Cloudflare Tunnel** if you don't want to deal with port forwarding or want DDoS protection
- **Choose Caddy** if you want automatic HTTPS with minimal configuration

---

## Quick Start Commands Summary

### Nginx + Let's Encrypt:
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
sudo nano /etc/nginx/sites-available/gallery  # Add config
sudo ln -s /etc/nginx/sites-available/gallery /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d gallery.yourdomain.com
```

### Cloudflare Tunnel:
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb
cloudflared tunnel login
cloudflared tunnel create gallery
nano ~/.cloudflared/config.yml  # Add config
cloudflared tunnel route dns gallery gallery.yourdomain.com
sudo cloudflared service install
sudo systemctl start cloudflared
```

### Caddy:
```bash
# Install caddy (see full commands above)
sudo nano /etc/caddy/Caddyfile  # Add config
sudo systemctl reload caddy
```

---

## Additional Resources

- **Let's Encrypt Documentation**: https://letsencrypt.org/docs/
- **Nginx Documentation**: https://nginx.org/en/docs/
- **Cloudflare Tunnel Guide**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Caddy Documentation**: https://caddyserver.com/docs/

---

**Last Updated:** 2026-01-22
**Tested On:** Raspberry Pi 4 Model B, Raspberry Pi OS (Debian 12)

---

Need help? Check your logs first, then review the troubleshooting section above!
