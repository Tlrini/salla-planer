# Deploying Salla Planner

Two ways, same Docker setup:

1. **Local test** on your own PC: HTTPS on `https://localhost`, nothing leaves the PC.
2. **Production on AWS**: one Lightsail VM, HTTPS on your domain, daily backups to S3.

The app container (`salla`) is never published directly. **Caddy** sits in front of it, gets the
HTTPS certificate automatically and is the only proxy the app trusts for the client IP
(`TRUST_PROXY=172.28.0.10` in `docker-compose.yml`).

---

## 1. Local test (Windows, Docker Desktop)

1. Start Docker Desktop.
2. In the project folder create `.env`:

   ```
   DOMAIN=localhost
   ADMIN_USER=admin
   ADMIN_PASSWORD=<at least 12 characters>
   ```

3. Start:

   ```bash
   docker compose up -d --build
   ```

4. Open `https://localhost`. The browser warns about the certificate the first time (Caddy's own
   local certificate). Accept it for this test.
5. Log in with the admin from `.env`.

Data lives in `data/` in the project folder (the same folder `npm run dev` uses). Delete
`data/app.db` first if you want the Docker test to start empty with the `.env` admin.

Stop with `docker compose down` (data stays in `data/`).

---

## 2. Production on AWS (Lightsail)

### 2.1 What you need

- An AWS account.
- A domain, for example `planner.agjencia.al` (any registrar, or Route 53).
- Region: pick the one closest to Albania/Kosovo, e.g. **eu-central-1 (Frankfurt)** or
  **eu-south-1 (Milan)**.

### 2.2 Create the server

1. Lightsail → _Create instance_ → Linux → **Ubuntu 24.04 LTS** → plan **2 vCPU / 4 GB RAM**.
2. _Networking_ tab of the instance:
   - Attach a **static IP**.
   - Firewall (IPv4 and IPv6): allow **HTTP 80** and **HTTPS 443**, and keep SSH 22 (better:
     restrict SSH to your own IP).
3. At your domain registrar, create an **A record**: `planner.agjencia.al → <static IP>`.
   Wait until `ping planner.agjencia.al` shows the static IP.

### 2.3 Install Docker and the app

Connect with SSH (Lightsail _Connect_ button or your own key), then:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # log out and back in afterwards
```

Copy the project to `/opt/salla` (`git clone` from your repository, or `scp` the folder without
`node_modules`), then:

```bash
cd /opt/salla
cp .env.example .env
nano .env        # DOMAIN=planner.agjencia.al, ADMIN_PASSWORD=<strong, 12+ characters>
docker compose up -d --build
docker compose logs -f caddy     # wait for "certificate obtained successfully", then Ctrl+C
```

Open `https://planner.agjencia.al` on a phone and log in. The admin password in `.env` is only
used on the very first start; change passwords later under _Administrimi → Përdoruesit_.

### 2.4 Backups to S3

The app writes a daily copy of the database to `data/backups/` (last 14 kept). Copy them and the
uploaded 3D models off the server every night:

1. S3 → _Create bucket_ (same region, _Block all public access_ on), e.g. `salla-backups-<name>`.
   Add a **lifecycle rule** that expires objects under `backups/` after 90 days.
2. IAM → _Users_ → create `salla-backup` with this inline policy (replace the bucket name):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::salla-backups-<name>"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject"],
         "Resource": "arn:aws:s3:::salla-backups-<name>/*"
       }
     ]
   }
   ```

   Create an access key for it.

3. On the server:

   ```bash
   sudo apt-get install -y awscli
   aws configure          # the access key from step 2, region eu-central-1
   chmod +x /opt/salla/deploy/backup-sync.sh
   BACKUP_TARGET=s3://salla-backups-<name>/salla /opt/salla/deploy/backup-sync.sh
   ```

4. Run it every night at 03:30 (`crontab -e`):

   ```
   30 3 * * * BACKUP_TARGET=s3://salla-backups-<name>/salla /opt/salla/deploy/backup-sync.sh >> /var/log/salla-backup.log 2>&1
   ```

5. Also enable **automatic snapshots** of the Lightsail instance (instance → _Snapshots_) as a
   second safety net.

### 2.5 Restore test (do this once)

```bash
cd /opt/salla
docker compose stop salla
aws s3 cp s3://salla-backups-<name>/salla/backups/app-YYYY-MM-DD.db data/app.db
rm -f data/app.db-wal data/app.db-shm
aws s3 sync s3://salla-backups-<name>/salla/uploads data/uploads
docker compose start salla
```

Log in and open a project to confirm it works.

### 2.6 Updating the app

```bash
cd /opt/salla
git pull                         # or copy the new files
docker compose up -d --build
```

---

## 3. Monthly cost (estimate)

Approximate list prices. Check the
[Lightsail pricing page](https://aws.amazon.com/lightsail/pricing/) and the
[AWS Pricing Calculator](https://calculator.aws/) before deciding; taxes not included.

| Part                                                                    | Estimate                  |
| ----------------------------------------------------------------------- | ------------------------- |
| Lightsail 2 vCPU / 4 GB / 80 GB SSD, static IP and transfer included    | about $24 / month         |
| Lightsail automatic snapshots (about 20–40 GB)                          | about $1–2 / month        |
| S3 backups and models (a few GB)                                        | under $1 / month          |
| Domain                                                                  | about $10–15 / year       |
| **Total for Beta 0–4**                                                  | **about $26–28 / month**  |
| Beta 5 scanning: GPU VM (g4dn.xlarge) only while a scan runs, 20–40 min | about $0.20–0.60 per scan |

About 10 users at the same time fit easily on the 4 GB plan. If 3D model uploads grow large,
attach an extra Lightsail disk for `data/` instead of moving to a bigger plan.

---

## 4. Security checklist

- `.env` is only on the server (never in git). Use a strong, unique `ADMIN_PASSWORD`.
- Only ports 80, 443 (and SSH, ideally limited to your IP) are open.
- The session cookie is `Secure` (HTTPS only); `COOKIE_SECURE` defaults to `true` in Docker.
- The login limit (10 wrong attempts per minute per client IP) uses the IP reported by Caddy only.
- Uploaded 3D models (`/uploads/…`) are only served to logged-in users.
- Keep Ubuntu updated: `sudo apt-get update && sudo apt-get upgrade` monthly, or enable
  `unattended-upgrades`.
