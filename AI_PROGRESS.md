# SkyBook – AI Session Progress Notes

**Last updated:** 2026-10-28 · **Session:** 7
**Project root:** `D:\airline-reservation`
**Working branch:** `main` (all changes uncommitted; nothing was committed, pushed or reset)

---

## Current authoritative architecture

| Layer | Implementation |
|-------|----------------|
| Frontend | React 19 + TypeScript + Vite (`src/`) |
| Backend | Node.js + Express 5 + `mysql2` (`src/backend/server.js`) |
| Database | MySQL/MariaDB database `skybook` (normally host `127.0.0.1:3306`; current verification used a repaired copy on `:3307`) |
| Auth | JWT HS256 (7 days) + bcrypt hashes; admins verified from the `admins` table |
| Dev proxy | Vite `/api` → `http://localhost:8080` |

`src/backend/server.js` is the **only** backend used by the frontend. `backend-java/`
is an unwired Spring Boot experiment and is never started by the current app.
`src/backend/skybook.db` is an unused 12 MB SQLite leftover. Neither was deleted.

The Docker `db_data` volume (when Docker is used) is isolated from the host MariaDB
database. The host `skybook` database is the canonical development dataset; because
the original `:3306` Aria tables are currently unrepaired, verification used a repaired
copy on `:3307`.

### Database at end of session

| Metric | Value |
|--------|-------|
| Tables | 14 |
| Airports | 72 (canonical IATA catalogue) |
| Flights (active / upcoming) | 8,527 / 6,178 |
| Seats | 1,404,320 |
| Users | 3 (1 administrator, 1 demo customer, 1 genuine customer) |
| Bookings | 1 genuine confirmed booking (`SKB-Z3MJY6`); QA data cleaned |
| Fare watches | 0 |
| Notifications | 1 |
| Admin audit rows | 192 (append-only; includes QA actions) |
| Issue groups from `integrity-check.js` | 0 (last full run 2026-10-21; final rerun interrupted) |

The 30-day schedule is sample data. Re-run `extend-flights.js` when the window
needs to move forward.

---

## Session 7 (current)

### Separate admin access

- `/admin/login` remains a dedicated page and now authenticates against
  `/api/admin/login`, which checks the database role server-side. Customer
  accounts receive `403`; anonymous admin API calls receive `401`.
- The admin password is hashed in `users.passwordHash` and is never present in
  frontend code. The development seed fallback is `SKYBOOK_DEV_ADMIN_PASSWORD`
  (default `Admin@123`); production bootstrap uses `SKYBOOK_ADMIN_EMAIL` /
  `SKYBOOK_ADMIN_PASSWORD`.
- Added `src/backend/set-admin-password.js` for one-time initialization or
  rotation. It requires `--apply` and never prints the plaintext password.
- Updated `database/skybook.sql`, `verify-seed-hashes.js`, tests and docs to the
  new development administrator credential.
- Failed sign-in attempts no longer fire the global session-expiry redirect, so
  a wrong admin password stays on the admin sign-in screen with an error.

### Admin dashboard and management

- Navigation is now Dashboard, Flights, Airports, Bookings, Users, Fare Watches,
  Analytics, Settings, Audit Log. The Analytics tab contains the existing
  reports/CSV tools.
- Flight creation now inserts the flight, seat inventory and audit entry in one
  transaction.
- `DELETE /api/admin/flights/:id` is a guarded archive: it validates the id,
  refuses to remove a flight with `CONFIRMED`/`PENDING` bookings, and audits the
  action.
- Added `DELETE /api/admin/flights/:id/permanent` for archived flights with no
  booking history. The UI shows a confirmed Delete action only for those rows.
- Added strict boolean, numeric, id and JSON-body validation for admin
  user/flight status, settings, flight updates, booking ids and airport ids.
- Fixed admin list filters so Apply uses the submitted values immediately, and
  stale in-flight list responses can no longer overwrite a newer filter result.

### Session 7 verification (2026-10-28)

| Check | Result |
|-------|--------|
| `api-test.js` | 30 / 30 passed |
| `e2e-flow-test.js` | 22 / 22 passed |
| `journey-verify.js` (with `MYSQL_PORT=3307`) | 84 / 84 passed |
| `extended-api-test.js` | 40 / 40 passed |
| `admin-security-test.js` | 25 / 25 passed |
| `tsc -b` / `vite build` | clean |
| `eslint src` | clean |
| Browser | dedicated admin login, wrong-password state, direct-access rejection, customer-token rejection, all 9 admin tabs, flight search/filter, archived-flight permanent delete, and mobile layout without console errors |
| `verify-seed-hashes.js` | `Admin@123` and `demo123` match |
| `integrity-check.js` | 0 issue groups (last full run 2026-10-21; final rerun interrupted) |

