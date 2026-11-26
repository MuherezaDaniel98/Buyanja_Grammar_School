-- ============================================================================
-- BUYANJA GRAMMAR SCHOOL – STUDENT MARKS MANAGEMENT & REPORT GENERATION SYSTEM
-- Production MySQL 8.0+ Relational Database Schema
-- Charset: utf8mb4 | Engine: InnoDB | Privacy-by-design & Audit Compliant
-- ============================================================================

CREATE DATABASE IF NOT EXISTS buyanja_grammar_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE buyanja_grammar_db;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  module VARCHAR(60) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(40) NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(160) NOT NULL,
  user_id INT NULL,
  success TINYINT(1) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  failure_reason VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_la_email_time (email, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year_label VARCHAR(20) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS terms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  term_number TINYINT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  next_term_begins DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_year_term (academic_year_id, term_number),
  CONSTRAINT fk_term_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  level VARCHAR(30) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS streams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_class_stream (class_id, name),
  CONSTRAINT fk_stream_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  short_name VARCHAR(30) NULL,
  department VARCHAR(80) NOT NULL,
  is_core TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  subject_id INT NOT NULL,
  is_compulsory TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_cs (class_id, subject_id),
  CONSTRAINT fk_cs_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  staff_number VARCHAR(40) NOT NULL UNIQUE,
  initials VARCHAR(10) NOT NULL,
  qualification VARCHAR(120) NULL,
  specialization VARCHAR(120) NULL,
  department VARCHAR(80) NULL,
  hire_date DATE NULL,
  status ENUM('ACTIVE', 'ON_LEAVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_teacher_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  subject_id INT NULL,
  is_class_teacher TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  INDEX idx_ta_lookup (teacher_id, academic_year_id, term_id, is_active),
  CONSTRAINT fk_ta_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_stream FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admission_number VARCHAR(40) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  other_names VARCHAR(80) NULL,
  gender ENUM('M', 'F') NOT NULL,
  date_of_birth DATE NULL,
  admission_date DATE NOT NULL,
  photo_url VARCHAR(255) NULL,
  status ENUM('ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED') NOT NULL DEFAULT 'ACTIVE',
  withdrawal_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_adm (admission_number),
  INDEX idx_students_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guardians (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  relationship VARCHAR(50) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  alt_phone VARCHAR(40) NULL,
  email VARCHAR(160) NULL,
  address VARCHAR(255) NULL,
  occupation VARCHAR(100) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_guardian_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_enrolments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  roll_number VARCHAR(30) NULL,
  status ENUM('ENROLLED', 'PROMOTED', 'TRANSFERRED', 'WITHDRAWN') NOT NULL DEFAULT 'ENROLLED',
  promoted_from_enrolment_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_term (student_id, academic_year_id, term_id),
  INDEX idx_enrol_class_term (class_id, stream_id, academic_year_id, term_id),
  CONSTRAINT fk_enrol_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_enrol_stream FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grading_scales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  level VARCHAR(40) NOT NULL,
  description VARCHAR(255) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grading_boundaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grading_scale_id INT NOT NULL,
  grade VARCHAR(10) NOT NULL,
  min_score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  descriptor VARCHAR(80) NOT NULL,
  remarks VARCHAR(160) NULL,
  CONSTRAINT fk_gb_scale FOREIGN KEY (grading_scale_id) REFERENCES grading_scales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS examinations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(30) NOT NULL,
  exam_type VARCHAR(40) NOT NULL DEFAULT 'TERMLY',
  grading_scale_id INT NOT NULL,
  submission_deadline DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  ranking_enabled TINYINT(1) NOT NULL DEFAULT 1,
  aggregate_enabled TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_exam_code_term (term_id, code),
  CONSTRAINT fk_exam_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_scale FOREIGN KEY (grading_scale_id) REFERENCES grading_scales(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessment_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(20) NOT NULL,
  max_marks DECIMAL(6,2) NOT NULL DEFAULT 100.00,
  weight_percentage DECIMAL(5,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_ac_exam_code (examination_id, code),
  CONSTRAINT fk_ac_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  subject_id INT NOT NULL,
  assessment_category_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  max_marks DECIMAL(6,2) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ass_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ass_cat FOREIGN KEY (assessment_category_id) REFERENCES assessment_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  subject_id INT NOT NULL,
  assessment_category_id INT NOT NULL,
  score DECIMAL(6,2) NULL,
  status_flag ENUM('PRESENT', 'ABSENT', 'EXEMPTED') NOT NULL DEFAULT 'PRESENT',
  entered_by INT NOT NULL,
  updated_by INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mark_cell (examination_id, student_id, subject_id, assessment_category_id),
  INDEX idx_marks_grid (examination_id, class_id, stream_id, subject_id),
  CONSTRAINT fk_marks_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_marks_cat FOREIGN KEY (assessment_category_id) REFERENCES assessment_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subject_results (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  subject_id INT NOT NULL,
  weighted_total DECIMAL(6,2) NULL,
  grade VARCHAR(10) NULL,
  points INT NULL,
  descriptor VARCHAR(80) NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sr_cell (examination_id, student_id, subject_id),
  INDEX idx_sr_student (student_id, examination_id),
  CONSTRAINT fk_sr_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_exam_summaries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  total_marks DECIMAL(8,2) NOT NULL DEFAULT 0,
  average_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  overall_grade VARCHAR(10) NULL,
  aggregate_points INT NULL,
  subjects_assessed INT NOT NULL DEFAULT 0,
  class_position INT NULL,
  stream_position INT NULL,
  class_size INT NULL,
  performance_descriptor VARCHAR(80) NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ses_student (examination_id, student_id),
  INDEX idx_ses_rank (examination_id, class_id, class_position),
  CONSTRAINT fk_ses_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ses_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS result_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  subject_id INT NOT NULL,
  submitted_by INT NULL,
  status ENUM('DRAFT', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'APPROVED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  teacher_notes TEXT NULL,
  dos_notes TEXT NULL,
  headteacher_notes TEXT NULL,
  submitted_at DATETIME NULL,
  verified_by INT NULL,
  verified_at DATETIME NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL,
  published_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_sub_scope (examination_id, class_id, stream_id, subject_id),
  CONSTRAINT fk_sub_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_stream FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS result_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  action VARCHAR(40) NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ra_sub FOREIGN KEY (submission_id) REFERENCES result_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS result_versions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NULL,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  assessment_category_id INT NOT NULL,
  previous_score DECIMAL(6,2) NULL,
  new_score DECIMAL(6,2) NULL,
  reason VARCHAR(255) NOT NULL,
  changed_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rv_user FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  class_teacher_comment TEXT NULL,
  head_teacher_comment TEXT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tc_exam_student (examination_id, student_id),
  CONSTRAINT fk_tc_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  student_id INT NOT NULL,
  total_days INT NOT NULL DEFAULT 0,
  days_present INT NOT NULL DEFAULT 0,
  days_absent INT NOT NULL DEFAULT 0,
  recorded_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_att_term_student (term_id, student_id),
  CONSTRAINT fk_att_term FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_ref VARCHAR(64) NOT NULL UNIQUE,
  examination_id INT NOT NULL,
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  stream_id INT NOT NULL,
  verification_hash VARCHAR(128) NOT NULL,
  generated_by INT NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  template_code VARCHAR(40) NOT NULL DEFAULT 'CLASSIC_NAVY',
  INDEX idx_rc_ref (report_ref),
  CONSTRAINT fk_rc_exam FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_rc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'SYSTEM',
  link VARCHAR(255) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user_read (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  user_name VARCHAR(150) NULL,
  user_role VARCHAR(40) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(64) NULL,
  previous_value TEXT NULL,
  new_value TEXT NULL,
  reason VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS backups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(180) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  record_counts TEXT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS intervention_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  risk_level ENUM('MONITOR', 'MODERATE', 'HIGH') NOT NULL DEFAULT 'MONITOR',
  note TEXT NOT NULL,
  action_plan TEXT NULL,
  status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_int_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
