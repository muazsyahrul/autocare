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

### 4. Build and start

```bash
cd /opt/autocare
docker compose up -d --build
```

First build takes 2–3 minutes (downloading Node, Nginx, installing packages).

### 5. Access the app

Open your browser and go to:
```
http://<PROXMOX-IP>:3000
```

Anyone on your home network can access it from any device.

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
```

## Backup your data

The SQLite database lives in a Docker named volume. To back it up:

```bash
docker run --rm \
  -v autocare_autocare-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/autocare-backup.tar.gz /data
```

This creates `autocare-backup.tar.gz` in your current directory.

---

## Project structure

```
autocare/
├── docker-compose.yml        ← orchestrates everything
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js             ← Express API
│   └── db.js                 ← SQLite schema + setup
└── frontend/
    ├── Dockerfile
    ├── nginx.conf            ← serves React + proxies /api
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx           ← full UI
        └── api.js            ← all API calls
```

## Ports

| Service  | Port |
|----------|------|
| Frontend | 3000 |
| Backend  | 4000 (internal only, not exposed) |
