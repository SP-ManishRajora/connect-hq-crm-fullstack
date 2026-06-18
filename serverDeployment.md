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