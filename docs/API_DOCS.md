# REST API Reference

Base URL: `/api`

All protected routes require `Authorization: Bearer <accessToken>` unless marked **Public**.

---

## 1. Authentication & Profile (`/api/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/demo-status` | Public | Returns school name, logo URL, and sample-data banner flag |
| `POST` | `/api/auth/login` | Public | Authenticates email/password; returns access JWT + `HttpOnly` refresh cookie |
| `POST` | `/api/auth/refresh` | Public (Cookie) | Rotates `bgs_refresh_token` cookie and issues a fresh access JWT |
| `POST` | `/api/auth/logout` | Public | Revokes refresh token in DB and clears cookie |
| `POST` | `/api/auth/forgot-password` | Public | Generates single-use expiring recovery token |
| `POST` | `/api/auth/reset-password` | Public | Consumes recovery token and hashes new password |
| `GET` | `/api/auth/me` | Authenticated | Returns current user context, roles, permissions, and profile |
| `PUT` | `/api/auth/profile` | Authenticated | Updates signed-in user's name and phone number |
| `POST` | `/api/auth/change-password` | Authenticated | Verifies current password and sets new password |

---

## 2. Dashboard & Search (`/api/dashboard`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/overview` | Authenticated | Returns role-scoped KPIs, submission pipeline counts, and performance metrics |
| `GET` | `/api/dashboard/search?q=` | Authenticated | Global quick search across students, teachers, and subjects |

---

## 3. Students & Guardians (`/api/students`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/students` | `students.view` | Filterable directory by class, stream, gender, status, term, and search |
| `GET` | `/api/students/:id` | `students.view` | Complete 6-tab student profile (guardians, enrolments, results, attendance, reports, interventions) |
| `POST` | `/api/students` | `students.manage` | Registers student with auto-generated `BGS/YYYY/XXXX` admission number & primary guardian |
| `PUT` | `/api/students/:id` | `students.manage` | Updates student & primary guardian details or withdrawal/transfer status |
| `POST` | `/api/students/:id/photo` | `students.manage` | Uploads JPEG/PNG/WebP passport photo (MIME & path-validated) |
| `POST` | `/api/students/promote` | `students.manage` | Promotes or transfers students to target class/stream while preserving history |
| `GET` | `/api/students/import-template` | `students.manage` | Downloads Excel import template |
| `POST` | `/api/students/import/preview` | `students.manage` | Parses Excel/CSV and validates rows before commit |
| `POST` | `/api/students/import/commit` | `students.manage` | Atomically imports validated student rows |
| `GET` | `/api/students/export` | `students.view` | Exports student directory in `.xlsx` or `.csv` format |

---

## 4. Academics, Teachers & Grading Configuration (`/api/academics`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/academics/years-terms` | `academics.view` | Lists academic years and terms |
| `POST` | `/api/academics/years` | `academics.manage` | Creates academic year with 3 terms |
| `POST` | `/api/academics/terms/:id/activate` | `academics.manage` | Switches active term & year |
| `GET` | `/api/academics/classes` | `academics.view` | Lists classes, streams, and enrolled counts |
| `POST` | `/api/academics/classes` / `/streams` | `academics.manage` | Creates classes or streams |
| `GET` | `/api/academics/subjects` | `academics.view` | Lists subjects and class-subject mappings |
| `POST` | `/api/academics/subjects` / `/class-subjects` | `academics.manage` | Registers subjects and configures class subject offerings |
| `GET` | `/api/academics/teachers` | `teachers.view` | Lists teaching staff and allocation counts |
| `POST` | `/api/academics/teachers` | `teachers.manage` | Registers teacher and creates staff user account |
| `GET` | `/api/academics/allocations` | `academics.view` | Lists teacher-class-stream-subject allocations |
| `POST` | `/api/academics/allocations` | `academics.manage` | Assigns subject teacher and optional Class Teacher role |
| `DELETE` | `/api/academics/allocations/:id` | `academics.manage` | Revokes teacher allocation |
| `GET` | `/api/academics/grading-scales` | `academics.view` | Lists grading scales and boundary bands |
| `POST` / `PUT` | `/api/academics/grading-scales` | `exams.configure` | Creates or updates configurable grade boundaries |
| `GET` | `/api/academics/examinations` | `academics.view` | Lists examinations and weighted assessment categories |
| `POST` / `PUT` | `/api/academics/examinations` | `exams.configure` | Configures exam metadata, grading scale, and assessment weights |

