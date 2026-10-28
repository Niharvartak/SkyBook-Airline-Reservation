# SkyBook Deployment

**Last updated:** 2026-10-28

## Status

| Path | Status |
|------|--------|
| Local Vite frontend (`:5173`) + Node/Express backend (`:8080`) + repaired MariaDB copy (`:3307`) | **Verified:** build, lint, API and browser-flow suites pass |
| Original host MariaDB (`:3306`) | **Blocked:** the original Aria tables are unrepaired; use the copy until recovery is explicitly approved |
| Docker Compose (`db` + `backend` + Nginx frontend) | **Verified in GitHub Actions** by `.github/workflows/docker-smoke.yml`: fresh MariaDB stack, health check, API suite 30/30, E2E suite 22/22 |
| Render single-container + Aiven MySQL | **Prepared, not deployed:** requires a Render account and an Aiven MySQL service |

Do not claim a deployment is live until `/api/health` and the login/booking/admin flows have been tested against the public URL.

## Authoritative application

- Backend: `src/backend/server.js` (Express 5 + `mysql2`). This is the only backend used by the frontend.
- Frontend: `src/` (React 19 + TypeScript + Vite). Production output is `dist/`.
- Database: MySQL/MariaDB, normally database `skybook`.
- Schema migrations: `src/backend/db-schema.js` runs an idempotent guard at startup. It adds missing tables, columns and indexes, normalises the airport collation, and does not drop application data. If the database is completely empty, it creates the base schema from `database/skybook.sql`.
- Airport catalogue: stored in the `airports` table and served by `GET /api/airports`.
- `backend-java/` is an unwired Spring Boot experiment and is not deployed.
- `src/backend/skybook.db` is an unused SQLite leftover; the current server never reads it.

## Environment variables

Create `.env` from `.env.example`. Never commit real secrets.

| Variable | Required | Notes |
|----------|----------|-------|
| `MYSQL_HOST` | Yes | `127.0.0.1` for local host MariaDB; Compose service name is `db`; Aiven host for online |
| `MYSQL_PORT` | No | Default `3306`; Aiven may use a non-default port |
| `MYSQL_DATABASE` | Yes | `skybook` locally; Aiven often uses `defaultdb` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Yes | Dedicated application user; do not use `root` in production |
| `MYSQL_SSL` | Managed MySQL | Set `true` for Aiven/other managed services that require TLS |
| `MYSQL_SSL_CA` / `MYSQL_SSL_CA_BASE64` | Optional | Custom CA file path or base64-encoded CA contents |
| `MYSQL_SSL_REJECT_UNAUTHORIZED` | Optional | Default `true`; only set `false` if the provider cannot supply a usable CA |
| `MYSQL_ROOT_PASSWORD` | Compose only | Used only by the MariaDB container |
| `JWT_SECRET` | Yes | At least 32 random characters; production start fails otherwise |
| `SKYBOOK_CORS_ALLOWED_ORIGINS` | Separate frontend only | Comma-separated exact origins; leave empty for same-origin Nginx/Render |
| `APP_BASE_URL` | For reset links | Public frontend origin used in generated reset links |
| `FARE_WATCH_INTERVAL_MINUTES` | No | Default `30`; uses database fares only |
| `PORT` | No | Default `8080`; Render supplies its own port |
| `HOST` | No | Default `0.0.0.0`; Docker/Render use this |
| `SERVE_FRONTEND` | Single-container only | `true` makes Express serve `dist/`; Compose uses Nginx and leaves it `false` |
| `SKYBOOK_ADMIN_EMAIL` / `SKYBOOK_ADMIN_PASSWORD` | Docker/Render production | Entrypoint rotates/creates this administrator before the API starts; password must be 12+ characters |
| `SKYBOOK_DEMO_PASSWORD` | Optional | Strong password for the demo customer in Docker; leave empty to disable it |
| `SKYBOOK_DEV_ADMIN_PASSWORD` | Development only | Fallback for the local `admin@skybook.com` seed; default `Admin@123` |
| `SKYBOOK_ALLOW_DEMO_ACCOUNTS` | Demo stacks only | Leave unset/false in production. `true` permits the documented demo passwords |
| `TRUST_PROXY` | Behind a reverse proxy | Set `1` only when a trusted proxy sets client IP headers |

