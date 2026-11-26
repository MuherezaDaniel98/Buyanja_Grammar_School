# Database Schema & Setup Guide

## Architecture Overview

The system uses a strictly normalized relational schema across 23 tables covering authentication/RBAC, academic calendars, student enrolment history, teacher allocations, configurable grading scales, marks & version history, approvals, attendance, report card references, notifications, and immutable audit logs.

- **Development / Zero-Config Runtime**: Uses `better-sqlite3` (`server/db.ts`) with `PRAGMA foreign_keys = ON` and WAL journaling mode (`database/bgs_academic.db`).
- **Production MySQL 8.0+**: Uses the provided InnoDB DDL (`database/schema.mysql.sql`), migration script (`database/migrations/001_initial_schema.sql`), and `mysql2/promise` pool adapter (`server/db.mysql.ts`).

---

## Core Relational Tables

1. **Identity & RBAC**: `roles`, `permissions`, `role_permissions`, `users`, `user_roles`, `refresh_tokens`, `password_resets`, `login_attempts`
2. **Academic Structure**: `academic_years`, `terms`, `classes`, `streams`, `subjects`, `class_subjects`, `teachers`, `teacher_allocations`
3. **Students & Enrolment History**: `students`, `guardians`, `student_enrolments`, `attendance`, `intervention_notes`
4. **Examinations, Grading & Marks**: `grading_scales`, `grading_boundaries`, `examinations`, `assessment_categories`, `marks`, `subject_results`, `student_exam_summaries`
5. **Approval Workflow & Versioning**: `result_submissions`, `result_approvals`, `result_versions`, `teacher_comments`
6. **Reporting & Governance**: `report_cards`, `notifications`, `system_settings`, `audit_logs`

---

## Setting Up MySQL 8.0+ for Production

1. Create the database and dedicated least-privilege application user:
   ```sql
   CREATE DATABASE buyanja_grammar_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'bgs_app'@'%' IDENTIFIED BY 'your-strong-password';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER ON buyanja_grammar_db.* TO 'bgs_app'@'%';
   FLUSH PRIVILEGES;
   ```

2. Run the relational schema and composite indexing migration:
   ```bash
   mysql -u bgs_app -p buyanja_grammar_db < database/schema.mysql.sql
   mysql -u bgs_app -p buyanja_grammar_db < database/migrations/001_initial_schema.sql
   ```

3. Configure environment variables in `.env`:
   ```env
   DB_CLIENT=mysql
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=bgs_app
   MYSQL_PASSWORD=your-strong-password
   MYSQL_DATABASE=buyanja_grammar_db
   ```

---

## Key Analytical & Integrity Constraints

- **Foreign Keys**: Cascading deletes are restricted on historical academic entities (`students`, `subjects`, `examinations`, `classes`) to preserve institutional transcripts across years.
- **Unique Constraints**:
  - `uq_enrol_stu_year_term`: Prevents duplicate student enrolments within the same term.
  - `uq_mark_entry`: Enforces one mark record per `(examination_id, student_id, subject_id, assessment_category_id)`.
  - `uq_sub_exam_cls_str_subj`: Tracks a single canonical workflow status per `(examination_id, class_id, stream_id, subject_id)`.
- **Analytical Indexes**: Composite indexes on `(examination_id, class_id, stream_id)` across `marks`, `subject_results`, and `student_exam_summaries` ensure fast class ranking calculations and dashboard queries.
