# SkyBook Airline Reservation System

SkyBook is an airline reservation application with a React, TypeScript, and Vite frontend and a Spring Boot backend backed by MariaDB/MySQL. The project includes flight search, JWT-based authentication, seat selection and reservations, a flight-status lookup, user and admin dashboards, fare watches, and a rule-based trip planner.

## Run locally

### Frontend

Install dependencies and start Vite from the project root:

```powershell
npm install
npm run dev
```

The frontend reads its API base URL from `VITE_API_URL` or `VITE_API_BASE_URL`. Leave it unset when using a same-origin API proxy; otherwise point it at the backend URL.

### Spring Boot backend

Configure the database connection and a sufficiently long `JWT_SECRET` through environment variables, then run:

```powershell
.\backend-java\gradlew.bat -p .\backend-java bootRun
```

The backend expects an existing MariaDB/MySQL database and preserves its schema/data rather than applying destructive automatic DDL. Feature-specific tables are initialized additively. The `/api/health` endpoint reports backend availability.

### Docker Compose

Set the database credentials and `JWT_SECRET` in the Compose environment, then run:

```powershell
docker compose up --build
```

Compose publishes the frontend on `http://localhost:8081` by default and keeps the MariaDB data in its named volume. Do not commit passwords, JWT secrets, or other credentials.

## Feature and data notes

- Flight status uses active flight schedules stored in SkyBook. It is not a verified, real-time airline operations feed; terminal, gate, and baggage details are shown only if supported data becomes available.
- Travel-planner recommendations are rule-based and use the available SkyBook flight catalog. No external AI provider is configured.
- Fare watches and their timestamped snapshots use SkyBook catalog fares. They are not live market-price alerts from airlines or a third-party pricing service.
- Admin revenue is derived from confirmed booking records. SkyBook does not collect payments.
- Booking references confirm reservations in SkyBook; they are not airline boarding passes.
- Newsletter signups are stored in the application database. No email delivery provider is configured.

## Validation

From the project root:

```powershell
npm run build
npx eslint src\App.tsx src\FeaturePages.tsx
```

Run the backend tests with a process-local test secret:

```powershell
$env:JWT_SECRET = "replace-with-a-local-test-secret-of-at-least-32-characters"
.\backend-java\gradlew.bat -p .\backend-java test
```
