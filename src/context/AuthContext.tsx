import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setInMemoryToken } from '../lib/api';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
  primaryRole: string;
  permissions: string[];
  teacherId: number | null;
}

interface AcademicContextInfo {
  yearLabel: string;
  termName: string;
  schoolName: string;
  schoolLogoUrl: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  contextInfo: AcademicContextInfo;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (...perms: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  HEAD_TEACHER: 'Head Teacher',
  DOS: 'Director of Studies',
  CLASS_TEACHER: 'Class Teacher',
  SUBJECT_TEACHER: 'Subject Teacher',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextInfo, setContextInfo] = useState<AcademicContextInfo>({
    yearLabel: '2026',
    termName: 'Term II',
    schoolName: 'BUYANJA GRAMMAR SCHOOL',
    schoolLogoUrl: '/assets/aistudio/Bgs_logo_6081ecf0.png',
  });

  const loadAcademicContext = useCallback(async () => {
    try {
      const [yearsRes, settingsRes] = await Promise.all([
        api.get('/academics/years-terms'),
        api.get('/admin/settings'),
      ]);
      const activeYear = (yearsRes.data.years || []).find((y: { is_active: number }) => y.is_active === 1);
      const activeTerm = (yearsRes.data.terms || []).find((t: { is_active: number }) => t.is_active === 1);
      const s = settingsRes.data.settings || {};
      setContextInfo({
        yearLabel: activeYear?.year_label || '2026',
        termName: activeTerm?.name || 'Term II',
        schoolName: s.school_name || 'BUYANJA GRAMMAR SCHOOL',
        schoolLogoUrl: s.school_logo_url || '/assets/aistudio/Bgs_logo_6081ecf0.png',
      });
    } catch {
      // Fallback to defaults if unauthenticated
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get<{
          authenticated: boolean;
          accessToken?: string;
          user?: AuthUser;
        }>('/auth/session');
        if (mounted && res.data.authenticated && res.data.accessToken && res.data.user) {
          setInMemoryToken(res.data.accessToken);
          setUser(res.data.user);
          await loadAcademicContext();
        } else if (mounted) {
          setInMemoryToken(null);
          setUser(null);
        }
      } catch {
        setInMemoryToken(null);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadAcademicContext]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    });
    setInMemoryToken(res.data.accessToken);
    setUser(res.data.user);
    await loadAcademicContext();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setInMemoryToken(null);
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    const res = await api.get<{ user: AuthUser }>('/auth/me');
    setUser(res.data.user);
    await loadAcademicContext();
  };

  const hasPermission = useCallback(
    (...perms: string[]) => {
      if (!user) return false;
      if (user.roles.includes('SYSTEM_ADMIN')) return true;
      return perms.some((p) => user.permissions.includes(p));
    },
    [user]
  );

  const hasRole = useCallback(
    (...roles: string[]) => {
      if (!user) return false;
      return roles.some((r) => user.roles.includes(r));
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        contextInfo,
        login,
        logout,
        refreshProfile,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
