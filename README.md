# SkyBook Airline Reservation System

SkyBook is a full-stack airline reservation demo with a **React 19 + TypeScript + Vite** frontend and a **Node.js/Express + MySQL/MariaDB** backend. It includes flight search, JWT authentication, an interactive seat map, PNR bookings, cancellation, customer and administrator dashboards, fare watches, a rule-based travel planner, flight-status lookup, reports and an audit log.

> **Honest status:** SkyBook is a working demonstration platform, not a payment-enabled airline system. Fares and schedules are sample data; no payment gateway, email/SMS provider or live airline feed is configured. See [Limitations](#limitations).

## Authoritative architecture

| Layer | Implementation |
|-------|----------------|
| Frontend | React 19, TypeScript, Vite (`src/`) |
| Backend | Node.js, Express 5, `mysql2` (`src/backend/server.js`) |
| Database | MySQL/MariaDB, database `skybook` (normally host `127.0.0.1:3306`; current verification used a repaired copy on `:3307`) |
| Auth | JWT (HS256, 7-day expiry) + bcrypt hashes |
| Dev proxy | Vite `/api` → `http://localhost:8080` |

**`src/backend/server.js` is the only application backend.** `backend-java/` is an unwired Spring Boot experiment and is not started or used by the frontend. `src/backend/skybook.db` is a 12 MB SQLite leftover from an earlier implementation and is not read by the current server.

Schema upgrades live in `src/backend/db-schema.js`. The server runs this idempotent guard at startup; it adds missing tables/columns/indexes and normalises the airport collation without dropping data. The live database currently has **14 tables**, **72 airports**, and **8,527 active flights**.

## Run locally (Windows PowerShell)

Prerequisites: Node.js 20+, npm, and a running MySQL/MariaDB server with a `skybook` database.

```powershell
cd D:\airline-reservation
npm install

# 1. Configure the root .env (database, JWT, CORS)
Copy-Item .env.example .env
# Edit .env with your MySQL credentials and a random JWT_SECRET (32+ chars)

# 2. Start frontend + backend together
npm run start          # Vite http://localhost:5173, API http://localhost:8080
```

Or run them separately:

```powershell
npm run dev:server     # API only, port 8080
npm run dev            # Vite only, port 5173
```

The backend reads the project-root `.env` first. `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_SSL` (plus optional CA settings), `JWT_SECRET`, `SKYBOOK_CORS_ALLOWED_ORIGINS`, `APP_BASE_URL`, `FARE_WATCH_INTERVAL_MINUTES` and the Docker-only `SKYBOOK_ADMIN_*` bootstrap variables are supported (see `.env.example`).

### Seed and maintain sample data

```powershell
node src/backend/seed-airports-flights.js   # 56 core airports + 30-day schedule (idempotent)
node src/backend/seed-network.js            # 16 additional airports + routes (idempotent)
node src/backend/extend-flights.js          # refresh the 30-day window (idempotent)
```

The airport catalogue is stored in the database and served by `GET /api/airports`; search, the rule-based travel planner, fare watch and the admin airport screen all use it. The frontend keeps a bundled fallback list only for offline/failed API calls.

## Main routes

| Route | Purpose |
|-------|---------|
| `/` | Home, search, seat map, booking, PNR lookup, booking history |
| `/dashboard` | Customer dashboard (overview, bookings, fare watches, notifications, profile) |
| `/admin/login` | Dedicated administrator sign-in (rejects non-admin accounts server-side) |
| `/admin` | Administrator dashboard (dashboard, flights, airports, bookings, users, analytics, settings, fare watches, audit log) |
| `/forgot-password`, `/reset-password` | Password recovery (delivery limitations apply) |
| `/planner`, `/fare-watches`, `/notifications`, `/flight-status` | Planner, fare watch, notifications and status tools |

### Demo accounts (development only)

| Account | Email | Password |
|---------|-------|----------|
| Administrator | `admin@skybook.com` | `Admin@123` |
| Customer | `demo@skybook.com` | `demo123` |

These are documented demo credentials, not production credentials. In production the server refuses to start while either account still uses its demo password unless `SKYBOOK_ALLOW_DEMO_ACCOUNTS=true` is explicitly set for a demo deployment. Admin accounts are stored in the `admins` table; admin routes verify the role from the database on every request. The admin password is hashed in the database and is never shipped in the frontend.

To initialize or rotate the administrator password without editing source code, set `SKYBOOK_ADMIN_EMAIL` and `SKYBOOK_ADMIN_PASSWORD`, then run:

```powershell
node src/backend/set-admin-password.js --apply
```

The development seed fallback is controlled by `SKYBOOK_DEV_ADMIN_PASSWORD` (default `Admin@123`). Production bootstrap uses `SKYBOOK_ADMIN_EMAIL`/`SKYBOOK_ADMIN_PASSWORD` and requires a password of at least 12 characters.

## Tests

The backend must be running for API tests. Commands are run from the project root:

```powershell
node src/backend/api-test.js             # 30 API checks
node src/backend/e2e-flow-test.js        # 22 end-to-end flows
node src/backend/journey-verify.js       # 84 journey + admin + DB checks (self-cleaning)
node src/backend/extended-api-test.js    # 40 account/admin/catalogue/report checks
node src/backend/admin-security-test.js  # 25 admin auth/validation/safe-removal checks
node src/backend/integrity-check.js      # duplicate / orphan / seat-inventory audit (read-only)
node src/backend/verify-seed-hashes.js   # development seed credential hash check
node src/backend/cleanup-test-data.js --apply   # remove QA users/flights created by suites
```

Frontend validation:

```powershell
npm run build       # tsc -b && vite build
npx eslint src      # source lint
```

Latest verified results (2026-10-28):

```
api-test.js:                  30 / 30 passed
e2e-flow-test.js:             22 / 22 passed
journey-verify.js:            84 / 84 passed (with MYSQL_PORT=3307)
extended-api-test.js:         40 / 40 passed
admin-security-test.js:      25 / 25 passed
tsc -b / vite build:          clean
eslint src:                   clean
browser (dev):                dedicated admin sign-in, wrong-password handling,
                              direct-access rejection, all admin tabs, flight
                              filters, permanent delete and mobile layout
integrity-check.js:           0 issue groups (last full run 2026-10-21;
                              final rerun not completed)
```

The test suites create labelled QA accounts (`test_*@test.com`, `e2e_*@test.com`) and test flights. `cleanup-test-data.js --apply` removes them; it never matches the two genuine demo accounts.

## Features and data notes

- **Search / seat map / bookings / cancellation** are database-backed. Seats are reserved with row locks inside a transaction; cancellation follows a configurable 2-hour policy and releases seats.
- **Cabin pricing:** Economy uses the flight fare; Business is 2.5× the base fare. The seat map only allows seats that belong to the selected cabin.
- **PNRs** (`SKB-XXXXXX`) identify reservations in SkyBook. They are not airline tickets or boarding passes.
- **Flight search results** show duration, stops, aircraft and baggage allowance when recorded. Missing metadata is shown as “TBA”.
- **Fare watches** re-read SkyBook's own `flights.price` values on a schedule (`FARE_WATCH_INTERVAL_MINUTES`, default 30). No live market feed is used.
- **Flight status** uses SkyBook schedule data, not an airline operations feed.
- **Travel planner** is rule-based and local; no external AI provider is configured.
- **Admin revenue** is recorded booking value, not money collected.
- **Notifications and newsletter signups** are stored in the database. No delivery provider is configured.
- **Reports** are JSON by default and CSV when `?format=csv` is supplied. Downloads are generated server-side from database rows.

## Limitations

1. **No payment gateway.** No card data is collected and no money moves. Cancellation returns `refund.status: "not-applicable"` with that explanation.
2. **No email/SMS delivery.** Password reset in development returns a clearly labelled one-time reset link; in production the API returns only a generic message and cannot deliver a link. Connect a provider before enabling self-service reset for real users.
3. **Sample schedules and fares.** The 30-day window is generated data. Re-run `extend-flights.js` to keep it fresh.
4. **No live airline/price/status feed.**
5. **Admin flight removal is safe.** Flights are archived by default; permanent deletion is only available for archived flights with no booking history. The last active administrator cannot be demoted or disabled.
6. **Docker Compose was verified in GitHub Actions** by `.github/workflows/docker-smoke.yml`: images built, the fresh MariaDB stack started, `/api/health` passed, and the API/E2E suites passed (30/30 and 22/22). The local Docker Desktop WSL daemon was unavailable on this Windows host, so local Docker execution was not possible. The local Vite + Node stack was also verified against a repaired MariaDB copy on `:3307`; the original host MariaDB on `:3306` remains unrepaired.
7. **`backend-java/` and `src/backend/skybook.db` are legacy/unused.** They are intentionally left in place rather than deleted, and are excluded from Docker images.
8. **Deployment work is committed and pushed to `main`.** No force-push or history rewrite was performed. Online deployment is still pending the hosting/database account access described in `DEPLOYMENT.md`.

## Project layout

```
src/
  App.tsx                 # public site, search, seat map, booking, booking history
  CustomerDashboard.tsx   # /dashboard customer workflows
  AdminDashboard.tsx      # /admin administrator workflows
  AuthPages.tsx           # forgot/reset password pages
  FeaturePages.tsx        # planner, fare watch, notifications, status
  api.ts                  # fetch wrapper (JWT + 401 handling)
  App.css                 # design tokens, dark theme, responsive + print styles
  backend/
    server.js             # authoritative Express API
    extensions.js         # dashboard, reports, auth recovery, admin + scheduler routes
    db-schema.js          # idempotent schema guard + 72-airport catalogue
    set-admin-password.js # one-time admin password initialization / rotation
    prepare-deployment-users.js # Docker/PaaS account rotation + empty-DB bootstrap
    db-config.js          # shared MySQL TLS/connection options
    rate-limit.js         # auth brute-force limiter
    api-test.js, e2e-flow-test.js, journey-verify.js,
    extended-api-test.js, admin-security-test.js, integrity-check.js,
    cleanup-test-data.js
    seed-airports-flights.js, seed-network.js, extend-flights.js
database/skybook.sql      # base schema + development seed for the Docker initializer
compose.yaml              # db + API + Nginx stack
compose.ci.yaml           # CI-only API port override
Dockerfile.render         # single-container SPA + API image for Render
render.yaml               # Render Blueprint (external managed MySQL)
.github/workflows/docker-smoke.yml # Docker build + fresh-DB smoke test
```

## Docker Compose (local / self-hosted)

`compose.yaml` defines MariaDB, the Node backend and an Nginx frontend. It uses a **separate** `db_data` volume; it never touches the host MariaDB database.

1. Copy `.env.example` to `.env` and replace every placeholder.
2. Set `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET` and a **new** `SKYBOOK_ADMIN_PASSWORD` (12+ characters). Leave `SKYBOOK_DEMO_PASSWORD` empty to disable the seeded demo customer, or set a strong value only for a deliberate demo stack.
3. Build and start:

```powershell
docker compose --env-file .env config --quiet
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8081/api/health
```

The frontend is published on `127.0.0.1:8081` by default. The backend entrypoint waits for MariaDB, creates the base schema if the database is empty, rotates the seeded administrator to `SKYBOOK_ADMIN_PASSWORD`, and then starts the API. This is why the documented development password never becomes the production password.

`docker compose down` keeps the database volume. `docker compose down -v` deletes it; never use `-v` on a volume holding data you need.

### Render + managed MySQL (free-tier online option)

The repository includes `Dockerfile.render` and `render.yaml` for a **single-container** deployment: Node serves the built React app and `/api` from the same origin. Render's free web service has no persistent disk, so the MySQL database must be external. An always-free Aiven MySQL service is the intended free companion; it requires an Aiven account and may power off after inactivity. Render free web services also sleep after inactivity.

1. Create an Aiven MySQL service and copy its host, port, database, user, password and CA certificate.
2. Create a Render Blueprint from the GitHub repository; Render reads `render.yaml`.
3. Fill the `sync: false` environment variables in the Render dashboard: `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `JWT_SECRET`, `SKYBOOK_ADMIN_EMAIL`, `SKYBOOK_ADMIN_PASSWORD`, and `APP_BASE_URL` (the final Render URL).
4. If Aiven requires a custom CA, set `MYSQL_SSL_CA_BASE64` to the base64-encoded CA contents; otherwise leave `MYSQL_SSL=true` and the default `MYSQL_SSL_REJECT_UNAUTHORIZED=true`.
5. Deploy. The first API start creates the base schema in the empty managed database. Open `/api/health`, then test login, registration, search, booking and `/admin`.

See `DEPLOYMENT.md` for the full checklist and limitations. Never commit the Render/Aiven secrets or a real `.env`.
