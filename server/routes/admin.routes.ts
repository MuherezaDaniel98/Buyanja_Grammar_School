import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { db } from '../db.js';
import { recordAuditLog } from '../middleware/audit.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use(authenticate);

const backupsDir = path.resolve(process.cwd(), 'database/backups');
fs.mkdirSync(backupsDir, { recursive: true });

const logoDir = path.resolve(process.cwd(), 'public/uploads/school');
fs.mkdirSync(logoDir, { recursive: true });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
      cb(null, `school_logo_${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, or WebP images are allowed.'));
    }
  },
});

// === NOTIFICATIONS ===
adminRouter.get('/notifications', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 60`
    )
    .all(req.authUser!.id);
  const unreadCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
      .get(req.authUser!.id) as { cnt: number }
  ).cnt;
  res.json({ notifications: rows, unreadCount });
});

adminRouter.post('/notifications/read', (req, res) => {
  const id = req.body.id ? Number(req.body.id) : null;
  if (id) {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
      id,
      req.authUser!.id
    );
  } else {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser!.id);
  }
  res.json({ message: 'Notifications marked as read.' });
});

adminRouter.post('/notifications/broadcast', requirePermission('notifications.manage'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(3).max(160),
    message: z.string().min(5).max(1000),
    targetRole: z.string().default('ALL'),
    sendEmail: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid announcement details.' });
    return;
  }

  const users = (
    parsed.data.targetRole === 'ALL'
      ? db.prepare(`SELECT id, email FROM users WHERE is_active = 1`).all()
      : db
          .prepare(
            `SELECT u.id, u.email FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE r.code = ? AND u.is_active = 1`
          )
          .all(parsed.data.targetRole)
  ) as Array<{ id: number; email: string }>;

  const stmt = db.prepare(
    `INSERT INTO notifications (user_id, title, message, category, link) VALUES (?, ?, ?, 'ANNOUNCEMENT', '/notifications')`
  );
  for (const u of users) {
    stmt.run(u.id, parsed.data.title.trim(), parsed.data.message.trim());
  }

  let emailDispatched = false;
  if (parsed.data.sendEmail && process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        bcc: users.map((u) => u.email).join(','),
        subject: `[Buyanja Grammar School] ${parsed.data.title}`,
        text: parsed.data.message,
      });
      emailDispatched = true;
    } catch {
      // Non-fatal if SMTP unavailable
    }
  }

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'ANNOUNCEMENT_BROADCAST',
    entityType: 'notification',
    newValue: { targetRole: parsed.data.targetRole, recipients: users.length, emailDispatched },
    ipAddress: req.ip,
  });

  res.status(201).json({ recipientCount: users.length, emailDispatched });
});

// === IMMUTABLE AUDIT LOGS (Read-Only) ===
adminRouter.get('/audit-logs', requirePermission('audit.view'), (req, res) => {
  const action = req.query.action ? String(req.query.action) : null;
  const search = req.query.search ? String(req.query.search).trim() : null;

  const conditions = ['1=1'];
  const params: unknown[] = [];
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (search) {
    conditions.push('(user_name LIKE ? OR action LIKE ? OR entity_type LIKE ? OR reason LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const logs = db
    .prepare(
      `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT 200`
    )
    .all(...params);

  const loginAttempts = db
    .prepare(`SELECT * FROM login_attempts ORDER BY id DESC LIMIT 50`)
    .all();

  res.json({ logs, loginAttempts });
});

// === USER & ROLE MANAGEMENT ===
adminRouter.get('/users', requirePermission('users.manage'), (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.last_login_at, u.created_at,
              GROUP_CONCAT(r.code) AS role_codes,
              GROUP_CONCAT(r.name) AS role_names
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.id ASC`
    )
    .all();
  const roles = db.prepare(`SELECT * FROM roles ORDER BY id ASC`).all();
  const permissions = db.prepare(`SELECT * FROM permissions ORDER BY module, id`).all();
  const rolePermissions = db.prepare(`SELECT * FROM role_permissions`).all();
  res.json({ users, roles, permissions, rolePermissions });
});

adminRouter.post('/users', requirePermission('users.manage'), async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(150),
    email: z.string().email(),
    phone: z.string().max(40).optional().nullable(),
    roleCode: z.string().min(2),
    password: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user details. Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = ?`).get(parsed.data.email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'Email is already registered.' });
    return;
  }

  const role = db.prepare(`SELECT id FROM roles WHERE code = ?`).get(parsed.data.roleCode) as
    | { id: number }
    | undefined;
  if (!role) {
    res.status(400).json({ error: 'Invalid role selected.' });
    return;
  }

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const userId = db.transaction(() => {
    const r = db
      .prepare(`INSERT INTO users (full_name, email, phone, password_hash, is_active) VALUES (?, ?, ?, ?, 1)`)
      .run(parsed.data.fullName.trim(), parsed.data.email.trim().toLowerCase(), parsed.data.phone || null, hash);
    const id = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).run(id, role.id);
    return id;
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: userId,
    newValue: { email: parsed.data.email, role: parsed.data.roleCode },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: userId });
});