---

## Session 6 (previous session)

### Database, schema and data

- Added `src/backend/db-schema.js` with an idempotent startup guard:
  - 72-airport catalogue (50 Indian + 22 international), preserving `"City (CODE)"` flight display strings.
  - New tables: `app_settings`, `admin_audit_log`, `password_reset_tokens`.
  - New columns for users, flights, bookings, fare watches, notifications and airports.
  - Indexes, defaults and `utf8mb4_unicode_ci` enforcement on `airports`.
  - Development-only admin seed; production requires `SKYBOOK_ADMIN_EMAIL`/`SKYBOOK_ADMIN_PASSWORD` or manual creation.
- Ran `seed-network.js`: +1,984 flights and +357,120 seats across 16 additional airports.
- Fixed a timezone bug where `seed-network.js` wrote seat `travelDate` one day before the
  flight (`toISOString()` on a local-midnight `Date`).
  - Repaired 357,120 unbooked seat rows in a guarded one-off update (refused if any seat
    was attached to a booking).
  - Switched seed scripts to local calendar dates and `dateStrings: true` so it cannot recur.
- Fixed the admin-overview collation error (`ER_CANT_AGGREGATE_2COLLATIONS`).

### Backend

- Added `rate-limit.js` (in-memory, cleanup, `Retry-After`).
- Added `extensions.js` with:
  - Public settings and app metadata.
  - Auth: profile, change password, forgot/reset password, logout.
  - Customer: overview, booking search/detail, PNR lookup, fare-watch edit/check, unread count.
  - Admin: overview, flights list/edit/status, bookings list/detail/status, users role/status,
    airports list/edit, fare-watch recheck, reports (JSON + CSV), settings, audit log.
  - Fare-watch scheduler and audit/notification helpers.
- Wired the authoritative server:
  - Schema guard, production JWT/admin credential guards, CORS allow-list (production
    same-origin by default), auth rate limiting, DB-verified `requireAuth`/`requireAdmin`.
  - Atomic booking creation with row locks, cabin multiplier, promo validation via
    `airports.region`, fare breakdown and exact seat inventory.
  - Cancellation policy, transaction, seat release and honest `refund: not-applicable`.
  - Admin flight creation against the airport catalogue with exact seat inventory and audit.
  - DB-backed `/api/destinations`, graceful shutdown and scheduler startup.
- Fixed booking date handling: the API now accepts full ISO timestamps but always queries
  the DATE column with `YYYY-MM-DD`. This fixed a real UI booking failure (“Seat A1 was taken”).
- Added server-side cabin/seat validation (Business = rows 1–2, Economy = rows 3+).
- Split legacy admin dashboard semantics: `activeFlights` now means all active flights;
  `upcomingFlights` is the departure-date subset.
- Fixed the legacy admin partial-update date bug (mysql2 returns `Date` objects).
- Production hardening:
  - JWT secret must be 32+ characters and not the old default.
  - Compose now requires `JWT_SECRET` instead of falling back to a weak value.
  - Refuses to start if the documented demo passwords remain in production unless
    `SKYBOOK_ALLOW_DEMO_ACCOUNTS=true`.
  - Added bootstrap admin environment variables and production CORS behaviour.
  - Normalised local calendar dates for dashboard ranges and admin flight creation.

### Frontend

- `App.tsx`:
  - `/admin*` → `AdminDashboard`, `/dashboard` → `CustomerDashboard`.
  - `/forgot-password`, `/reset-password`, forgot-password link.
  - Removed the old inline admin panel.
  - Airport autocomplete fed by `/api/airports` (bundled list only as offline fallback).
  - Search cards show duration, stops, aircraft and baggage allowance.
  - Cabin picker (Economy/Business) with reset-on-change and cabin-aware fare summary.
  - Seat selection validates the cabin rows and sends `cabinClass`.
  - Booking sends date-only `travelDate`; date labels are formatted instead of raw ISO.
- `CustomerDashboard.tsx`: guest prompt, sidebar/tabs, overview stats/trips/activity,
  booking search/status/date filters + pagination + detail modal + cancel + print itinerary,
  fare-watch target edit/pause/resume/recheck/remove, notifications mark-read,
  profile edit, password change, preferences and sign out.
