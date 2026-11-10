# Deploying Salla Planner

Two ways, same Docker setup:

1. **Local test** on your own PC: HTTPS on `https://localhost`, nothing leaves the PC.
2. **Production on AWS**: one EC2 server that runs **only while the agency works** (it powers
   itself off after an idle hour; agents start it with a bookmarked link), HTTPS on your domain,
   backups to S3.

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

## 2. Production on AWS (EC2, on only while used)

The app server is an EC2 **t3.medium** (2 vCPU / 4 GB). It is billed per second while it runs;
while it is stopped only its disk and its fixed IP address cost money. Outside running hours
nobody can open the app or a client share link.

```
agent ──bookmarked start link──▶ Lambda ──start──▶ EC2 app server (Docker: Caddy + app)
                                                        │ cron: idle-stop.sh powers it off
                                                        │       after 60 quiet minutes
                                                        ▼ (backups go to S3 first)
```

(A Lightsail server would be simpler but is billed even while stopped, so it only pays off when
the app must be reachable around the clock; see §3.)

### 2.1 What you need

- An AWS account.
- A domain, for example `planner.agjencia.al` (any registrar, or Route 53).
- Region: **eu-central-1 (Frankfurt)**, closest to Albania/Kosovo. All steps below use it.

Sign in to the console as **Root user** with the account's email address. You need the 12-digit
**account ID** for the role policies in 2.2 and 2.7 (`<account-id>`); it is in the account menu at
the top right. An account alias (IAM → _Dashboard_ → _AWS Account_) is optional and only matters
if you later add IAM users who sign in to the console; the servers themselves use IAM roles.

Before creating anything:

- Turn on **MFA for the root user** (account menu → _Security credentials_ → _Assign MFA
  device_).
- Set a **budget alert** (Billing → _Budgets_ → _Create budget_, e.g. $35 / month, see §3) so an
  unexpected cost sends you an email.

### 2.2 Backup bucket and server role

1. S3 → _Create bucket_ (eu-central-1, _Block all public access_ on), e.g.
   `salla-backups-<name>`. Add a **lifecycle rule** that expires objects under `backups/` after
   90 days.
2. IAM → _Roles_ → _Create role_ → trusted entity **AWS service → EC2** → name `salla-app`. Add
   this inline policy (bucket name; the GPU part is only needed for scanning, §4, and can be
   added later with the GPU instance id):

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
       },
       {
         "Effect": "Allow",
         "Action": "ec2:StartInstances",
         "Resource": "arn:aws:ec2:eu-central-1:<account-id>:instance/<gpu-instance-id>"
       },
       { "Effect": "Allow", "Action": "ec2:DescribeInstances", "Resource": "*" }
     ]
   }
   ```

   The server gets these rights through the role, so no access keys are stored on it.

### 2.3 Create the server

1. EC2 → _Launch instance_:
   - AMI **Ubuntu Server 24.04 LTS**, type **t3.medium**, storage **30 GB gp3**.
   - Key pair: create or choose one for SSH.
   - Security group: inbound **HTTP 80** and **HTTPS 443** from anywhere, **SSH 22** from your
     own IP only.
   - _Advanced details_: IAM instance profile **salla-app**; _Credit specification_
     **Standard** (no surprise charges for CPU bursts); _Shutdown behavior_ **Stop**.
2. EC2 → _Elastic IPs_ → _Allocate_ → _Associate_ with the new instance. The address now stays
   the same across stop/start.
3. At your domain registrar, create an **A record**: `planner.agjencia.al → <Elastic IP>`.
   Wait until `ping planner.agjencia.al` shows it.
4. Note the server's **instance id** (`i-…`) for the start link (§2.7).

### 2.4 Install Docker and the app

Connect with SSH (`ssh -i <key>.pem ubuntu@planner.agjencia.al`), then:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # log out and back in afterwards
sudo snap install aws-cli --classic
```

Copy the project to `/opt/salla` (`git clone` from your repository, or `scp` the folder without
`node_modules`), then:

```bash
cd /opt/salla
cp .env.example .env
nano .env        # DOMAIN, ADMIN_PASSWORD (12+ characters), SCAN_WORKER_TOKEN, BACKUP_TARGET
docker compose up -d --build
docker compose logs -f caddy     # wait for "certificate obtained successfully", then Ctrl+C
```

