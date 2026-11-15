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
secret). Web is published on `WEB_PORT` (default 3000). The API is published on
`API_PUBLISHED_PORT` (default 4000) for the server itself only (`127.0.0.1`); browsers and CI reach
it through the web app's `/api`. Set `API_BIND=0.0.0.0` to open the API port to the network.

### HTTPS

Terminate TLS in a reverse proxy (nginx, Caddy, IIS ARR …) in front of the **web** container and
forward everything (`/` and `/api/*`) to it. Set `WEB_ORIGINS` to the public URL, `COOKIE_SECURE=true`
and `TRUST_PROXY=true`. Make the proxy **replace** `X-Forwarded-For` with the client address rather
than append to it (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`), so a browser cannot
choose the address the sign-in limit counts.

Evidence attachments may be up to `MAX_ATTACHMENT_MB` (500 MB by default), so the reverse proxy must
accept bodies that large and wait for slow uploads (nginx: `client_max_body_size 520m;
proxy_request_buffering off; proxy_read_timeout 600s;`). Without it, large screen recordings fail
in the proxy with its own error page.

### Production settings

| Setting                                   | Value                                                   | Why                                                                            |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`                       | long random letters and digits (`openssl rand -hex 24`) | the database password; compose refuses to start without it                     |
| `APP_SECRET`                              | 32+ random characters (`openssl rand -hex 32`)          | encrypts the Jira token; keep a copy with the backups                          |
| `WEB_ORIGINS` / `PUBLIC_URL`              | the URL people open, e.g. `http://tmt.company.local`    | other origins are refused for changes; links in Jira use it                    |
| `COOKIE_SECURE`                           | `true` with HTTPS, `false` on plain HTTP                | a Secure cookie is never sent over HTTP, so sign-in would fail                 |
| `TRUST_PROXY`                             | `true` only behind your own reverse proxy (above)       | otherwise anyone could choose the address the sign-in limit counts             |
| `SWAGGER_ENABLED`                         | `false`                                                 | hides the public API page; the signed-in REST API docs still work              |
| `INITIAL_ADMIN_PASSWORD`                  | empty (a one-time password is printed in the log)       | change it at the first sign-in                                                 |
| `DEFAULT_DOC_NO_PATTERN`                  | your document code, e.g. `{YY}TR-<dept>-{MM}-{SEQ}`     | numbers of new test plans                                                      |
| `LOGIN_MAX_FAILED` / `LOGIN_LOCK_MINUTES` | `5` / `15` (defaults)                                   | a locked user waits, or an admin resets the password (which also unlocks)      |
| `LOGIN_RATE_LIMIT_PER_MIN`                | `20` (default)                                          | per username and client; one client is capped at ten times that over all names |
| `MAX_UPLOAD_MB`                           | `25` (default), at most `99`                            | Excel imports, report templates, JUnit files (checked in memory)               |
| `MAX_ATTACHMENT_MB`                       | `500` (default), at most `2047`                         | evidence (photos, videos) is streamed to disk; size the data volume for it     |
| `SESSION_IDLE_HOURS` / `SESSION_MAX_DAYS` | `12` / `7` (defaults)                                   | how long a sign-in lasts                                                       |

Server size: 2 CPU, 4 GB RAM is comfortable. Large evidence uploads are streamed to disk: three
400 MB videos at once kept the web server under 200 MB and the API under 300 MB, so they need
disk space rather than memory (plan for the videos you keep; they are in the backups too). The API used about 800 MB under a test load of
20,000 cases and 270,000 run cases, and stayed flat across repeated Excel exports.

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

### Behind a corporate proxy

The image build downloads packages from the npm registry and the Prisma schema engine from
`binaries.prisma.sh` (used by the `migrate` service). When the server reaches the internet only
through a proxy, pass it to the build:

```bash
docker compose build --build-arg HTTPS_PROXY=http://proxy.example:8080 --build-arg HTTP_PROXY=http://proxy.example:8080
docker compose up -d
```

If `migrate` exits with an error about the schema engine, the download was blocked: allow
`binaries.prisma.sh` on the proxy, or ask IT for an exception for the build.

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
