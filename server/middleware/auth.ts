import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';

// Runtime-generated cryptographic fallbacks if env secrets are unset in preview
const FALLBACK_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');
const FALLBACK_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');

export function getAccessSecret(): string {
  return process.env.JWT_ACCESS_SECRET || FALLBACK_ACCESS_SECRET;
}

export function getRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || FALLBACK_REFRESH_SECRET;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
  primaryRole: string;
  permissions: string[];
  teacherId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      primaryRole: user.primaryRole,
      permissions: user.permissions,
      teacherId: user.teacherId,
    },
    getAccessSecret(),
    { expiresIn: '2h' }
  );
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ sub: userId, jti: crypto.randomUUID() }, getRefreshSecret(), {
    expiresIn: '7d',
  });
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function loadUserAuthContext(userId: number): AuthUser | null {
  const user = db
    .prepare(`SELECT id, full_name, email, is_active FROM users WHERE id = ?`)
    .get(userId) as
    | { id: number; full_name: string; email: string; is_active: number }
    | undefined;

  if (!user || !user.is_active) {
    return null;
  }

  const roleRows = db
    .prepare(
      `SELECT r.code FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .all(userId) as Array<{ code: string }>;

  const roles = roleRows.map((r) => r.code);
  const permRows = db
    .prepare(
      `SELECT DISTINCT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    )
    .all(userId) as Array<{ code: string }>;

  const teacher = db
    .prepare(`SELECT id FROM teachers WHERE user_id = ?`)
    .get(userId) as { id: number } | undefined;

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    roles,
    primaryRole: roles[0] || 'SUBJECT_TEACHER',
    permissions: permRows.map((p) => p.code),
    teacherId: teacher?.id ?? null,
  };
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = jwt.verify(token, getAccessSecret()) as unknown as {
      sub: number;
    };
    const context = loadUserAuthContext(payload.sub);
    if (!context) {
      res.status(401).json({ error: 'Account is inactive or no longer exists.' });
      return;
    }
    req.authUser = context;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

export function requirePermission(...requiredPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (user.roles.includes('SYSTEM_ADMIN')) {
      next();
      return;
    }
    const hasAny = requiredPerms.some((perm) => user.permissions.includes(perm));
    if (!hasAny) {
      res.status(403).json({
        error: 'Access denied. You do not have permission to perform this action.',
      });
      return;
    }
    next();
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const matches = user.roles.some((r) => allowedRoles.includes(r));
    if (!matches) {
      res.status(403).json({
        error: 'Access denied for your current role.',
      });
      return;
    }
    next();
  };
}

/**
 * Verifies whether a teacher is assigned to the requested subject/class/stream
 * in the relevant academic term. Admins, DOS, and Head Teachers have school-wide read scope.
 */
export function isTeacherAllocatedToSubject(params: {
  user: AuthUser;
  academicYearId: number;
  termId: number;
  classId: number;
  streamId: number;
  subjectId: number;
}): boolean {
  const { user, academicYearId, termId, classId, streamId, subjectId } = params;
  if (
    user.roles.includes('SYSTEM_ADMIN') ||
    user.roles.includes('DOS') ||
    user.roles.includes('HEAD_TEACHER')
  ) {
    return true;
  }
  if (!user.teacherId) {
    return false;
  }
  const row = db
    .prepare(
      `SELECT id FROM teacher_allocations
       WHERE teacher_id = ?
         AND academic_year_id = ?
         AND term_id = ?
         AND class_id = ?
         AND stream_id = ?
         AND subject_id = ?
         AND is_active = 1`
    )
    .get(user.teacherId, academicYearId, termId, classId, streamId, subjectId);

  return Boolean(row);
}

export function isClassTeacherForStream(params: {
  user: AuthUser;
  academicYearId: number;
  termId: number;
  classId: number;
  streamId: number;
}): boolean {
  const { user, academicYearId, termId, classId, streamId } = params;
  if (
    user.roles.includes('SYSTEM_ADMIN') ||
    user.roles.includes('DOS') ||
    user.roles.includes('HEAD_TEACHER')
  ) {
    return true;
  }
  if (!user.teacherId) {
    return false;
  }
  const row = db
    .prepare(
      `SELECT id FROM teacher_allocations
       WHERE teacher_id = ?
         AND academic_year_id = ?
         AND term_id = ?
         AND class_id = ?
         AND stream_id = ?
         AND is_class_teacher = 1
         AND is_active = 1`
    )
    .get(user.teacherId, academicYearId, termId, classId, streamId);

  return Boolean(row);
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie('bgs_refresh_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie('bgs_refresh_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/api/auth',
  });
}