In `.env`:

- `SCAN_WORKER_TOKEN`: `openssl rand -hex 32`. The auto-stop needs it even if you never use
  scanning.
- `BACKUP_TARGET=s3://salla-backups-<name>/salla`
- Values with spaces or `$` must be in single quotes (the scripts read `.env` too).

Open `https://planner.agjencia.al` on a phone and log in. The admin password in `.env` is only
used on the very first start; change passwords later under _Administrimi → Përdoruesit_.
The containers start again by themselves every time the server boots.

### 2.5 Auto-stop and backups

```bash
chmod +x /opt/salla/deploy/*.sh
sudo crontab -e
```

Add:

```
*/5 * * * * /opt/salla/deploy/idle-stop.sh >> /var/log/salla-idle-stop.log 2>&1
30 3 * * * /opt/salla/deploy/backup-sync.sh >> /var/log/salla-backup.log 2>&1
```

- **`idle-stop.sh`** powers the server off when nobody used the app (agents or client share
  links) for `IDLE_STOP_MINUTES` (default 60), but never in the first 20 minutes after a start
  and never while a scan is processed. Just before, it copies the backups and uploads to S3.
- The app copies its database to `data/backups/` once per day while it runs (last 14 kept);
  the 03:30 line only matters on days the server stays on overnight.
- Keep the server on for maintenance: `sudo touch /opt/salla/STAY_ON` (remove it afterwards).
  `IDLE_STOP_MINUTES=0` in `.env` turns the auto-stop off.

### 2.6 Restore test (do this once)

```bash
cd /opt/salla
docker compose stop salla
aws s3 cp s3://salla-backups-<name>/salla/backups/app-YYYY-MM-DD.db data/app.db
rm -f data/app.db-wal data/app.db-shm
aws s3 sync s3://salla-backups-<name>/salla/uploads data/uploads
docker compose start salla
```

Log in and open a project to confirm it works.

### 2.7 Start link for the agents

Agents start the server from a bookmarked link; they need no AWS account.

1. Lambda → _Create function_ → **Author from scratch**, name `salla-start`, runtime
   **Node.js 22.x**. Replace the code with `deploy/start-link/index.mjs` → _Deploy_.
2. _Configuration → Environment variables_:
   - `START_KEY`: a long random value (`openssl rand -hex 24`).
   - `APP_INSTANCE_ID`: the app server's instance id.
   - `APP_URL`: `https://planner.agjencia.al`.
3. _Configuration → Permissions_ → the role → _Add permissions → Create inline policy_ (JSON):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ec2:StartInstances",
         "Resource": "arn:aws:ec2:eu-central-1:<account-id>:instance/<app-instance-id>"
       },
       { "Effect": "Allow", "Action": "ec2:DescribeInstances", "Resource": "*" }
     ]
   }
   ```

4. _Configuration → Function URL → Create_, auth type **NONE**. The start link is
   `<function URL>?key=<START_KEY>`. Give it to the agents to bookmark; anyone with the link
   can only start the server, nothing else. Changing `START_KEY` invalidates old links.

Opening the link shows _Serveri po ndizet_ and refreshes itself; after about 2 minutes the app
opens on the domain.

Also paste the start link in _Administrimi → Agjencia → Lidhja për ndezjen e serverit_. Every
device that has opened the app once then shows _Serveri është i fikur_ with a _Ndize serverin_
button when the server is off (the app itself is kept in the browser), and opens the app by
itself as soon as the server answers. You can also start/stop the server in the AWS console or the AWS Console
phone app (EC2 → Instances).

### 2.8 Moving from Lightsail (only if the app already runs there)

1. On the Lightsail server: `docker compose stop salla`, then run
   `BACKUP_TARGET=s3://salla-backups-<name>/salla /opt/salla/deploy/backup-sync.sh`. Then
   `docker compose stop` and keep it off.
2. Set up the EC2 server (§2.2–2.5) with the same `.env` values, then restore the newest backup
   (§2.6).
3. Point the A record to the Elastic IP; wait until `ping` shows it; log in and check projects.
4. Delete the Lightsail instance **and its static IP** (both keep billing otherwise).

