# SkyBook Deployment

## Local Docker Compose

The Compose stack uses React/Vite served by Nginx, the existing Spring Boot API, and MariaDB 10.11. The browser calls same-origin `/api` paths; Nginx forwards them to the Compose service named `backend`. The API and database are not published on host ports. The frontend is available on `http://127.0.0.1:8081` by default.

The first start creates a new named MariaDB volume and initializes empty `flights`, `bookings`, and `seats` tables compatible with the project mappings. The application creates its `users`, `fare_watches`, and `notifications` tables. No existing records are copied. The local XAMPP database and `src/backend/skybook.db` are not used or modified. Do not use `docker compose down -v`; it deletes the Compose database volume.

Run these commands from the repository root in PowerShell. Generate fresh local credentials instead of using the example placeholders:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$mysqlPassword = [BitConverter]::ToString($bytes).Replace('-', '')
$rng.GetBytes($bytes)
$rootPassword = [BitConverter]::ToString($bytes).Replace('-', '')
$rng.GetBytes($bytes)
$jwtSecret = [Convert]::ToBase64String($bytes)
$rng.Dispose()
@"
MYSQL_DATABASE=skybook
MYSQL_USER=skybook_app
MYSQL_PASSWORD=$mysqlPassword
MYSQL_ROOT_PASSWORD=$rootPassword
JWT_SECRET=$jwtSecret
SKYBOOK_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SKYBOOK_HTTP_PORT=8081
VITE_API_URL=
"@ | Set-Content -Encoding ascii .env

docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8081/api/health
(Invoke-WebRequest http://127.0.0.1:8081/).StatusCode
Invoke-RestMethod http://127.0.0.1:8081/api/flights
```

The initial empty database returns an empty flights list; no demonstration flights, users, or seats are fabricated. Add records through the application/admin workflows or migrate a separately reviewed database backup. The SQL initializer only runs when MariaDB first initializes an empty volume.

Stop containers and retain their database data with:

```powershell
docker compose down
```

For logs and service status use `docker compose logs -f` and `docker compose ps`. `docker compose down` retains the named database volume; `docker compose down -v` removes it.

## GitHub

There is no `.git` directory in the inspected workspace and Git was unavailable in the current terminal, so no repository history or remote could be checked or preserved. Install Git for Windows first. Review `git status` and confirm this directory is the intended source before initializing a repository. Create an empty private GitHub repository without a README, license, or `.gitignore`, then run from the project root:

```powershell
git init --initial-branch=main
git status --short
git check-ignore -v .env src/backend/.env src/backend/skybook.db
git add .
git diff --cached --check
git diff --cached --name-only
git commit -m "Prepare SkyBook deployment"
git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git
git remote -v
```

Inspect the staged file list and ensure it contains no `.env`, database files, `node_modules`, or build outputs. Only after confirming the destination repository and staged contents, publish with:

```powershell
git push -u origin main
```

Never use `git push --force` for this setup. `.env.example` contains placeholders only; keep real secrets in `.env` or the cloud platform's secret settings.

## Cloud VPS Deployment

A budget-compatible option for this existing Compose stack is a Hetzner Cloud Ubuntu VM. The current CPX22 regular-performance listing is 2 vCPU, 4 GB RAM, and 80 GB NVMe, listed at about EUR 11.99/month in EU locations or EUR 26.99/month in Singapore, before applicable taxes; prices and availability can change. The provider lists server backups as an add-on starting around EUR 1.20/month. Choose a region based on your users: Singapore is closer to South Asia, while EU regions are cheaper on the current listing. This is a shared-vCPU, single-host setup suitable for a small deployment, not high availability. Creating a server requires a provider account, any requested verification, and a valid payment method; review the final console price before confirming any purchase.

The MariaDB volume is a Docker named volume on the VM disk and is never published as a port. Enable provider server backups, but also schedule encrypted MariaDB logical backups to separate off-host storage and test a restore. A server backup alone is not a database-aware backup strategy. Register or use a domain and create its DNS A record before HTTPS provisioning; domain registration is a separate possible cost.

1. Create the VM and point a DNS A record for the application domain to its public IP. Allow inbound TCP 80 and 443 for the web proxy and SSH only from your administrative IP. Do not open ports 3306 or 8080.
2. Install Docker Engine with the Compose plugin, clone the reviewed GitHub repository, and create a new `.env` on the VM. Use unique cloud-only values for `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and a cryptographically random `JWT_SECRET` of at least 32 bytes; do not copy local credentials. Set `SKYBOOK_CORS_ALLOWED_ORIGINS` to the exact HTTPS origin, for example `https://skybook.example.com` (add a second exact origin only if you serve both apex and `www`). Keep `MYSQL_DATABASE=skybook`, `SKYBOOK_HTTP_PORT=8081`, and `VITE_API_URL=`. The database host is the Compose service `db` and its internal port is `3306`; these must not be set to `localhost`.
3. In the checkout, run `docker compose config --quiet` and `docker compose up -d --build`. Nginx is bound only to the VM loopback interface on port 8081; the API and database have no host port mappings.
4. Install Caddy on the VM and configure the domain to proxy to the local frontend port:

```text
skybook.example.com {
    reverse_proxy 127.0.0.1:8081
}
```

Caddy can provision HTTPS after DNS and firewall access are correct. Verify `https://skybook.example.com/api/health` and the home page. Keep `.env` on the VM only and restrict its file permissions.

The cloud database starts empty, just like local Compose. Before serving real users, migrate records only from a verified backup into the cloud database using a reviewed MariaDB-compatible procedure, then test login, flight search, bookings, and seat inventory. Do not commit database dumps or use the existing XAMPP database as a live cloud database. Back up the cloud database independently; deleting the VM also deletes its local named-volume data unless separately backed up.