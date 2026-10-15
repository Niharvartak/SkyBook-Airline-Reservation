# SkyBook — Experiment No. 05

## Aim and learning outcome

Integrate the existing Spring Boot SkyBook application with a relational database and perform persistent Flight CRUD using Spring Data JPA and Hibernate.

**Actual server:** XAMPP MariaDB 10.4.32, approved by the user as the existing “MySQL” server. It is accessed using **MySQL Connector/J**, not SQLite or an in-memory database. Do not describe this server as Oracle MySQL.

No separate project, server installation, Account entity, database replacement, or existing-record migration was performed. The manual attachment was not available in the workspace; implementation follows the requirements supplied in the task.

## Verified connection

| Setting | Value |
|---|---|
| Host | `127.0.0.1` |
| Database port | `3306` |
| Database | `skybook` |
| Flight table | `flights` |
| Username | `root` (verified, not assumed) |
| Password | Existing value loaded from `src/backend/.env`; not reproduced here |
| Server executable | `D:\xampp\mysql\bin\mysqld.exe` |
| Backend port | `8080` |
| Frontend | `http://127.0.0.1:5173/` |

The database was already running and successfully authenticated **before** Spring Boot was started.

## Lab concepts in source code

- `src/main/java/com/example/demo/Flight.java`: `@Entity`, `@Table(name = "flights")`, `@Id`, `@GeneratedValue(strategy = GenerationType.IDENTITY)`.
- `src/main/java/com/example/demo/FlightRepository.java`: `JpaRepository<Flight, Long>`.
- `src/main/java/com/example/demo/controller/FlightController.java`: REST operations using the repository.
- `src/main/resources/application.properties`: JDBC URL, credentials via local configuration, Hibernate dialect and SQL logging.
- `build.gradle`: Spring Data JPA and `com.mysql:mysql-connector-j`.
- `FlightSeatReader.java`: read-only lookup of existing seat inventory; no fabricated seats.

The DATE column is mapped using `LocalDate` internally, while the existing JSON `departureDate` remains a `YYYY-MM-DD` string. Canonical camelCase column names are retained.

### Important schema constraint

The table already existed with 289 flights. At the user's request, **no automatic schema changes were performed**: `spring.jpa.hibernate.ddl-auto=none`.

The original schema contains legacy duplicate snake_case columns. Required legacy columns are accommodated on inserts without dropping or renaming anything. The canonical activity field is `isActive`; do not use the legacy `is_active` column to verify deactivation.

**Hibernate table creation was not demonstrated.** The existing table was verified with `SHOW CREATE TABLE flights`, then INSERT/UPDATE/SELECT operations were verified through Hibernate and independent SQL reads. Enabling `ddl-auto=update` on this populated schema is deliberately avoided.

## Commands (run from D:\airline-reservation)

1. Open XAMPP Control Panel and ensure its “MySQL” service is running. Do not start a second instance if it is already running.
2. Start Spring Boot:

```powershell
.\backend-java\gradlew.bat -p backend-java bootRun --console=plain
```

3. In another terminal start only the frontend:

```powershell
npm run dev -- --host 127.0.0.1
```

Do **not** use `npm start` or `npm run dev:all` for this practical: those existing scripts start the legacy Node/SQLite backend and may conflict with Spring Boot on port 8080.

The existing `.env` is imported when launching from either the workspace root or `backend-java`. Environment variables can override its connection settings. Keep the credentials local; do not include them in screenshots or submissions.

## Actual execution results

Verified on 17 September 2026:

- Gradle `build`: **PASS**.
- Existing `DemoApplicationTests.contextLoads`: **1 test, 0 failures, 0 errors**.
- React TypeScript/Vite production build: **PASS**.
- Live Vite HTML and API proxy: **HTTP 200**.
- Required Flight POST, GET all, GET by ID, PUT, DELETE/deactivate: **PASS**.
- Route-only and route/date search: **PASS**.
- SQL checks after POST, PUT and DELETE: **PASS**.
- Invalid date, missing ID, incomplete create and client-assigned create ID checks: **PASS**.
- Original 289 flight records unchanged: **PASS**, compared field-for-field.
- Flight schema unchanged except normal AUTO_INCREMENT advancement: **PASS**.