### 2.9 Updating the app

```bash
cd /opt/salla
git pull                         # or copy the new files
docker compose up -d --build
```

---

## 3. Monthly cost (estimate, Frankfurt)

List prices without VAT. Check the [AWS Pricing Calculator](https://calculator.aws/) before
deciding.

Example: the app server runs **20 hours** and the GPU (scanning, §4) **10 hours** a month.

| Part                                            | Calculation     | Per month     |
| ----------------------------------------------- | --------------- | ------------- |
| App server t3.medium                            | 20 h × $0.048   | $0.96         |
| App disk 30 GB gp3 (also billed while stopped)  | 30 GB × $0.095  | $2.86         |
| Elastic IP (billed always)                      | 730 h × $0.005  | $3.65         |
| S3 backups and models (a few GB)                |                 | under $0.50   |
| GPU server g4dn.xlarge                          | 10 h × $0.658   | $6.58         |
| GPU disk 100 GB gp3 (also billed while stopped) | 100 GB × $0.095 | $9.52         |
| Lambda start link                               | free tier       | $0            |
| Domain                                          | $10–15 / year   | about $1      |
| **Total**                                       |                 | **about $25** |

- Each extra app hour costs about $0.05; each GPU hour $0.66 (one scan ≈ $0.25–0.35).
- Without scanning (no GPU server): about **$9 / month**.
- Always-on alternative: a Lightsail 2 vCPU / 4 GB server is $24 / month flat (it is billed
  while stopped too), so with the same GPU use about **$41 / month**, but the app and client
  links work at any time.

About 10 users at the same time fit easily on t3.medium. If 3D model uploads grow large,
enlarge the EBS disk (EC2 → Volumes → Modify) instead of moving to a bigger server.

---

## 4. In-page scanning (Beta 5)

Agents film a decoration on the phone (_Biblioteka → Skano një dekor_). The video goes to the
app; a separate **GPU VM** turns it into a 3D model with **Meshroom** (MPL-2.0) and sends it
back. The GPU VM is **off** unless scans wait:

```
phone ──video──▶ app server ◀──claim / result── GPU worker (EC2 g4dn.xlarge)
                    ▲  cron: deploy/scan-starter.sh starts the GPU VM when scans wait
                    └─ the worker exits after 10 idle minutes and the VM powers itself off
```

The GPU worker delivers its model to the app, so scans are only processed while the app server
is on. The app server's auto-stop waits for a running scan.

### AI scans from one photo (being compared with Meshroom)

Agents can also make a model from **one photo** (_Me AI_). The app server sends the photo to
TRELLIS.2 on **RunPod Serverless** and gets a `.glb` back; the GPU is billed per second and costs
nothing while idle, and no disk has to stay on for it apart from a small volume for the weights.
Set-up: `worker-ai/README.md`, then `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` in `.env`.

Rough cost, to be confirmed on the first runs: about $0.02 to $0.06 per model, plus about $2 a
month for a 30 GB volume. Keeping only the AI would remove the GPU VM's disk ($9.52 a month) and
its hours from the table in §3. Decide which method stays after testing both on real decor.

### 4.1 One-time: GPU quota

New AWS accounts may not start GPU VMs. _Service Quotas → Amazon EC2 → "Running On-Demand G
and VT instances"_ in **eu-central-1**: request **4** (one g4dn.xlarge = 4 vCPU). Approval
usually takes 1–3 days.

### 4.2 Create the GPU VM

1. EC2 → _Launch instance_, region **eu-central-1**:
   - AMI: **Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)** (NVIDIA driver,
     Docker and the NVIDIA container toolkit are preinstalled).
   - Type: **g4dn.xlarge**. Storage: **100 GB gp3** (Meshroom alone is about 11 GB).
   - Security group: **no inbound rules** except SSH 22 from your own IP. The worker only makes
     outgoing HTTPS calls to the app.
   - _Advanced details → Shutdown behavior_: **Stop**.
