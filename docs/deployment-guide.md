# Node.js Production Deployment Guide
### For Laravel Developers — Coworking ERP (Next.js 14 + Prisma)

> **Think of it this way:**
> | Laravel concept | Next.js equivalent |
> |---|---|
> | `php artisan serve` | `npm run dev` |
> | `php artisan build` / compile | `npm run build` |
> | `php-fpm` process | `PM2` process manager |
> | `public/index.php` entry point | `.next/` build output |
> | `.env` | `.env` (same idea) |
> | `storage/app/public` | `public/uploads/` |
> | Composer | npm |
> | Eloquent ORM | Prisma ORM |

---

## Step 1 — Understand the Project Structure

```
coworking-erp/
├── src/
│   ├── app/           ← Pages + API routes (like routes/ + controllers/ combined)
│   ├── components/    ← Reusable UI (like Blade components)
│   └── lib/           ← Helpers, mailer, auth (like app/Services/)
├── prisma/
│   ├── schema.prisma  ← Database schema (like migrations/)
│   ├── seed.ts        ← Demo data seeder
│   └── dev.db         ← SQLite file (NOT for production — switch to Postgres)
├── public/
│   └── uploads/       ← File uploads land here (like storage/app/public)
├── package.json       ← Like composer.json
├── next.config.js     ← Like config/app.php
└── .env               ← Environment variables (same as Laravel)
```

**How requests flow:**
`Browser → Nginx (port 80/443) → PM2/Next.js (port 3000) → Prisma → Database`

This is identical to how Laravel works with Nginx + PHP-FPM, just replace PHP-FPM with PM2.

---

## Step 2 — Provision Your AWS EC2 Instance

### 2.1 — Recommended instance type
- **t3.small** (2 vCPU, 2 GB RAM) is sufficient to start.
- Use **Ubuntu 22.04 LTS** AMI.
- Open these ports in your Security Group:
  - `22` (SSH)
  - `80` (HTTP)
  - `443` (HTTPS)

### 2.2 — Connect to your server
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

---

## Step 3 — Install Node.js on the Server

> Laravel uses PHP. Node.js apps need Node.js runtime installed — this is a one-time server setup.

```bash
# Install NVM (Node Version Manager — like phpenv for PHP)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell so nvm command is available
source ~/.bashrc

# Install Node.js 20 LTS (stable, recommended for production)
nvm install 20
nvm use 20
nvm alias default 20

# Verify installation
node -v   # should print v20.x.x
npm -v    # should print 10.x.x
```

---

## Step 4 — Install PostgreSQL (Switch Away from SQLite)

> SQLite (`dev.db` file) is fine locally but **not suitable for production**. Switch to PostgreSQL — the `prisma/schema.prisma` is already portable.

```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Start and enable on boot
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE DATABASE coworking_erp;
CREATE USER erp_user WITH ENCRYPTED PASSWORD 'Secret@123ConnectHqErp';
GRANT ALL PRIVILEGES ON DATABASE coworking_erp TO erp_user;
\q
EOF
```

Your `DATABASE_URL` will be:
```
postgresql://erp_user:Secret@123ConnectHqErp@localhost:5432/coworking_erp
```

---

## Step 5 — Upload the Project to the Server

**Option A — Git (recommended)**
```bash
# On the server
cd /var/www
sudo mkdir coworking-erp
sudo chown ubuntu:ubuntu coworking-erp

git clone https://github.com/your-org/coworking-erp.git coworking-erp
cd coworking-erp
```

**Option B — SCP/SFTP (if no Git remote)**
```bash
# From your local machine
scp -i your-key.pem -r /path/to/coworking-erp ubuntu@your-ec2-ip:/var/www/
```

> **Important:** Add these to `.gitignore` (never upload to server via Git):
> - `node_modules/`
> - `.next/`
> - `prisma/dev.db`
> - `.env`

---

## Step 6 — Set Up the .env File