Test flight: **1798**, flight number **EXP05-1789669048368**.

| Stage | Price | Status | Departure time | SQL isActive |
|---|---:|---|---|---:|
| POST | 4500.00 | On Time | 09:00 AM | 1 |
| PUT | 4750.00 | Delayed | 09:30 AM | 1 |
| DELETE | 4750.00 | Delayed | 09:30 AM | 0 |

DELETE is a **soft delete**. GET by ID still returns the record with `active: false`; GET all includes inactive records. Search excludes inactive flights. This preserves booking/seat foreign keys.

## A–F exact URLs and captured outputs

All filenames below are in `backend-java/experiment05/outputs/`. Each JSON file contains the complete response body actually returned by the API, not an illustrative response.

| Requirement | Method and exact tested URL | HTTP | Exact response file |
|---|---|---:|---|
| A. All flights | GET `http://localhost:8080/api/flights` | 200 | `A-get-all.json` (290 flights at capture, before PUT/DELETE) |
| B. One flight | GET `http://localhost:8080/api/flights/1798` | 200 | `B-get-by-id.json` |
| B. Updated flight | GET `http://localhost:8080/api/flights/1798` | 200 | `B-get-updated.json` |
| C. Create | POST `http://localhost:8080/api/flights` | 201 | `C-post-create.json` |
| D. Update | PUT `http://localhost:8080/api/flights/1798` | 200 | `D-put-update.json` |
| E. Deactivate | DELETE `http://localhost:8080/api/flights/1798` | 200 | `E-delete.json` |
| F. Route search | GET `http://localhost:8080/api/flights/search?from=BOM&to=DEL` | 200 | `F-search-route.json` |
| F. Date search | GET `http://localhost:8080/api/flights/search?from=BOM&to=DEL&departureDate=2026-12-15` | 200 | `F-search-date.json` |

`requests.json` records the exact request URLs, methods, bodies and HTTP statuses.
`sql-after-post.json`, `sql-after-put.json`, and `sql-after-delete.json` record direct database results.
`verification-summary.json` records the successful verification and original-data preservation assertions.

### Actual POST request body

This flight number has already been used; replaying it with the same date returns a duplicate conflict. Use a fresh number or the Postman collection for a new run.

```json
{
  "flightNumber": "EXP05-1789669048368",
  "airline": "SkyBook Practical",
  "origin": "Mumbai (BOM)",
  "destination": "Delhi (DEL)",
  "departureDate": "2026-12-15",
  "departureTime": "09:00 AM",
  "arrivalTime": "11:15 AM",
  "price": 4500,
  "status": "On Time",
  "active": true
}
```

The PUT request uses the same fields, with `price: 4750`, `status: "Delayed"` and `departureTime: "09:30 AM"`.

### Actual PUT response (HTTP 200)

```json
{
  "flight": {
    "active": true,
    "airline": "SkyBook Practical",
    "arrivalTime": "11:15 AM",
    "availableSeats": 0,
    "departureDate": "2026-12-15",
    "departureTime": "09:30 AM",
    "destination": "Delhi (DEL)",
    "flightNumber": "EXP05-1789669048368",
    "id": 1798,
    "origin": "Mumbai (BOM)",
    "price": 4750,
    "seats": [],
    "status": "Delayed"
  },
  "message": "Flight updated successfully"
}
```

The captured updated GET has the same `flight` object without the `message` property.
The captured date search has that object inside `{"flights": [...]}`.
The test flight has no stored seat records, so `seats: []` and `availableSeats: 0` are genuine.

### Actual DELETE response (HTTP 200)

```json
{
  "message": "Flight deactivated successfully"
}
```

The current GET for ID 1798 returns `active: false`. The date search returned the following after deletion:

```json
{
  "flights": []
}
```

Historical pre-delete output is in `F-search-date.json`. For a currently populated existing-date search, use:

`http://localhost:8080/api/flights/search?from=BOM&to=DEL&departureDate=2026-09-18`

That URL returned two existing flights during verification.

## Postman and screenshot sequence