Production behaviour:

- The server refuses to start if `JWT_SECRET` is missing, shorter than 32 characters, or the old built-in default.
- The Docker entrypoint runs `src/backend/prepare-deployment-users.js`. It rotates the seeded administrator to `SKYBOOK_ADMIN_PASSWORD`, disables the seeded demo customer unless `SKYBOOK_DEMO_PASSWORD` is set, and is idempotent. This happens before `assertProductionCredentials()` runs.
- The server also refuses to start if `admin@skybook.com` or `demo@skybook.com` still uses its documented demo password, unless `SKYBOOK_ALLOW_DEMO_ACCOUNTS=true`.
- If `SKYBOOK_CORS_ALLOWED_ORIGINS` is empty in production, cross-origin browser access is disabled. Same-origin deployments through Nginx or `SERVE_FRONTEND=true` are unaffected.
- Auth endpoints use in-process rate limiting. This is per server process; use a shared store or proxy-level limiting for multi-instance deployments.

## Local deployment (verified)

Prerequisites: Node.js 20+, npm, MySQL/MariaDB running with a `skybook` database and application user.

```powershell
cd D:\airline-reservation
npm ci
Copy-Item .env.example .env
# Edit .env with real local values and a random 32+ character JWT_SECRET

npm run build
npm run dev:server   # terminal 1: API on :8080
npm run dev          # terminal 2: Vite on :5173
```

The Vite dev server proxies `/api` to `http://localhost:8080` (`vite.config.ts`). For a static production build, serve `dist/` and reverse-proxy `/api` to the Node backend on the same origin.

Startup performs the schema guard and prints the database and CORS mode. Check:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
```

Expected shape: `{ ok: true, tables: 14, db: "mysql" }` (the table count may grow with future migrations).

To initialize or rotate the administrator password without Docker:

```powershell
$env:SKYBOOK_ADMIN_EMAIL="admin@skybook.com"
$env:SKYBOOK_ADMIN_PASSWORD="a-long-unique-value"
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

## Docker Compose

`compose.yaml` defines:

1. `db`: MariaDB 10.11 with a named volume `db_data`; the SQL initializer runs only on a first, empty volume.
2. `backend`: the Node API, `NODE_ENV=production`, waiting for a healthy database. The entrypoint then initialises/rotates accounts before starting Express.
3. `frontend`: Nginx serving the built frontend and proxying `/api`; published on `127.0.0.1:8081` by default.

Required `.env` values for Compose include `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET` and `SKYBOOK_ADMIN_PASSWORD`. Compose fails fast when a required value is missing. `SKYBOOK_DEMO_PASSWORD` is optional; leaving it empty disables the seeded demo customer.

Commands:

```powershell
docker compose --env-file .env config --quiet
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8081/api/health
```

Then test in a browser at `http://127.0.0.1:8081`: register a customer, sign in, search a route, create and cancel a booking, sign in at `/admin/login`, and open `/admin`. Check logs with:

```powershell
docker compose logs --tail=100 backend
docker compose logs --tail=100 db
```

`docker compose down` keeps the database volume. `docker compose down -v` deletes it; never use `-v` on a volume holding data you need.

The same stack is exercised by `.github/workflows/docker-smoke.yml` on every push to `main`. It builds both images, starts a fresh MariaDB volume, waits for `/api/health`, and runs `api-test.js` and `e2e-flow-test.js`. The workflow uses `compose.ci.yaml` only to publish the API on `127.0.0.1:8080` for those suites. The last run passed 30/30 API and 22/22 E2E tests.

