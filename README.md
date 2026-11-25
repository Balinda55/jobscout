# JobScout 🔎

**JobScout** is a web app that helps students and job seekers find real, current job listings
from thousands of job sites in one place, using the Adzuna job search API.
You can search by keyword and location, filter by country, date posted, job type and remote work,
sort the results, and save jobs you like.

- 🌐 **Live app (through the load balancer):** https://jobscout-sh23.onrender.com/
- 🎥 **Demo video (max 2 min):** https://youtu.be/EEAakS34fEM
- 👩🏾‍💻 **Author:** Balinda Sonia — [@Balinda55](https://github.com/Balinda55)

---

## 1. Why this app is useful
Job seekers usually have to check many different websites. JobScout puts listings from many
job boards on one page and lets you narrow them down quickly — for example
*"internships in London posted this week"* or *"remote full-time developer jobs, highest salary first"*.

## 2. Features
| Feature | How it works |
|---|---|
| **Search** | Keyword + optional city/area |
| **Filter (server)** | Country, date posted, job type (full-time, part-time, contract, internship), remote only |
| **Filter (instant)** | Type in the "Filter results" box to filter by company, title or city |
| **Sort** | Newest, oldest, highest salary, company A–Z, title A–Z |
| **Results overview** | Summary cards (jobs, companies, % remote, jobs with salary) and a bar chart of job types — updates live as you filter |
| **Save jobs** | ☆ Save button; saved jobs are kept in your browser (localStorage) |
| **Pagination** | Previous / Next pages of results |
| **Error handling** | Friendly messages for empty search, bad input, wrong API key, API down, API limit, timeout |
| **Caching** *(bonus)* | The same search within 24 hours is answered from memory — instant, and saves API calls |
| **Security** *(bonus)* | Input validation, XSS-safe rendering, API key hidden on the server, security headers |
| **Load-balancer proof** | Footer shows "Served by: web-01/web-02"; every response has an `X-Served-By` header |

## 3. The API used (and credits)
- **Adzuna API** by **Adzuna**
  - Docs: https://developer.adzuna.com/docs/search
  - Endpoint used: `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}`
  - Authentication: `app_id` and `app_key` query parameters (added only on the server)
  - Supported countries: UK, US, South Africa, Canada, Australia, New Zealand, India, Germany, France, Austria, Poland, Brazil
  - The free plan has a request limit, which is why JobScout caches results.

## 4. Project structure
```
jobscout/
├── server.js          # Backend: serves the site, /api/jobs and /api/health
├── package.json       # Project info and dependencies
├── .env.example       # Template for the API key (the real .env is NOT in git)
├── .gitignore         # Keeps .env and node_modules out of GitHub
├── README.md
└── public/
    └── index.html     # Frontend: page layout, design (CSS) and logic (JavaScript)
```

**How a request travels:**
```
Browser → lb-01 (HAProxy :80) → web-01 or web-02 (Nginx :80) → Node app (:3000) → Adzuna API
```

## 5. Run it locally
1. Sign up for free at https://developer.adzuna.com/signup and copy your **Application ID** and
   **Application Key** from the dashboard.
2. Install Node.js 18 or newer from https://nodejs.org (check with `node -v`).
3. Get the code and install:
   ```bash
   git clone https://github.com/Balinda55/jobscout.git
   cd jobscout
   npm install
   ```
4. Add your key:
   ```bash
   cp .env.example .env
   nano .env
   ```
5. Start the app with `npm start` and open http://localhost:3000
   (On Windows PowerShell, if `npm` is blocked, use `npm.cmd install` and `npm.cmd start`.)

## 6. Deploy to web-01 and web-02
Do all of these steps on **web-01**, then repeat them on **web-02**.

### Step 1 — Log in
```bash
ssh -i ~/.ssh/YOUR_KEY ubuntu@13.135.173.98
```

### Step 2 — Install Node.js, Nginx and git
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
```

### Step 3 — Get the code and add the key
```bash
git clone https://github.com/Balinda55/jobscout.git ~/jobscout
cd ~/jobscout
npm install --omit=dev
sudo apt-get install -y nano     # only needed if nano is missing
cp .env.example .env
nano .env                         # put your Adzuna app ID and key
```

### Step 4 — Keep the app running with systemd
```bash
sudo nano /etc/systemd/system/jobscout.service
```
Paste:
```ini
[Unit]
Description=JobScout Node.js app
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/jobscout
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
Start it:
```bash
sudo systemctl daemon-reload
sudo systemctl enable jobscout
sudo systemctl start jobscout
```
The app now runs on port 3000 and restarts by itself after a crash or reboot.

### Step 5 — Configure Nginx (port 80 → app on port 3000)
```bash
sudo nano /etc/nginx/sites-available/jobscout
```
Paste:
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```
Enable it:
```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/jobscout /etc/nginx/sites-enabled/jobscout
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6 — Test
```bash
curl http://localhost/api/health
```
Expected: `{"status":"ok","server":"7247-web-01",...}`

### Useful commands
```bash
sudo systemctl status jobscout
sudo journalctl -u jobscout -f
cd ~/jobscout && git pull && sudo systemctl restart jobscout
```

## 7. Configure the load balancer (lb-01)
```bash
ssh -i ~/.ssh/YOUR_KEY ubuntu@18.130.34.90
sudo apt-get update && sudo apt-get install -y haproxy
sudo nano /etc/haproxy/haproxy.cfg
```
Keep the existing `global` and `defaults` sections and add this at the end:
```
frontend jobscout_front
    bind *:80
    mode http
    default_backend jobscout_back

backend jobscout_back
    mode http
    balance roundrobin
    option httpchk GET /api/health
    http-check expect status 200
    http-response set-header X-Load-Balancer lb-01
    server 7247-web-01 13.135.173.98:80 check
    server 7247-web-02 18.130.149.31:80 check
```
If a frontend already uses `bind *:80` from an earlier project, edit that one instead of adding a second.

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```
- `balance roundrobin` — requests alternate between web-01 and web-02.
- `option httpchk GET /api/health` — a server that stops answering is taken out until it recovers.

## 8. Testing the load balancer
```bash
for i in 1 2 3 4 5 6; do curl -sI http://18.130.34.90/api/health | grep -i x-served-by; done
```
Expected: the server name alternates between `7247-web-01` and `7247-web-02`.
In the browser, the footer shows **"Served by: …"** and changes when you refresh.

**Failover test:** run `sudo systemctl stop jobscout` on web-01. All traffic goes to web-02 and the
site keeps working. Start it again with `sudo systemctl start jobscout`.

## 9. Security
- The API key is only in `.env` on the servers; `.env` is in `.gitignore`.
- The browser never calls Adzuna directly — the server adds the app ID and key.
- Server-side input validation (length, allowed characters, allowed filter values).
- Job data is shown with `textContent`, never `innerHTML` (XSS protection).
- Security headers are set, `X-Powered-By` is removed, and API calls time out after 10 seconds.

## 10. Challenges and how I solved them
- …

## 11. Credits
- [Adzuna API](https://developer.adzuna.com/) by Adzuna — job listings data
- [Express](https://expressjs.com), [dotenv](https://github.com/motdotla/dotenv)
- Claude (Anthropic) — AI assistant used for help with code and debugging
- [Nginx](https://nginx.org), [HAProxy](https://www.haproxy.org)
