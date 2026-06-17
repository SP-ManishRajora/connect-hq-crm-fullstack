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