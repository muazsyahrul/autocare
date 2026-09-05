# 🚘 AutoCare

Self-hosted vehicle maintenance tracker. Built with React + Node.js + SQLite, deployed via Docker Compose.

---

## Deploy on Proxmox

### 1. Set up your Proxmox container

Create an LXC container or VM with:
- Ubuntu 22.04 or Debian 12
- At least 512MB RAM, 4GB disk
- Network bridge so it gets a LAN IP

### 2. Install Docker inside the container

```bash
curl -fsSL https://get.docker.com | sh
```

### 3. Copy this project to your Proxmox machine

From GitHub:

```bash
cd /opt
git clone https://github.com/muazsyahrul/autocare.git
```

Or clone/copy however you prefer.

### 4. Configure login

Before starting AutoCare, edit:

```bash
cd /opt/autocare
nano docker-compose.yml
```

Set:

```yaml
AUTOCARE_USERNAME: admin
AUTOCARE_PASSWORD: YOUR-STRONG-PASSWORD
AUTOCARE_SESSION_DAYS: 30
```

### 5. Build and start

```bash
docker compose up -d --build
```

### 6. Access the app

Open your browser and go to:

```text
http://<PROXMOX-IP>:3000
```

You will see the AutoCare login screen before accessing the application.

---

## Login

AutoCare is protected by a username and password before the application can be used.

The default session lasts **30 days**. You can manually lock/sign out from inside the application.

### Configure username and password

Open:

```bash
cd /opt/autocare
nano docker-compose.yml
```

Find:

```yaml
AUTOCARE_USERNAME: admin
AUTOCARE_PASSWORD: CHANGE-THIS-PASSWORD
AUTOCARE_SESSION_DAYS: 30
```

Change them to your preferred credentials:

```yaml
AUTOCARE_USERNAME: admin
AUTOCARE_PASSWORD: MyStrongPassword123!
AUTOCARE_SESSION_DAYS: 30
```

Save the file, then rebuild AutoCare:

```bash
docker compose up -d --build
```

After the containers restart, use the new username and password to log in.

### Change the session duration

The default is 30 days.

For 7 days:

```yaml
AUTOCARE_SESSION_DAYS: 7
```

For 90 days:

```yaml
AUTOCARE_SESSION_DAYS: 90
```

Then rebuild:

```bash
docker compose up -d --build
```

### Important

Do **not** put your real password directly into `server.js`.

The login credentials should be configured in `docker-compose.yml` using:

```text
AUTOCARE_USERNAME
AUTOCARE_PASSWORD
AUTOCARE_SESSION_DAYS
```

The backend keeps login sessions in memory. A browser refresh or browser reopen during the valid session remains logged in. Restarting/recreating the backend container clears active sessions, so users will need to log in again.

---

## Day-to-day commands

```bash
# View logs
docker compose logs -f

# Stop
docker compose down

# Restart
docker compose restart

# Update after code changes
docker compose up -d --build

# Check container status
docker compose ps
```

---

## Backup your data

The SQLite database lives in a Docker named volume.

To back it up:

```bash
docker run --rm \
  -v autocare_autocare-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/autocare-backup.tar.gz /data
```

This creates `autocare-backup.tar.gz` in your current directory.

---

## Project structure

```text
autocare/
├── docker-compose.yml        ← Docker configuration + login credentials
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js             ← Express API + authentication
│   └── db.js                 ← SQLite schema + setup
└── frontend/
    ├── Dockerfile
    ├── nginx.conf            ← serves React + proxies /api
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx           ← full UI + login screen
        └── api.js            ← all API calls
```

---

## Ports

| Service  | Port |
|----------|------|
| Frontend | 3000 |
| Backend  | 4000 (internal only, not exposed) |

---

## Authentication

AutoCare uses:

- Username/password authentication
- HTTP-only session cookie
- 30-day default session
- Server-side session validation
- Manual Lock/Logout
- All `/api/*` application data routes require authentication

The frontend communicates with the backend through the existing `/api` proxy configuration.
