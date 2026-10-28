# SkyBook Deployment

**Last verified:** 2026-10-28 (local Vite/Node/MariaDB path; Docker remains unverified)

## Verified path vs unverified path

| Path | Status |
|------|--------|
| Local Vite frontend (`:5173`) + Node/Express backend (`:8080`) + repaired MariaDB copy (`:3307`) | **Verified:** tests, build, lint and browser flows passed |
| Original host MariaDB (`:3306`) | **Blocked:** the original Aria tables are unrepaired; use the copy for testing until recovery is explicitly approved |
| Docker Compose (`db` + `backend` + Nginx frontend) | **Not verified in this session:** the Docker daemon was unavailable. Compose files were reviewed, not executed |

The verified deployment is the local/self-hosted Node + MySQL path described below. Do not claim the Compose stack is healthy without running it.

## Authoritative application

- Backend: `src/backend/server.js` (Express 5 + `mysql2`). This is the only backend used by the frontend.
- Frontend: `src/` (React 19 + TypeScript + Vite). Production output is `dist/`.
- Database: MySQL/MariaDB, database `skybook`.
- Schema migrations: `src/backend/db-schema.js` runs an idempotent guard at server startup. It adds missing tables, columns and indexes and normalises the airport collation; it does not drop application data.
- Airport catalogue: stored in the `airports` table (72 rows in the verified database) and served by `GET /api/airports`.
- `backend-java/` is an unwired Spring Boot experiment. It is not part of the deployment.
- `src/backend/skybook.db` is an unused SQLite leftover. The current server never reads it.

## Environment variables

Create `.env` from `.env.example`. Never commit real secrets.

| Variable | Required | Notes |
|----------|----------|-------|
| `MYSQL_HOST` | Yes | `127.0.0.1` for local host MariaDB; the Compose service name is `db` |
| `MYSQL_PORT` | No | Default `3306` |
| `MYSQL_DATABASE` | Yes | `skybook` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Yes | Dedicated application user; do not use `root` in production |
| `MYSQL_ROOT_PASSWORD` | Compose only | Used only by the MariaDB container |
| `JWT_SECRET` | Yes | At least 32 random characters; production start fails otherwise |
| `SKYBOOK_CORS_ALLOWED_ORIGINS` | Production | Comma-separated exact origins, e.g. `https://skybook.example.com` |
| `APP_BASE_URL` | For reset links | Public frontend origin used in generated reset links |
| `FARE_WATCH_INTERVAL_MINUTES` | No | Default `30`; uses database fares only |
| `PORT` | No | Default `8080` |
| `SKYBOOK_ADMIN_EMAIL` / `SKYBOOK_ADMIN_PASSWORD` | Production bootstrap / rotation | Production bootstrap only when no `admin@skybook.com` account exists; password must be 12+ characters. Also used by `set-admin-password.js` |
| `SKYBOOK_DEV_ADMIN_PASSWORD` | Development only | Fallback for the local `admin@skybook.com` seed; default `Admin@123`. Never use a demo value in production |
| `SKYBOOK_ALLOW_DEMO_ACCOUNTS` | Demo stacks only | Leave unset/false in production. Setting `true` permits the documented demo passwords |
| `TRUST_PROXY` | Behind a reverse proxy | Set `1` only when a trusted proxy sets client IP headers |

Production behaviour:

- The server refuses to start if `JWT_SECRET` is missing, shorter than 32 characters, or the old built-in default.
- The server refuses to start while `admin@skybook.com` or `demo@skybook.com` still uses its documented demo password, unless `SKYBOOK_ALLOW_DEMO_ACCOUNTS=true`.
- If `SKYBOOK_CORS_ALLOWED_ORIGINS` is empty in production, cross-origin browser access is disabled (same-origin deployment through Nginx/Caddy is unaffected).
- Auth endpoints use in-process rate limiting. This is per server process; use a shared store or proxy-level limiting for multi-instance deployments.

## Local deployment (verified)

Prerequisites: Node.js 20+, npm, MySQL/MariaDB running with a `skybook` database and application user.

```powershell
cd D:\airline-reservation
npm ci
Copy-Item .env.example .env
# Edit .env with real local values and a random 32+ character JWT_SECRET

# Produce the production frontend bundle
npm run build

# Start the API (terminal 1)
npm run dev:server

# Start Vite dev server (terminal 2) or serve dist/ with any static host that proxies /api
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080` (`vite.config.ts`). For a static production build, serve `dist/` and reverse-proxy `/api` to the Node backend on the same origin.

