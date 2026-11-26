-- Migration 001: Initial Schema Verification & Baseline Indexes
-- Run via: mysql -u root -p buyanja_grammar_db < database/migrations/001_initial_schema.sql

SOURCE ../schema.mysql.sql;

-- Composite analytical indexes for fast termly comparisons & early-warning queries
CREATE INDEX idx_sr_exam_class_subj ON subject_results (examination_id, class_id, subject_id, weighted_total);
CREATE INDEX idx_ses_exam_avg ON student_exam_summaries (examination_id, class_id, average_score);
CREATE INDEX idx_sub_status ON result_submissions (examination_id, status);
