# Production Deployment & Operations Guide

## 1. Environment Configuration

Define required environment variables securely on the host (never commit `.env` secrets to version control):

```env
PORT=3000
NODE_ENV=production
APP_URL=https://academics.buyanjagrammar.ac.ug

# Cryptographically random 64-byte secrets
JWT_ACCESS_SECRET=<replace-with-strong-random-secret>
JWT_REFRESH_SECRET=<replace-with-different-strong-random-secret>

# Database (SQLite or MySQL 8.0+)
SQLITE_PATH=./database/bgs_academic.db
# DB_CLIENT=mysql
# MYSQL_HOST=127.0.0.1
# MYSQL_PORT=3306
# MYSQL_USER=bgs_app
# MYSQL_PASSWORD=<strong-db-password>
# MYSQL_DATABASE=buyanja_grammar_db

# Optional SMTP for Password Recovery & Broadcast Notifications
# SMTP_HOST=smtp.example.org
# SMTP_PORT=587
# SMTP_USER=noreply@buyanjagrammar.ac.ug
# SMTP_PASS=<smtp-password>
# SMTP_FROM="Buyanja Grammar School <noreply@buyanjagrammar.ac.ug>"
```

---

## 2. Building & Starting in Production

```bash
npm ci
npm run build
NODE_ENV=production npm start
```

The Express server (`server.ts`) serves both the `/api/*` endpoints and the compiled `dist/` React application on port `3000` (behind HTTPS reverse proxy such as Nginx or Caddy).

---

## 3. Security Hardening & Cookie Configuration

- **HTTPS Termination**: Always serve behind TLS (`https://`). Refresh cookies use `HttpOnly`, `Secure`, `SameSite=None`, and `Partitioned` flags (`app.set('trust proxy', 1)`).
- **Rate Limiting**: Built-in `express-rate-limit` throttles `/api/auth/login`, `/api/auth/forgot-password`, and general `/api/*` traffic.
- **Initial Sample Data Hygiene**: Before live institutional use, remove or replace demonstration staff passwords and set `is_sample_data = false` inside **System Settings**.

---

## 4. Backups & Uganda Data Protection Act (2019) Compliance

- **Automated Snapshots**: Use **System Settings -> Backups** to generate and download encrypted/archived JSON database snapshots before termly result publication or server upgrades.
- **QR Verification Privacy**: Official report cards embed QR links to `/verify-report/:reportRef`. By design, this public endpoint verifies document authenticity using only school identity, term, exam, class, and admission reference—never exposing student grades, marks, or guardian contact details.
- **Audit Retention**: `audit_logs` and `result_versions` are append-only on the API layer; configure off-site backup retention policies in accordance with institutional governance rules.
