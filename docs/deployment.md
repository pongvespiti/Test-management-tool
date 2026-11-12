# Deployment

TMT is designed for one on-premise server (up to ~100 users). Two supported ways to run it.

## A. Docker Compose (recommended)

Requirements: Docker Engine with the Compose plugin.

```bash
cp .env.example .env
# edit .env — at least:
#   POSTGRES_PASSWORD     strong password of the bundled PostgreSQL
#   APP_SECRET            ≥ 32 random characters (encrypts the Jira token)
#   WEB_ORIGINS           the URL users open, e.g. https://tmt.example.local
#   COOKIE_SECURE=true    when served over HTTPS
#   TRUST_PROXY=true      when behind a reverse proxy
docker compose up -d --build
docker compose logs api | grep -i "one-time\|password"   # first administrator password
```

Services: `db` (PostgreSQL 16) → `migrate` (one-shot `prisma migrate deploy`) → `api` → `web`.
Data lives in the volumes `db-data` (database) and `tmt-data` (uploads, templates, generated
secret). Web is published on `WEB_PORT` (default 3000), the API on `API_PUBLISHED_PORT` (default
4000; remove that mapping if only the web app should be reachable).

### HTTPS

Terminate TLS in a reverse proxy (nginx, Caddy, IIS ARR …) in front of the **web** container and
forward everything (`/` and `/api/*`) to it. Set `WEB_ORIGINS` to the public URL, `COOKIE_SECURE=true`
and `TRUST_PROXY=true`.

### Backup

`scripts/backup.sh` writes a database dump and a copy of the data directory (attachments, report
templates and `app-secret`) with the same time stamp, checks that both files are readable, and
deletes its own backups older than `KEEP_DAYS` (default 14; `0` keeps everything):

```bash
scripts/backup.sh /srv/tmt-backups          # run from the folder with docker-compose.yml and .env
```

Schedule it every night, e.g. with cron (`30 1 * * * cd /opt/tmt && scripts/backup.sh /srv/tmt-backups`),
and copy the folder to another machine: a backup on the same disk does not survive the disk.
On a plain host (no Docker) set `BACKUP_MODE=host`, `DATABASE_URL` and `DATA_DIR`.

Always back up the database **and** the data directory together — attachments and report templates
are files referenced by database rows, and `app-secret` (when `APP_SECRET` is not set) decrypts the
stored Jira token.

### Restore

```bash
scripts/restore.sh --yes /srv/tmt-backups/tmt-db-20261112-013000.sql.gz /srv/tmt-backups/tmt-data-20261112-013000.tgz
```

This **replaces** the current database and data files (Docker: the API and web containers are
stopped during the restore and started again). Practise it once on a spare server before you need
it. A backup made by an older version restores into a newer one; start the stack afterwards and the
migrate step brings the schema up to date.

### Upgrade

```bash
git pull
docker compose up -d --build     # the migrate service applies new migrations before the API starts
```

## B. Plain host (without Docker)

Requirements: Node.js ≥ 22.12, pnpm 10, PostgreSQL 16.

```bash
pnpm install --frozen-lockfile
pnpm db:generate && pnpm build
DATABASE_URL=… pnpm db:deploy                      # apply migrations
node apps/api/dist/main.js                         # API (reads .env or the environment)
API_URL=http://localhost:4000 pnpm --filter @tmt/web start   # web
```

Run both processes under a service manager (systemd, NSSM/WinSW on Windows).

## Operations

- Health check: `GET /api/health` → `{ "status": "ok", "db": "ok", "version": … }`.
- Logs are JSON (pino); `LOG_LEVEL` controls verbosity.
- Disable Swagger in production with `SWAGGER_ENABLED=false` if the API is exposed beyond the web app.
- Initial administrator: created only when the database has no user; change the password at first
  sign-in. Further accounts are created in **Admin → Users**.
- Demo data (optional, e.g. for a training server): `docker compose exec api node dist/scripts/seed.js`
  or `pnpm db:seed` on a plain host. It adds the project `DEMO` and the accounts `demo.lead`,
  `demo.manager`, `demo.tester`, `demo.viewer` (password from `SEED_USER_PASSWORD`, else printed once). Do not seed
  a production database you do not want demo accounts in.
