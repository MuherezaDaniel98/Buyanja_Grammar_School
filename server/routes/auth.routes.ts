import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db.js';
import { recordAuditLog } from '../middleware/audit.js';
import {
  authenticate,
  clearRefreshCookie,
  getRefreshSecret,
  hashToken,
  loadUserAuthContext,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

authRouter.get('/demo-status', (_req, res) => {
  const row = db
    .prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'is_sample_data'`)
    .get() as { setting_value: string } | undefined;
  const schoolName = db
    .prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'school_name'`)
    .get() as { setting_value: string } | undefined;
  const schoolLogo = db
    .prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'school_logo_url'`)
    .get() as { setting_value: string } | undefined;

  res.json({
    sampleMode: row?.setting_value === 'true',
    schoolName: schoolName?.setting_value || 'BUYANJA GRAMMAR SCHOOL',
    schoolLogoUrl: schoolLogo?.setting_value || '/assets/aistudio/Bgs_logo_6081ecf0.png',
  });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid email address and password.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = req.ip || 'unknown';
  const ua = (req.headers['user-agent'] || '').slice(0, 250);

  const user = db
    .prepare(
      `SELECT id, full_name, email, password_hash, is_active, failed_login_attempts, locked_until
       FROM users WHERE LOWER(email) = ?`
    )
    .get(email) as
    | {
        id: number;
        full_name: string;
        email: string;
        password_hash: string;
        is_active: number;
        failed_login_attempts: number;
        locked_until: string | null;
      }
    | undefined;

  if (!user) {
    db.prepare(
      `INSERT INTO login_attempts (email, success, ip_address, user_agent, failure_reason)
       VALUES (?, 0, ?, ?, 'USER_NOT_FOUND')`
    ).run(email, ip, ua);
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (!user.is_active) {
    db.prepare(
      `INSERT INTO login_attempts (email, user_id, success, ip_address, user_agent, failure_reason)
       VALUES (?, ?, 0, ?, ?, 'ACCOUNT_DEACTIVATED')`
    ).run(email, user.id, ip, ua);
    res.status(403).json({ error: 'Your account has been deactivated. Contact the System Administrator.' });
    return;
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    res.status(429).json({
      error: 'Account temporarily locked due to repeated failed attempts. Try again in 15 minutes.',
    });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!valid) {
    const nextFails = user.failed_login_attempts + 1;
    const lockUntil = nextFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    db.prepare(
      `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`
    ).run(nextFails, lockUntil, user.id);

    db.prepare(
      `INSERT INTO login_attempts (email, user_id, success, ip_address, user_agent, failure_reason)
       VALUES (?, ?, 0, ?, ?, 'INVALID_PASSWORD')`
    ).run(email, user.id, ip, ua);

    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  db.prepare(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`
  ).run(user.id);

  db.prepare(
    `INSERT INTO login_attempts (email, user_id, success, ip_address, user_agent)
     VALUES (?, ?, 1, ?, ?)`
  ).run(email, user.id, ip, ua);

  const context = loadUserAuthContext(user.id);
  if (!context) {
    res.status(401).json({ error: 'Unable to load user profile.' });
    return;
  }

  const accessToken = signAccessToken(context);
  const refreshToken = signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address)
     VALUES (?, ?, ?, ?)`
  ).run(user.id, hashToken(refreshToken), expiresAt, ip);

  setRefreshCookie(res, refreshToken);
  recordAuditLog({
    userId: user.id,
    userName: context.fullName,
    userRole: context.primaryRole,
    action: 'USER_LOGIN',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ip,
  });

  res.json({ accessToken, user: context });
});

authRouter.get('/session', (req, res) => {
  const rawToken = req.cookies?.bgs_refresh_token as string | undefined;
  if (!rawToken) {
    res.json({ authenticated: false });
    return;
  }

  try {
    const payload = jwt.verify(rawToken, getRefreshSecret()) as unknown as { sub: number };
    const tokenHash = hashToken(rawToken);
    const stored = db
      .prepare(
        `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`
      )
      .get(tokenHash) as
      | { id: number; user_id: number; expires_at: string; revoked_at: string | null }
      | undefined;

    if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
      clearRefreshCookie(res);
      res.json({ authenticated: false });
      return;
    }

    const context = loadUserAuthContext(stored.user_id);
    if (!context || payload.sub !== stored.user_id) {
      clearRefreshCookie(res);
      res.json({ authenticated: false });
      return;
    }

    // Rotate refresh token silently
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(stored.id);
    const nextRefresh = signRefreshToken(context.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address)
       VALUES (?, ?, ?, ?)`
    ).run(context.id, hashToken(nextRefresh), expiresAt, req.ip || 'unknown');

    setRefreshCookie(res, nextRefresh);
    const accessToken = signAccessToken(context);
    res.json({ authenticated: true, accessToken, user: context });
  } catch {
    clearRefreshCookie(res);
    res.json({ authenticated: false });
  }
});