```bash
cd /var/www/coworking-erp

# Copy the example file — same as Laravel's cp .env.example .env
cp .env.example .env

# Edit with your real values
nano .env
```

Fill in `.env` like this:

```env
# Switch from SQLite to PostgreSQL
DATABASE_URL="postgresql://erp_user:your_strong_password_here@localhost:5432/coworking_erp"

# Generate a strong secret: openssl rand -base64 64
JWT_SECRET="paste-a-long-random-64-char-string-here"

# Your live domain
APP_URL="https://erp.yourcompany.com"

# SMTP (use Gmail, Mailgun, SES, or any SMTP provider)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="erp@yourcompany.com"

# Leave blank if not using yet
DIGILOCKER_CLIENT_ID=""
DIGILOCKER_CLIENT_SECRET=""
WHATSAPP_API_URL=""
WHATSAPP_API_TOKEN=""
```

**Generate JWT_SECRET:**
```bash
openssl rand -base64 64
```

---

## Step 7 — Install Dependencies and Build

> `npm install` = `composer install`
> `npm run build` = compiling assets (but also compiles the entire app for production)

```bash
cd /var/www/coworking-erp

# Install dependencies (production + dev, needed for build)
npm install

# Run Prisma migration (creates tables in PostgreSQL — like php artisan migrate)
npx prisma db push

# Optional: seed demo data (like php artisan db:seed)
# npm run db:seed

# Build for production (compiles TypeScript, optimises React, generates .next/ folder)
npm run build
```

> The `npm run build` step is critical — without it the app runs in slow dev mode.
> After a successful build you will see a `.next/` folder with the compiled output.

**Verify the build worked locally before moving on:**
```bash
npm run build
# Should print: ▶ Local: http://localhost:3000
# Press Ctrl+C to stop
```

---

## Step 8 — Set Up PM2 (Process Manager)

> PM2 is the Node.js equivalent of PHP-FPM or Supervisor. It keeps your app running, restarts it on crash, and starts it automatically after a server reboot.

```bash
# Install PM2 globally
npm install -g pm2

# Start the app with PM2
pm2 start npm --name "coworking-erp" -- start

# Check status (like systemctl status php-fpm)
pm2 status

# View live logs (like tail -f storage/logs/laravel.log)
pm2 logs coworking-erp

# Auto-start PM2 on server reboot (like systemctl enable)
pm2 startup
# PM2 prints a command like: sudo env PATH=... pm2 startup systemd ...
# COPY and RUN that exact command, then:
pm2 save
```

> At this point your app is running on `http://your-server-ip:3000`. Next, we expose it on port 80/443 via Nginx.

---

## Step 9 — Configure Nginx as Reverse Proxy

> This is identical to your Laravel Nginx setup. Nginx listens on 80/443 and forwards traffic to the Node.js app on port 3000.

```bash
sudo nano /etc/nginx/sites-available/coworking-erp
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name erp.yourcompany.com;   # ← replace with your domain

    # Max upload size (for KYC docs, delivery photos, floor maps)
    client_max_body_size 20M;

    # Serve Next.js static assets directly from disk (faster, no Node.js overhead)
    location /_next/static/ {
        alias /var/www/coworking-erp/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Serve user-uploaded files directly (KYC, photos, maps)
    location /uploads/ {
        alias /var/www/coworking-erp/public/uploads/;
    }

    # Everything else → Node.js app on port 3000
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
    }
}
```

```bash
# Enable the site (like a2ensite in Apache)
sudo ln -s /etc/nginx/sites-available/coworking-erp /etc/nginx/sites-enabled/

# Test Nginx config for syntax errors
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 10 — Point Your Domain to the Server

In your domain registrar (GoDaddy, Namecheap, Route 53, etc.) add an **A record**:

```
Type:  A
Name:  erp          (or @ for root domain)
Value: your-ec2-public-ip
TTL:   300
```

> Wait 5–15 minutes for DNS to propagate. Test with: `nslookup erp.yourcompany.com`

---

## Step 11 — SSL Certificate with Let's Encrypt (HTTPS)

> Same tool as Laravel deployments — Certbot.

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Issue and auto-install the SSL certificate
sudo certbot --nginx -d erp.yourcompany.com

# Certbot will ask for your email and auto-configure Nginx for HTTPS
# It also sets up auto-renewal via cron

# Test auto-renewal
sudo certbot renew --dry-run
```

