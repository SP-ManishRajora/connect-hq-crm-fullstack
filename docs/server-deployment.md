Here's the full deployment flow for your live server:

1. Pull latest code from git


cd /var/www/coworking-erp
git pull origin main
2. Install dependencies (if package.json changed)


npm install
3. Run DB migrations (safe — no data loss)


npx prisma migrate deploy
migrate deploy only applies pending migrations, never resets data.

4. Regenerate Prisma client


npx prisma generate
5. Build


npm run build
6. Restart the app

If using PM2:


pm2 restart coworking-erp
# or if not started yet:
pm2 start npm --name "coworking-erp" -- start
pm2 save
If using systemd:


sudo systemctl restart coworking-erp
If running manually:


pm2 delete coworking-erp   # stop old
pm2 start npm --name "coworking-erp" -- start
One-liner for future deploys:


cd /var/www/coworking-erp && git pull && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart coworking-erp

---

## Deploying New Features / Latest Changes

Use this when pushing a new feature or the latest changes to the live server.

### 1. Commit & push from your dev machine

```bash
git add -A
git commit -m "your feature description"
git push origin main
```

If the feature added a Prisma schema change, make sure the migration was created locally **before** pushing:

```bash
npx prisma migrate dev --name your_migration_name   # creates prisma/migrations/<timestamp>_your_migration_name
git add prisma/
git commit -m "migration: your_migration_name"
git push origin main
```

### 2. Deploy on the live server

```bash
cd /var/www/coworking-erp
git pull origin main
```

Then run only the steps that apply to what changed:

| What changed | Commands to run |
| --- | --- |
| Code only (no deps, no schema) | `npm run build` → `pm2 restart coworking-erp` |
| New/updated npm packages | `npm install` → `npm run build` → `pm2 restart coworking-erp` |
| Prisma schema / new migration | `npx prisma migrate deploy` → `npx prisma generate` → `npm run build` → `pm2 restart coworking-erp` |

> `prisma migrate deploy` only applies pending migrations and never resets data — safe to run on production.

### 3. Full deploy one-liner (covers all cases)

```bash
cd /var/www/coworking-erp && git pull origin main && npm install && npx prisma migrate deploy && npx prisma generate && npm run build && pm2 restart coworking-erp && pm2 save
```

### 4. Verify the deploy

```bash
pm2 status                       # app should be "online"
pm2 logs coworking-erp --lines 50   # check for runtime/build errors
```

Then open the app in a browser and confirm the new feature works. If anything looks wrong, check the logs above before rolling back.

### Rollback (if a deploy breaks production)

```bash
cd /var/www/coworking-erp
git log --oneline -n 5           # find the last known-good commit hash
git checkout <good-commit-hash>
npm install && npx prisma generate && npm run build && pm2 restart coworking-erp
```

> Note: rolling back code does **not** undo an applied DB migration. If a migration caused the issue, restore from a database backup or write a corrective migration — do not run `migrate reset` on production.



Deploy to live — step by step

Step 1 — Log into the server

ssh ubuntu@crm.connecthq.co.in
sudo su
cd /var/www/coworking-erp


Step 2 — Get the new code

git checkout -- package-lock.json
git pull origin main
##The first line prevents the "local changes would be overwritten" error you hit before.

Step 3 — Install packages

npm ci
##Use npm ci, not npm install. And never npm audit fix — that's what upgraded Next.js and broke things last time.

Step 4 — Update the database

npx prisma migrate deploy
npx prisma generate
##This adds 15 new tables/columns. It only adds — nothing is deleted.

Step 5 — Build

rm -rf .next
npm run build
##The rm -rf .next clears the old build. Skipping it can cause phantom errors.

Wait for ✓ Compiled successfully. If it fails, stop and send me the error — don't continue.

Step 6 — Restart

pm2 restart coworking-erp

Step 7 — Check it's working

pm2 logs coworking-erp --lines 20
Open https://crm.connecthq.co.in/login — you should see the eye icon in the password box.

One-time setup (first deploy only)
Add settings to the .env file

nano /var/www/coworking-erp/.env
Paste at the bottom, then save with Ctrl+O, Enter, Ctrl+X:


HK_SIGNED_URL_SECRET="EI41VBI/bNBHlxhHnQ2b649vBJtiNDdijoEHGS2o+oU="
HK_CRON_SECRET="gQAzDUDwCbtP48cKnPlFLoawedRUib7O+fS+HvVIMRI="
HK_UPLOAD_DIR="/var/lib/coworking-erp/hk-uploads"
HK_AI_DRIVER="stub"
Create the photo folder

mkdir -p /var/lib/coworking-erp/hk-uploads
chown -R ubuntu:ubuntu /var/lib/coworking-erp/hk-uploads
chmod 750 /var/lib/coworking-erp/hk-uploads
Photos won't upload without this.

Load the starting data

npm run db:seed:roles
npm run db:seed:hk
npm run db:seed:cr
Safe to run more than once.