adminRouter.put('/users/:id', requirePermission('users.manage'), (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    fullName: z.string().min(2).max(150).optional(),
    phone: z.string().max(40).optional().nullable(),
    isActive: z.boolean().optional(),
    roleCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user update payload.' });
    return;
  }

  if (id === req.authUser!.id && parsed.data.isActive === false) {
    res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
    return;
  }

  const prev = db.prepare(`SELECT full_name, is_active FROM users WHERE id = ?`).get(id);
  db.transaction(() => {
    if (parsed.data.fullName !== undefined || parsed.data.isActive !== undefined || parsed.data.phone !== undefined) {
      db.prepare(
        `UPDATE users
         SET full_name = COALESCE(?, full_name),
             phone = COALESCE(?, phone),
             is_active = COALESCE(?, is_active),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        parsed.data.fullName ?? null,
        parsed.data.phone ?? null,
        parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : null,
        id
      );
    }

    if (parsed.data.roleCode) {
      const role = db.prepare(`SELECT id FROM roles WHERE code = ?`).get(parsed.data.roleCode) as
        | { id: number }
        | undefined;
      if (role) {
        db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).run(id);
        db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).run(id, role.id);
      }
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: id,
    previousValue: prev,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.json({ message: 'User account updated.' });
});

// === SYSTEM SETTINGS & LOGO UPLOAD ===
adminRouter.get('/settings', (_req, res) => {
  const rows = db.prepare(`SELECT setting_key, setting_value FROM system_settings`).all() as Array<{
    setting_key: string;
    setting_value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of rows) {
    settings[r.setting_key] = r.setting_value;
  }
  res.json({ settings });
});

adminRouter.put('/settings', requirePermission('settings.manage'), (req, res) => {
  const settingsObj = req.body.settings as Record<string, string>;
  if (!settingsObj || typeof settingsObj !== 'object') {
    res.status(400).json({ error: 'Settings object is required.' });
    return;
  }

  db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(setting_key)
      DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = datetime('now')
    `);
    for (const [k, v] of Object.entries(settingsObj)) {
      upsert.run(k, String(v ?? ''), req.authUser!.id);
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'SYSTEM_SETTINGS_UPDATED',
    entityType: 'system_settings',
    newValue: settingsObj,
    ipAddress: req.ip,
  });

  res.json({ message: 'School & system settings saved.' });
});

adminRouter.post('/settings/logo', requirePermission('settings.manage'), logoUpload.single('logo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Logo file is required.' });
    return;
  }
  const resolved = path.resolve(req.file.path);
  if (!resolved.startsWith(logoDir + path.sep)) {
    res.status(400).json({ error: 'Invalid upload path.' });
    return;
  }
  const url = `/uploads/school/${req.file.filename}`;
  db.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ('school_logo_url', ?, ?, datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by`
  ).run(url, req.authUser!.id);

  res.json({ logoUrl: url });
});

// === DATABASE BACKUPS ===
adminRouter.get('/backups', requirePermission('settings.manage'), (_req, res) => {
  const backups = db
    .prepare(
      `SELECT b.*, u.full_name AS created_by_name
       FROM backups b LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json({ backups });
});

adminRouter.post('/backups/create', requirePermission('settings.manage'), (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `bgs_backup_${timestamp}.json`;
  const targetPath = path.resolve(backupsDir, filename);
  if (!targetPath.startsWith(backupsDir + path.sep)) {
    res.status(400).json({ error: 'Invalid backup path.' });
    return;
  }

  const tables = [
    'academic_years',
    'terms',
    'classes',
    'streams',
    'subjects',
    'students',
    'guardians',
    'student_enrolments',
    'examinations',
    'assessment_categories',
    'marks',
    'subject_results',
    'student_exam_summaries',
    'result_submissions',
    'teacher_comments',
    'attendance',
    'system_settings',
  ];

  const snapshot: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    snapshot[t] = rows;
    counts[t] = rows.length;
  }

  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      exportedBy: req.authUser!.email,
      counts,
      data: snapshot,
    },
    null,
    2
  );
  fs.writeFileSync(targetPath, payload, 'utf8');
  const size = fs.statSync(targetPath).size;

  const r = db
    .prepare(
      `INSERT INTO backups (filename, file_size, record_counts, created_by) VALUES (?, ?, ?, ?)`
    )
    .run(filename, size, JSON.stringify(counts), req.authUser!.id);

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'DATABASE_BACKUP_CREATED',
    entityType: 'backup',
    entityId: Number(r.lastInsertRowid),
    newValue: { filename, size },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: Number(r.lastInsertRowid), filename, size, counts });
});

adminRouter.get('/backups/:id/download', requirePermission('settings.manage'), (req, res) => {
  const backup = db
    .prepare(`SELECT filename FROM backups WHERE id = ?`)
    .get(Number(req.params.id)) as { filename: string } | undefined;
  if (!backup) {
    res.status(404).json({ error: 'Backup not found.' });
    return;
  }
  const targetPath = path.resolve(backupsDir, path.basename(backup.filename));
  if (!targetPath.startsWith(backupsDir + path.sep) || !fs.existsSync(targetPath)) {
    res.status(404).json({ error: 'Backup file unavailable.' });
    return;
  }
  res.download(targetPath, backup.filename);
});