---

## 5. Marks Entry, Import & Approval Workflow (`/api/marks`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/marks/grid` | `marks.enter` (allocated) | Loads students, assessment categories, marks, and submission lock state |
| `POST` | `/api/marks/save-draft` | `marks.enter` (allocated) | Saves draft marks with `max_marks` & optimistic `version` validation + recalculation |
| `GET` | `/api/marks/import-template` | `marks.enter` | Downloads pre-populated Excel marks sheet for selected class/subject |
| `POST` | `/api/marks/import/preview` | `marks.enter` | Validates uploaded Excel/CSV scores against admission numbers & limits |
| `POST` | `/api/marks/import/commit` | `marks.enter` | Commits validated marks and triggers class recalculation |
| `POST` | `/api/marks/submit` | `marks.enter` (allocated) | Locks marks and submits to DOS (`SUBMITTED`) |
| `GET` | `/api/marks/submissions` | Authenticated | Lists subject submission status tracker |
| `POST` | `/api/marks/verify` | `marks.verify` | DOS marks submission as `VERIFIED` or `RETURNED` (cannot verify own submission) |
| `POST` | `/api/marks/approve` | `results.approve` | Head Teacher sets `APPROVED`, `PUBLISHED`, or `RETURNED` |
| `POST` | `/api/marks/correct-approved` | `results.correct_approved` | Authorized post-approval correction requiring reason & creating `result_versions` log |
| `GET` | `/api/marks/published` | Authenticated | Lists calculated student summaries for published results & comments |
| `POST` | `/api/marks/comments` | `comments.manage` / `headteacher.remarks` | Saves class teacher / head teacher comments & term attendance |

---

## 6. Report Cards, Exports & QR Verification (`/api/reports`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/verify/:reportRef` | **Public** | Verifies report authenticity using minimal non-PII registry fields |
| `GET` | `/api/reports/preview/:studentId` | `reports.generate` | Returns complete report card JSON payload & QR verification link |
| `GET` | `/api/reports/pdf/student/:studentId` | `reports.generate` | Generates downloadable A4 PDF report card with QR code |
| `POST` | `/api/reports/pdf/bulk` | `reports.generate` | Generates combined multi-page PDF booklet for a class/stream |
| `GET` | `/api/reports/summaries/export` | `reports.generate` | Exports rankings, subject averages, or submissions in `.xlsx` or `.pdf` |

---

## 7. Academic Analytics & Early Warning (`/api/analytics`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/overview` | `analytics.view` | Subject averages, class/stream comparison, grade distribution, top & at-risk counts |
| `GET` | `/api/analytics/risk-students` | `analytics.view` / `comments.manage` | Identifies declining, at-risk, and top-performing students across terms |
| `POST` | `/api/analytics/interventions` | `analytics.view` / `comments.manage` | Logs academic follow-up intervention notes on student profiles |

---

## 8. Governance, Users, Settings & Backups (`/api/admin`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` / `POST` | `/api/admin/notifications` / `/read` | Authenticated | Lists and marks user notifications read |
| `POST` | `/api/admin/notifications/broadcast` | `notifications.manage` | Broadcasts role-targeted announcements (+ optional SMTP email) |
| `GET` | `/api/admin/audit-logs` | `audit.view` | Read-only immutable audit trail and login attempt history |
| `GET` / `POST` / `PUT` | `/api/admin/users` | `users.manage` | Staff account provisioning, role assignment, and activation |
| `GET` / `PUT` | `/api/admin/settings` | `settings.manage` (PUT) | Configurable school identity, thresholds, and report card display options |
| `POST` | `/api/admin/settings/logo` | `settings.manage` | Uploads custom school crest/logo image |
| `GET` / `POST` | `/api/admin/backups` | `settings.manage` | Creates, lists, and downloads timestamped JSON/DB snapshots |