2. Note the **instance id** (`i-…`) and add it to the `salla-app` role's policy (§2.2).
3. SSH in and install the worker (copy the repository's `worker/` folder, e.g. with `scp`):

   ```bash
   sudo mkdir -p /opt/salla-worker && sudo chown ubuntu /opt/salla-worker
   # copy worker/ to /opt/salla-worker/src
   cd /opt/salla-worker
   docker build -t salla-scan-worker:latest src        # 15–30 min the first time
   cp src/.env.example .env && nano .env                # APP_URL and SCAN_WORKER_TOKEN
   cp src/run-once.sh . && chmod +x run-once.sh
   sudo cp src/salla-scan-worker.service /etc/systemd/system/
   sudo systemctl enable salla-scan-worker
   ```

   Check that the GPU is visible to Docker:
   `docker run --rm --gpus all nvidia/cuda:12.4.1-runtime-ubuntu22.04 nvidia-smi`.

4. `sudo reboot`. The worker starts, finds no scans, and **powers the VM off after about 11
   minutes**. From now on the VM costs only its disk while it is off.

   Maintenance without the automatic power-off: `sudo touch /opt/salla-worker/STAY_ON` (remove
   it afterwards). Logs of the last run: `journalctl -u salla-scan-worker`.

### 4.3 Turn scanning on in the app

`SCAN_WORKER_TOKEN` is already in the app's `.env` (§2.4); the GPU VM's `.env` gets the same
value. After changing `.env` or `deploy/Caddyfile`:

```bash
cd /opt/salla
docker compose up -d           # restarts the app with the token
docker compose restart caddy   # larger upload limit for videos (deploy/Caddyfile)
```

_Biblioteka_ now shows _Skanimet me kamerë_ with the _Skano një dekor_ button, and _Sallat_
shows _Skanimet e sallave_ with _Skano sallën_ (a whole hall goes through the same GPU worker;
a 3–4 minute hall video takes about 30–40 minutes).

### 4.4 Start the GPU VM automatically

The `salla-app` role (§2.2) already allows starting the GPU VM. Every minute (`crontab -e` as
`ubuntu`):

```
* * * * * SCAN_WORKER_INSTANCE=i-0123456789abcdef0 /opt/salla/deploy/scan-starter.sh >> /home/ubuntu/salla-scan-starter.log 2>&1
```

The script reads `DOMAIN` and `SCAN_WORKER_TOKEN` from `/opt/salla/.env`. It only starts the VM
when scans wait and the VM is stopped, and not more often than every 10 minutes.

### 4.5 Test once

1. Start the app server with the start link.
2. On a phone: _Biblioteka → Skano një dekor_, film a centerpiece for 60–90 s, send it.
3. Within a minute `~/salla-scan-starter.log` says "started the scan worker"; the EC2 console
   shows the GPU VM _running_.
4. The scan in _Biblioteka_ goes _Në radhë → Duke u përpunuar_ (20–30 min) → _Gati, duhet
   pastruar_. Open it, cut away the table with the box, save, finish the setup.
5. About 10 minutes later the GPU VM is _stopped_ again; an hour after the last use the app
   server stops too. The next day, the billing page shows roughly $0.30 for the GPU VM.

If a scan fails, its error is shown under it; _Provo përsëri_ queues it again. Usual causes:
too little light, the decor moved, or not enough of it was filmed. Scans that wait more than
`SCAN_WAIT_LIMIT_MINUTES` (default 120) for the GPU no longer keep the app server on.

---

## 5. Security checklist

- `.env` is only on the server (never in git). Use a strong, unique `ADMIN_PASSWORD`.
- Only ports 80, 443 (and SSH, limited to your IP) are open.
- The session cookie is `Secure` (HTTPS only); `COOKIE_SECURE` defaults to `true` in Docker.
- The login limit (10 wrong attempts per minute per client IP) uses the IP reported by Caddy only.
- Uploaded 3D models (`/uploads/…`) are only served to logged-in users.
- `SCAN_WORKER_TOKEN` (32+ random characters) protects `/api/worker/…` (scan worker, starter,
  auto-stop). The GPU VM accepts no inbound traffic except SSH from your IP.
- The servers use IAM roles, not stored access keys; each may only start the one instance it
  needs. The start link can only start the app server; rotate `START_KEY` if it leaks.
- Keep Ubuntu updated: `sudo apt-get update && sudo apt-get upgrade` monthly, or enable
  `unattended-upgrades`.