After this Certbot rewrites your Nginx config to redirect HTTP → HTTPS automatically.

---

## Step 12 — Create the Uploads Directory

```bash
# This folder must exist and be writable — like storage/app/public in Laravel
mkdir -p /var/www/coworking-erp/public/uploads
chmod 775 /var/www/coworking-erp/public/uploads
```

---

## Step 13 — Full Deployment Checklist

Run through this every time you deploy an update:

```bash
cd /var/www/coworking-erp

# 1. Pull latest code
git pull origin main

# 2. Install any new packages
npm install

# 3. Run any new Prisma migrations
npx prisma db push

# 4. Rebuild the app
npm run build

# 5. Restart the process (zero-downtime reload)
pm2 reload coworking-erp

# 6. Check it's running
pm2 status
pm2 logs coworking-erp --lines 20
```

---

## Common Issues and Fixes

### "Module not found" or build error after git pull
```bash
rm -rf node_modules .next
npm install
npm run build
pm2 reload coworking-erp
```
> Same as deleting `vendor/` and running `composer install` in Laravel.

---

### App crashes immediately — how to debug
```bash
# View crash logs
pm2 logs coworking-erp --err --lines 50

# Check if port 3000 is actually listening
ss -tlnp | grep 3000

# Manually run the app to see errors directly in terminal
npm run start
```

---

### 502 Bad Gateway from Nginx
This means Nginx is running but cannot reach Node.js on port 3000.
```bash
# Is PM2 running?
pm2 status

# If stopped, restart it
pm2 start coworking-erp

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log
```

---

### Prisma "P1001: Can't reach database server"
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test the connection manually
psql -U erp_user -h localhost -d coworking_erp -c "SELECT 1;"

# Re-run migration
npx prisma db push
```

---

### File uploads not working in production
```bash
# Ensure uploads directory exists and is writable
ls -la /var/www/coworking-erp/public/uploads
chmod 775 /var/www/coworking-erp/public/uploads
chown ubuntu:www-data /var/www/coworking-erp/public/uploads
```
> Long-term: switch to AWS S3 (the README already flags this as Phase 2).

---

### Environment variable not being picked up
Next.js reads `.env` at **build time** for some variables. After changing `.env`:
```bash
npm run build        # rebuild so new env vars are baked in
pm2 reload coworking-erp
```

---

### Out of memory during build on a small instance
```bash
# Increase Node.js memory limit for the build step
NODE_OPTIONS="--max-old-space-size=1536" npm run build
```

---

### PM2 not starting after reboot
```bash
# Re-run the startup command
pm2 startup
# Copy-paste the command PM2 outputs, then:
pm2 save
```

---

## Quick Reference Cheat Sheet

| Task | Command |
|------|---------|
| View running processes | `pm2 status` |
| View live app logs | `pm2 logs coworking-erp` |
| Restart app | `pm2 restart coworking-erp` |
| Reload without downtime | `pm2 reload coworking-erp` |
| Stop app | `pm2 stop coworking-erp` |
| Rebuild + reload | `npm run build && pm2 reload coworking-erp` |
| Run DB migration | `npx prisma db push` |
| Open DB GUI | `npx prisma studio` (dev only) |
| Check Nginx config | `sudo nginx -t` |
| Reload Nginx | `sudo systemctl reload nginx` |
| View Nginx errors | `sudo tail -f /var/log/nginx/error.log` |
| Renew SSL cert | `sudo certbot renew` |