authRouter.post('/refresh', (req, res) => {
  const rawToken = req.cookies?.bgs_refresh_token as string | undefined;
  if (!rawToken) {
    res.status(401).json({ error: 'No active refresh session.' });
    return;
  }

  try {
    const payload = jwt.verify(rawToken, getRefreshSecret()) as unknown as { sub: number };
    const tokenHash = hashToken(rawToken);
    const stored = db
      .prepare(
        `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`
      )
      .get(tokenHash) as
      | { id: number; user_id: number; expires_at: string; revoked_at: string | null }
      | undefined;

    if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Refresh session expired or revoked.' });
      return;
    }

    const context = loadUserAuthContext(stored.user_id);
    if (!context || payload.sub !== stored.user_id) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'User account inactive.' });
      return;
    }

    // Rotate refresh token
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(stored.id);
    const nextRefresh = signRefreshToken(context.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address)
       VALUES (?, ?, ?, ?)`
    ).run(context.id, hashToken(nextRefresh), expiresAt, req.ip || 'unknown');

    setRefreshCookie(res, nextRefresh);
    const accessToken = signAccessToken(context);
    res.json({ accessToken, user: context });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'Invalid refresh session.' });
  }
});

authRouter.post('/logout', (req, res) => {
  const rawToken = req.cookies?.bgs_refresh_token as string | undefined;
  if (rawToken) {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?`).run(
      hashToken(rawToken)
    );
  }
  clearRefreshCookie(res);
  res.json({ message: 'Signed out securely.' });
});

authRouter.get('/me', authenticate, (req, res) => {
  const userRow = db
    .prepare(`SELECT id, full_name, email, phone, last_login_at, created_at FROM users WHERE id = ?`)
    .get(req.authUser!.id);
  res.json({ user: req.authUser, profile: userRow });
});

authRouter.put('/profile', authenticate, (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(150),
    phone: z.string().max(40).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile details.' });
    return;
  }
  db.prepare(`UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
    parsed.data.fullName.trim(),
    parsed.data.phone || null,
    req.authUser!.id
  );
  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'PROFILE_UPDATED',
    entityType: 'user',
    entityId: req.authUser!.id,
    newValue: parsed.data,
    ipAddress: req.ip,
  });
  res.json({ user: loadUserAuthContext(req.authUser!.id) });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(4),
    newPassword: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const user = db
    .prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .get(req.authUser!.id) as { password_hash: string };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
  if (!ok) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
  ).run(nextHash, req.authUser!.id);

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: req.authUser!.id,
    ipAddress: req.ip,
  });

  res.json({ message: 'Password updated successfully.' });
});

authRouter.post('/forgot-password', (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = db
    .prepare(`SELECT id, full_name FROM users WHERE LOWER(email) = ? AND is_active = 1`)
    .get(email) as { id: number; full_name: string } | undefined;

  let resetCodePreview: string | undefined;
  if (user) {
    const rawCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
    ).run(user.id, hashToken(rawCode), expiresAt);

    recordAuditLog({
      userId: user.id,
      userName: user.full_name,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
    });

    // When SMTP is not configured in sandbox, expose one-time token in response for testing/recovery verification
    if (!process.env.SMTP_HOST) {
      resetCodePreview = rawCode;
    }
  }

  res.json({
    message:
      'If an active account matches that email, a password recovery token has been generated.',
    ...(resetCodePreview ? { recoveryTokenPreview: resetCodePreview } : {}),
  });
});

authRouter.post('/reset-password', async (req, res) => {
  const schema = z.object({
    token: z.string().min(8),
    newPassword: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid recovery token and password (8+ chars) are required.' });
    return;
  }

  const tokenHash = hashToken(parsed.data.token.trim());
  const row = db
    .prepare(`SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?`)
    .get(tokenHash) as
    | { id: number; user_id: number; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ error: 'Recovery token is invalid or has expired.' });
    return;
  }

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
  db.transaction(() => {
    db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(
      `UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`
    ).run(nextHash, row.user_id);
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?`).run(
      row.user_id
    );
  })();

  recordAuditLog({
    userId: row.user_id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: row.user_id,
    ipAddress: req.ip,
  });

  res.json({ message: 'Password has been reset. You may now sign in.' });
});