Local Docker Desktop could not start on the development Windows host because its WSL bootstrap failed; the workflow provides independent Docker build/run verification. Do not treat that local-host limitation as a Compose configuration failure.

To publish a self-hosted Compose stack on a VPS, set `SKYBOOK_BIND_ADDRESS=0.0.0.0` only after configuring the host firewall and an HTTPS reverse proxy. Keep MariaDB and the backend off public ports.

## Render + Aiven MySQL (free-tier online option)

Render's free web service can run the included `Dockerfile.render`. It has no persistent disk, so it cannot host the MariaDB container. Use an external managed MySQL service. Aiven's always-free MySQL tier has no expiry and no credit card, but it is a single 1 GB node and idle services are powered off after notification. Render free web services sleep after inactivity.

1. Create an Aiven MySQL service and note the host, port, database, user, password, and CA certificate.
2. Push the repository to GitHub (Render deploys from the connected repository).
3. In Render, create a **Blueprint** from the repository. `render.yaml` defines one free Docker web service named `skybook`, health check `/api/health`, and the required environment-variable slots.
4. In the Render dashboard, fill every `sync: false` value:
   - `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
   - `JWT_SECRET` (32+ random characters)
   - `SKYBOOK_ADMIN_EMAIL`, `SKYBOOK_ADMIN_PASSWORD` (12+ characters)
   - `APP_BASE_URL` (the final `https://...onrender.com` URL)
5. If Aiven's CA is not in Node's trust store, set `MYSQL_SSL_CA_BASE64` to the base64-encoded CA contents. Keep `MYSQL_SSL=true`. Only set `MYSQL_SSL_REJECT_UNAUTHORIZED=false` if the provider cannot supply a usable CA.
6. Deploy. On the first start, `ensureBaseSchema()` creates the base tables in the empty managed database and the entrypoint prepares the administrator. The free service may need a minute to wake.
7. Verify:
   - `https://<service>.onrender.com/api/health`
   - customer registration/login, flight search, booking/cancellation
   - `/admin/login` with the environment-provided administrator

`Dockerfile.render` builds the Vite app with an empty `VITE_API_URL`, so the SPA calls `/api` on the same Render origin. Nginx is not used in this single-container mode. Do not put secrets in `render.yaml`; use Render's secret environment-variable fields.

Aiven free services can be powered off after inactivity; power them back on in the Aiven console. Render free services also sleep. This is suitable for a demo, not an always-on production SLA.

## Production hardening checklist

- [ ] Use a dedicated database user, not `root`; restrict network access to the database.
- [ ] Set a unique `JWT_SECRET` of 32+ random characters in a secret manager.
- [ ] Set `SKYBOOK_CORS_ALLOWED_ORIGINS` to exact HTTPS origins only when frontend and API are separate.
- [ ] Change/remove all demo accounts; keep `SKYBOOK_ALLOW_DEMO_ACCOUNTS` unset.
- [ ] Put the app behind HTTPS (Caddy, Nginx, Render, or a cloud load balancer).
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

The workspace is a Git repository on `main`. Review `git status` and stage only intended source, tests and documentation. Never stage `.env`, `node_modules`, `dist`, database dumps or `src/backend/skybook.db`. `.env.example` contains placeholders only. The Docker/Render files are committed so a hosting provider can build from GitHub.

## Known limitations

1. No payment gateway; no card data is collected and no money moves.
2. No email/SMS delivery; password reset is not self-service in production.
3. Sample schedules/fares; run `extend-flights.js` to refresh the 30-day window.
4. No live airline/price/status feed.
5. Docker Compose is verified in GitHub Actions, not on the local Windows Docker Desktop host (its WSL engine is broken). A local run should still be repeated on a working Docker host before a self-hosted production launch.
6. Render + Aiven is prepared but cannot be deployed without the user's Render and Aiven accounts.
7. `backend-java/` and `src/backend/skybook.db` are legacy/unused and are excluded from Docker images.
