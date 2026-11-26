# BUYANJA GRAMMAR SCHOOL – Student Marks Management and Automated Report Generation System

A production-grade, role-based academic management platform built for **Buyanja Grammar School (Rukungiri District, Uganda)**. The system streamlines student enrolment, teacher subject allocation, configurable assessment weighting and grading scales, spreadsheet-style marks entry and Excel import, multi-stage marks verification and approval, automated PDF report card generation with QR verification, academic analytics, early-warning risk identification, and immutable security auditing.

---

## Core Capabilities

- **5-Role Access Control (RBAC)**:
  - **System Administrator (`SYSTEM_ADMIN`)**: Full system settings, user & role provisioning, grading policy configuration, database backups, and security audit review.
  - **Head Teacher (`HEAD_TEACHER`)**: Institutional analytics, final approval/locking/publication of verified results, Head Teacher report card remarks, authorized post-approval corrections, and school-wide PDFs.
  - **Director of Studies (`DOS`)**: Academic structure, teacher subject allocations, examination & assessment category configuration, marks verification/return workflow, and class performance summaries.
  - **Class Teacher (`CLASS_TEACHER`)**: Assigned stream monitoring, class teacher comments, termly attendance records, risk interventions, and stream report card generation.
  - **Subject Teacher (`SUBJECT_TEACHER`)**: Keyboard-navigable marks entry grid with debounced autosave, `ABSENT`/`EXEMPTED` flags, Excel/CSV template import with validation preview, and submission for DOS review.
- **Configurable Grading & Assessment Engine**:
  - No hardcoded grade boundaries or assessment weights; administrators configure custom scales, grade boundaries, points, descriptors, and weighted assessment categories per examination inside atomic database transactions.
  - Standard competition ranking (`1, 1, 3`) for both class and stream positions.
- **Official A4 PDF Report Cards & QR Verification**:
  - Live interactive preview plus single-student and bulk-class A4 PDF generation using PDFKit.
  - Embedded QR code linking to `/verify-report/:reportRef`, returning minimal verification fields (school name, year, term, exam, class, admission reference, issue timestamp) without exposing student marks or guardian personal data.
- **Academic Analytics & Early-Warning Decision Support**:
  - Subject averages, grade distributions, stream comparisons, historical term-over-term trends, at-risk student identification, and recorded academic intervention notes.
- **Security & Governance**:
  - Short-lived JWT access tokens stored in JavaScript memory (`Bearer` auth) paired with `HttpOnly; Secure; SameSite=None` rotating refresh cookies.
  - Bcrypt password hashing, account lockout after repeated failures, parameterized SQL queries, MIME-validated uploads, and read-only `audit_logs`.

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Start full-stack Express + Vite server on port 3000
npm run dev
```

On first boot, the system initializes the relational SQLite database (`database/bgs_academic.db`), creates all schema tables and indexes, seeds realistic demonstration records for Buyanja Grammar School, and executes initial automated grading calculations.

---

## Demonstration Accounts

> **Notice**: All demonstration records are clearly tagged with `is_sample_data = true` in System Settings. Change or deactivate sample accounts before production use.

| Role | Email | Password |
| :--- | :--- | :--- |
| System Administrator | `admin@buyanjagrammar.ac.ug` | `Bgs@2026!` |
| Head Teacher | `headteacher@buyanjagrammar.ac.ug` | `Bgs@2026!` |
| Director of Studies | `dos@buyanjagrammar.ac.ug` | `Bgs@2026!` |
| Class Teacher (S.2 North / ENG) | `classteacher@buyanjagrammar.ac.ug` | `Bgs@2026!` |
| Subject Teacher (MTC / ICT) | `teacher@buyanjagrammar.ac.ug` | `Bgs@2026!` |

---

## Project Structure

```text
├── database/
│   ├── schema.mysql.sql            # Full MySQL 8.0+ InnoDB relational schema
│   └── migrations/
│       └── 001_initial_schema.sql  # Production migration & composite indexes
├── docs/
│   ├── API_DOCS.md                 # Complete REST API reference
│   ├── DATABASE_SETUP.md           # SQLite dev & MySQL 8.0+ setup guide
│   ├── DEPLOYMENT.md               # Production deployment & compliance guide
│   └── TESTING.md                  # Automated QA test suite & coverage matrix
├── server/
│   ├── db.ts                       # SQLite relational connection & schema bootstrap
│   ├── db.mysql.ts                 # MySQL 8.0+ mysql2/promise pool adapter
│   ├── seed.ts                     # Relational institutional dataset & calculations
│   ├── logger.ts                   # Structured Pino logger
│   ├── middleware/
│   │   ├── auth.ts                 # JWT verification, refresh cookies, RBAC guards
│   │   └── audit.ts                # Immutable audit logger & notifications helper
│   ├── routes/                     # Modular Express routers (auth, students, academics, marks, reports, analytics, admin)
│   └── services/
│       ├── gradingEngine.ts        # Weighted calculation, boundary lookup, tie-ranking
│       ├── pdfService.ts           # PDFKit report card & summary table generator + QR
│       └── excelService.ts         # ExcelJS workbook templates, parser & tabular exports
├── src/
│   ├── context/AuthContext.tsx     # In-memory JWT auth state & permission helpers
│   ├── lib/api.ts                  # Axios instance with silent refresh interceptor
│   ├── components/                 # AppLayout, RBAC sidebar, UI primitives
│   └── pages/                      # Role-aware modules & print-ready report preview
├── tests/
│   └── system.test.ts              # Vitest + Supertest end-to-end verification suite
├── server.ts                       # Express app factory & server entrypoint
└── package.json
```

---

## Available Scripts

- `npm run dev` — Run Express + Vite development server on port `3000`
- `npm run build` — Build optimized Vite frontend bundle into `dist/`
- `npm run start` — Serve production Express API + compiled `dist/` frontend
- `npm run lint` — TypeScript strict type verification (`tsc --noEmit`)
- `npm test` — Run Vitest + Supertest automated QA test suite