Import `SkyBook-Experiment05.postman_collection.json` into Postman.

The collection creates a unique `EXP05-...` number and captures the database-generated ID. Run its requests **in their listed order**, starting with POST. Each run inserts one additional test row, which is left inactive at the end.

Take screenshots showing method, full URL, HTTP status and JSON response:

1. **POST**: HTTP 201, generated ID, price 4500.
2. **GET all**: HTTP 200 and `flights` array.
3. **GET by ID**: same ID and persisted values.
4. **PUT**: HTTP 200, price 4750, Delayed, 09:30 AM.
5. **GET again**: updated values persisted.
6. **Search by route/date before DELETE**: test flight in results.
7. **DELETE**: successful deactivation message.
8. **GET after DELETE**: `active: false`, plus search excluding that ID.
9. **Workbench/phpMyAdmin SQL result**: same ID and `isActive = 0`.
10. **Spring Boot terminal**: Connector/J connection and Hibernate `insert`, `select`, `update` statements.
11. **Source snippets**: Flight annotations, JpaRepository declaration, dependencies and properties without passwords.

POST/PUT/DELETE must be sent through Postman (not a browser address-bar GET). Tests were executed via Node HTTP requests and independent SQL, not through a graphical Postman session. No browser screenshot was fabricated or captured. Live React HTML/proxy checks and the build passed; interactive browser booking was not verified.

## Exact MySQL Workbench SQL

Connect to `127.0.0.1:3306` with the existing local credentials. Workbench may warn that MariaDB is not a supported Oracle MySQL version; XAMPP phpMyAdmin can execute the same SQL.

```sql
SELECT VERSION() AS actual_server,
       DATABASE() AS current_database,
       CURRENT_USER() AS authenticated_user;

USE skybook;

SHOW TABLES LIKE 'flights';
SHOW CREATE TABLE flights;

SELECT id, flightNumber, airline, origin, destination,
       departureDate, departureTime, arrivalTime,
       price, status, isActive
FROM flights
ORDER BY id DESC;

SELECT id, flightNumber, price, status, departureTime, isActive
FROM flights
WHERE id = 1798;

SELECT id, flightNumber, departureDate, price, isActive
FROM flights
WHERE origin LIKE '%BOM%'
  AND destination LIKE '%DEL%'
  AND departureDate = '2026-12-15'
  AND isActive = 1;
```

After a new Postman run, replace 1798 with its generated ID. Run the single-ID SELECT after POST, after PUT and after DELETE to show each stage.

## Remaining limitations and errors

**Required Flight CRUD is working on the approved MariaDB server. The entire SkyBook application is not fully working.**

The existing broader `test-api.js` was run unchanged: **32 passed, 17 failed**. Full output: `outputs/existing-api-suite.txt`.

Failures correspond to code gaps present before this task:
- Authentication accepts wrong passwords, uses a dummy token, and `/me` is not protected or user-specific.
- Booking responses are mocks: booking records/seat reservations are not persisted and duplicate bookings are not rejected.
- Bare `/api/flights/search` requires a route in the existing Java contract; the old test expects unfiltered results.
- `/api/flights/status`, `/api/chat` and `/api/newsletter` are not implemented by the Java backend.
- Frontend admin endpoints also have no matching Java implementation.

Authentication/booking controllers and React source were left unchanged. Passing mock booking response assertions does not establish real booking persistence.

Startup warnings:
- Hibernate 7.4's MariaDB dialect supports MariaDB 10.6+; XAMPP runs 10.4.32.
- Connector/J exposes MariaDB's `5.5.5` compatibility prefix in JDBC metadata; independent `SELECT VERSION()` confirmed 10.4.32.
- Explicit dialect and default open-in-view warnings remain.

The required tested CRUD works despite those warnings. This is not a production compatibility certification. No upgrade or second server was installed.

## Repeat automated verification

```powershell
node backend-java/experiment05/verify-crud.cjs
```

This creates one fresh test flight, tests CRUD and SQL persistence, deactivates the test flight, and overwrites the captured output files with that new run. Update the historical ID in this guide if rerunning.

The persisted test row 1798 remains as practical evidence; existing flights and database schema were preserved.