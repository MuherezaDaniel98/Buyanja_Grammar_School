# Automated QA Testing & Verification Matrix

## Running the Automated Test Suite

Tests run with **Vitest** and **Supertest** against an isolated temporary SQLite database (`database/test_bgs_qa.db`), automatically cleaned up before and after execution.

```bash
npm test
```

---

## Test Coverage Matrix (`tests/system.test.ts`)

| Category | Scenarios Verified | Outcome |
| :--- | :--- | :--- |
| **1. Authentication & Recovery** | Valid login JWT + `HttpOnly` refresh cookie, invalid password rejection (`401`), tampered Bearer token rejection (`401`), forgot-password token generation & reset completion | Passed |
| **2. Role-Based Access Control** | Unauthenticated rejection (`401`), Subject Teacher blocked from unassigned Biology marks (`403`), Subject Teacher blocked from DOS verification & Head Teacher approval (`403`), DOS blocked from verifying own marks (`403`), Class Teacher blocked from unassigned Mathematics marks (`403`), Admin allowed System Settings (`200`) | Passed |
| **3. Marks Validation & Workflow** | Rejects scores exceeding configured `max_marks` (`400`), full lifecycle `DRAFT -> SUBMITTED -> 409 Lock -> VERIFIED -> PUBLISHED -> Authorized Correction`, `result_versions` history persisted with reason | Passed |
| **4. Grading & Calculation Engine** | Weighted calculation across 20%/30%/50% categories, configurable grade boundary lookup (`A–E`), `ABSENT` (0 score) & `EXEMPTED` normalization, standard competition tie rankings (`1, 1, 3`) | Passed |
| **5. Report Generation & QR** | Live report preview payload, single A4 PDFKit buffer (`%PDF-`), multi-student bulk PDF booklet, public `/api/reports/verify/:reportRef` confirms authenticity with zero marks or guardian PII exposed | Passed |
| **6. Security & Audit Integrity** | Parameterized SQL injection safety in login and search, non-image MIME upload rejection (`400`), read-only `audit_logs` enforcement, mutation audit recording | Passed |

---

## Build & Type Verification

Run static TypeScript checks and production bundle verification together:

```bash
npm run lint
npm run build
```