Startup performs the schema guard and prints the database and CORS mode. Check:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Expected shape: `{ ok: true, tables: 14, db: "mysql" }` (table count may grow with future migrations).

To initialize or rotate the administrator password without editing source:

```powershell
$env:SKYBOOK_ADMIN_EMAIL="admin@skybook.com"
$env:SKYBOOK_ADMIN_PASSWORD="Admin@123"   # development example; use a long unique value elsewhere
node src/backend/set-admin-password.js --apply
```

### Data setup and maintenance

```powershell
node src/backend/seed-airports-flights.js   # core airports + schedule (idempotent)
node src/backend/seed-network.js            # additional airports/routes (idempotent)
node src/backend/extend-flights.js          # refresh the 30-day sample window
```

The live host database is the canonical dataset. The Docker `db_data` volume is separate. The current verification used a repaired copy on `:3307` because the original `:3306` Aria tables are unrepaired. Never copy a production dump over a database without a reviewed backup and restore test.

### Tests before release

```powershell
node src/backend/api-test.js
node src/backend/e2e-flow-test.js
node src/backend/journey-verify.js
node src/backend/extended-api-test.js
node src/backend/integrity-check.js
node src/backend/cleanup-test-data.js --apply
npm run build
npx eslint src
```

Latest verified results are recorded in `README.md` and `AI_PROGRESS.md`.

## Docker Compose (reviewed, not verified this session)

`compose.yaml` defines:

1. `db`: MariaDB 10.11 with a named volume `db_data`; the SQL initializer runs only on a first, empty volume.
2. `backend`: the Node API, `NODE_ENV=production`, waiting for a healthy database.
3. `frontend`: Nginx serving the built frontend and proxying `/api`; published only on `127.0.0.1:8081` by default.

Required `.env` values for Compose include `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET` and, for production, `SKYBOOK_CORS_ALLOWED_ORIGINS`. Compose now fails fast if `JWT_SECRET` is missing instead of falling back to a weak default.

Because the initializer seeds the demo accounts, a production-mode Compose start will refuse to run until you either:

- change the administrator and demo passwords and remove/disable the demo account, or
- explicitly set `SKYBOOK_ALLOW_DEMO_ACCOUNTS=true` for a demo-only deployment.

Commands (once Docker is available):

```powershell
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8081/api/health
```

`docker compose down` keeps the database volume. `docker compose down -v` deletes it; never use `-v` on a volume holding data you need.

The Docker path was not executed in the final session. Treat it as an unverified deployment option until you run the commands above and test login, search, booking, cancellation and admin access.

## Production hardening checklist

- [ ] Use a dedicated database user, not `root`; restrict network access to the database.
- [ ] Set a unique `JWT_SECRET` of 32+ random characters in a secret manager.
- [ ] Set `SKYBOOK_CORS_ALLOWED_ORIGINS` to the exact HTTPS origin(s).
- [ ] Change/remove all demo accounts; keep `SKYBOOK_ALLOW_DEMO_ACCOUNTS` unset.
- [ ] Put the app behind HTTPS (Caddy, Nginx, or a cloud load balancer).
- [ ] Keep the database port and backend port off the public internet.
- [ ] Configure encrypted, off-host database backups and test a restore.
- [ ] Set `TRUST_PROXY=1` only if a trusted reverse proxy supplies client IPs; otherwise rate-limit at the proxy.
- [ ] Use a shared rate-limit store or proxy rate limiting for multiple backend instances.
- [ ] Configure an email provider before enabling password-reset delivery (currently not configured).
- [ ] Integrate a payment provider before describing bookings as paid; the current system collects no money.
- [ ] Replace sample fares/schedules with an authorized data source before real-world use.
- [ ] Re-run the full test suite and a browser smoke test after every deployment.

## Cloud VPS notes

A small single-host VPS is sufficient for a demo or low-traffic deployment. The important constraints are the same as above:

- Publish only HTTPS (and SSH from your administrative IP).
- Keep MariaDB and the Node API off public ports.
- Use a domain and DNS A/AAAA records before provisioning certificates.
- Store secrets only on the server/secret manager, never in Git.
- Back up the database volume and logical dumps independently of the VM.
- A single VM is not high availability; provider snapshots are not a substitute for tested database backups.

## Git

The workspace is a Git repository on `main`. No commit, push, reset or branch deletion was performed. Review `git status` and stage only the intended source, tests and documentation. Never stage `.env`, `node_modules`, `dist`, database dumps or `src/backend/skybook.db`. `.env.example` contains placeholders only.
