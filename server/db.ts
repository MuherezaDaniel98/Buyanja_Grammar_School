import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), process.env.SQLITE_PATH || './database/bgs_academic.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// Enforce strict relational foreign keys and WAL concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export function initializeDatabaseSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      user_id INTEGER,
      success INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_label TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      term_number INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      next_term_begins TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      UNIQUE (academic_year_id, term_number),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (class_id, name),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT,
      department TEXT NOT NULL,
      is_core INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      is_compulsory INTEGER NOT NULL DEFAULT 1,
      UNIQUE (class_id, subject_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      staff_number TEXT NOT NULL UNIQUE,
      initials TEXT NOT NULL,
      qualification TEXT,
      specialization TEXT,
      department TEXT,
      hire_date TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teacher_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      subject_id INTEGER,
      is_class_teacher INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ta_lookup ON teacher_allocations(teacher_id, academic_year_id, term_id, is_active);

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      other_names TEXT,
      gender TEXT NOT NULL CHECK (gender IN ('M', 'F')),
      date_of_birth TEXT,
      admission_date TEXT NOT NULL,
      photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      withdrawal_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_students_adm ON students(admission_number);

    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      email TEXT,
      address TEXT,
      occupation TEXT,
      is_primary INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_enrolments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      roll_number TEXT,
      status TEXT NOT NULL DEFAULT 'ENROLLED',
      promoted_from_enrolment_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, academic_year_id, term_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_enrol_class_term ON student_enrolments(class_id, stream_id, academic_year_id, term_id);

    CREATE TABLE IF NOT EXISTS grading_scales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      description TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grading_boundaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grading_scale_id INTEGER NOT NULL,
      grade TEXT NOT NULL,
      min_score REAL NOT NULL,
      max_score REAL NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      descriptor TEXT NOT NULL,
      remarks TEXT,
      FOREIGN KEY (grading_scale_id) REFERENCES grading_scales(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'TERMLY',
      grading_scale_id INTEGER NOT NULL,
      submission_deadline TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      ranking_enabled INTEGER NOT NULL DEFAULT 1,
      aggregate_enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE (term_id, code),
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
      FOREIGN KEY (grading_scale_id) REFERENCES grading_scales(id)
    );

    CREATE TABLE IF NOT EXISTS assessment_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      max_marks REAL NOT NULL DEFAULT 100,
      weight_percentage REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      UNIQUE (examination_id, code),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      assessment_category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      max_marks REAL NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (assessment_category_id) REFERENCES assessment_categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      assessment_category_id INTEGER NOT NULL,
      score REAL,
      status_flag TEXT NOT NULL DEFAULT 'PRESENT',
      entered_by INTEGER NOT NULL,
      updated_by INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (examination_id, student_id, subject_id, assessment_category_id),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (assessment_category_id) REFERENCES assessment_categories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_marks_grid ON marks(examination_id, class_id, stream_id, subject_id);

    CREATE TABLE IF NOT EXISTS subject_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      weighted_total REAL,
      grade TEXT,
      points INTEGER,
      descriptor TEXT,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (examination_id, student_id, subject_id),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_exam_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      total_marks REAL NOT NULL DEFAULT 0,
      average_score REAL NOT NULL DEFAULT 0,
      overall_grade TEXT,
      aggregate_points INTEGER,
      subjects_assessed INTEGER NOT NULL DEFAULT 0,
      class_position INTEGER,
      stream_position INTEGER,
      class_size INTEGER,
      performance_descriptor TEXT,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (examination_id, student_id),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS result_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      submitted_by INTEGER,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      teacher_notes TEXT,
      dos_notes TEXT,
      headteacher_notes TEXT,
      submitted_at TEXT,
      verified_by INTEGER,
      verified_at TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      published_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      UNIQUE (examination_id, class_id, stream_id, subject_id),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS result_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      actor_user_id INTEGER NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      comments TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES result_submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS result_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      assessment_category_id INTEGER NOT NULL,
      previous_score REAL,
      new_score REAL,
      reason TEXT NOT NULL,
      changed_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS teacher_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      class_teacher_comment TEXT,
      head_teacher_comment TEXT,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (examination_id, student_id),
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 0,
      days_present INTEGER NOT NULL DEFAULT 0,
      days_absent INTEGER NOT NULL DEFAULT 0,
      recorded_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (term_id, student_id),
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS report_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_ref TEXT NOT NULL UNIQUE,
      examination_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      verification_hash TEXT NOT NULL,
      generated_by INTEGER NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      template_code TEXT NOT NULL DEFAULT 'CLASSIC_NAVY',
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'SYSTEM',
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      previous_value TEXT,
      new_value TEXT,
      reason TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      record_counts TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intervention_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'MONITOR',
      note TEXT NOT NULL,
      action_plan TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);
}
