import { db } from '../db.js';

export interface AuditLogInput {
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
}

export function recordAuditLog(entry: AuditLogInput): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs (
        user_id, user_name, user_role, action, entity_type, entity_id,
        previous_value, new_value, reason, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.userId ?? null,
      entry.userName ?? null,
      entry.userRole ?? null,
      entry.action,
      entry.entityType,
      entry.entityId !== undefined && entry.entityId !== null ? String(entry.entityId) : null,
      entry.previousValue !== undefined ? JSON.stringify(entry.previousValue) : null,
      entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      entry.reason ?? null,
      entry.ipAddress ?? null
    );
  } catch {
    // Audit logging should not crash read requests, though mutations remain transactional
  }
}

export function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  category?: string;
  link?: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, category, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.title,
    params.message,
    params.category || 'ACADEMIC',
    params.link || null
  );
}

export function notifyRoleUsers(
  roleCode: string,
  title: string,
  message: string,
  category = 'ACADEMIC',
  link?: string
): void {
  const users = db
    .prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = ? AND u.is_active = 1`
    )
    .all(roleCode) as Array<{ id: number }>;

  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, title, message, category, link)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const u of users) {
    stmt.run(u.id, title, message, category, link || null);
  }
}