- `AdminDashboard.tsx`: admin-only login (rejects non-admins, no prefill), overview range
  and charts, flights CRUD/archive, booking moderation, user role/status with last-admin
  protection, airports, fare-watch recheck, reports/CSV, settings and searchable audit log.
- `AuthPages.tsx`: forgot/reset password pages. Development shows a labelled one-time
  reset link; production returns only a generic message.
- `App.css`: dashboard/admin/auth/print/cabin/result-fact styles, design tokens, dark theme,
  focus states, reduced-motion support, responsive blocks and a single print stylesheet.

### Tests and verification

Latest results (2026-10-21):

| Check | Result |
|-------|--------|
| `api-test.js` | 30 / 30 passed |
| `e2e-flow-test.js` | 22 / 22 passed |
| `journey-verify.js` | 84 / 84 passed |
| `extended-api-test.js` | 40 / 40 passed |
| `integrity-check.js` | 0 issue groups |
| `tsc -b` | clean |
| `vite build` | clean (`dist/`) |
| `eslint src` | clean |
| Browser smoke test (dev) | customer dashboard, admin dashboard/login/all tabs, search, Business-cabin booking, confirmation modal, dashboard detail and cancellation worked with no console errors |

`cleanup-test-data.js --apply` was run after the suites. It removes only
`test_*@test.com` / `e2e_*@test.com` users and their dependent rows, plus test flights;
it never matches `admin@skybook.com` or `demo@skybook.com`.

### Honest limitations

1. **No payment gateway.** No money is collected, no card data is stored. Cancellation
   returns `refund.status: "not-applicable"` with an explanation.
2. **No email/SMS provider.** Password reset cannot deliver a link. Development returns a
   labelled token/URL; production returns a generic message only.
3. **No live airline/price/status feed.** Schedules and fares are sample data; fare watches
   only re-read SkyBook's own database prices.
4. **The Travel Planner is rule-based and local.** No external AI provider is configured.
5. **Docker Compose was not re-verified in this session** because the Docker daemon was
   unavailable. The local Vite + Node path was verified against a repaired MariaDB copy
   on `:3307`; the original host MariaDB on `:3306` remains unrepaired.
6. **Rate limiting is in-process.** Multi-instance deployments need a shared store or
   proxy-level limiting.
7. **`backend-java/` and `src/backend/skybook.db` are legacy/unused.** Left in place
   intentionally.
8. **No commit/push.** All work remains uncommitted on `main`.

### Useful commands

```powershell
npm run start                           # Vite :5173 + API :8080
npm run build                           # tsc -b && vite build
npx eslint src

node src/backend/api-test.js
node src/backend/e2e-flow-test.js
node src/backend/journey-verify.js
node src/backend/extended-api-test.js
node src/backend/integrity-check.js
node src/backend/verify-seed-hashes.js
node src/backend/cleanup-test-data.js --apply

node src/backend/seed-airports-flights.js
node src/backend/seed-network.js
node src/backend/extend-flights.js
```

### Demo accounts (development only)

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@skybook.com` | `Admin@123` |
| Customer | `demo@skybook.com` | `demo123` |

Documented demo credentials only. Production start refuses to use them unless
`SKYBOOK_ALLOW_DEMO_ACCOUNTS=true` is explicitly set for a demo stack.

---

## Earlier sessions (summary)

- **Session 1:** Express backend on MySQL/MariaDB, base schema and seed data.
- **Session 2:** Fixed `.env` precedence and incorrect bcrypt hashes; extended schedule
  from 3 to 30 days; added `create-db-user.js`, `extend-flights.js`, `api-test.js`.
- **Session 3:** Replaced the stale SQLite Docker build with the MySQL backend; added
  `e2e-flow-test.js`, seed-hash verification, the `airports` table and `/api/airports`.
- **Session 4:** Docker Compose rework, schema/data preservation work, test cleanup.
- **Session 5:** Large UI/UX upgrade (tokens, dark theme, accessibility, deduplicated CSS),
  phase-1 schema/API audit, network seed expansion, customer and admin dashboards,
  password-recovery pages and the extended API suite.

The detailed history above is intentionally condensed; current code and the test suites
are the source of truth. `README.md` and `DEPLOYMENT.md` describe the current architecture
and the verified/unverified deployment paths.
