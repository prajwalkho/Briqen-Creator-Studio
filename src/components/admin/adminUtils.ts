import type { AdminCanonicalRole } from '../../types/admin';

export function normalizeRoleClient(raw?: string | null): AdminCanonicalRole {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'super_admin' || val === 'superadmin') return 'super_admin';
  if (val === 'admin' || val === 'moderator' || val === 'mod') return 'admin';
  return 'user';
}

export function formatRoleName(raw?: string | null): string {
  switch (normalizeRoleClient(raw)) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    default:
      return 'Regular User';
  }
}

export function formatAdminDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatAdminDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function roleBadgeClasses(role?: string | null): string {
  switch (normalizeRoleClient(role)) {
    case 'super_admin':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'admin':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    default:
      return 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300';
  }
}

export function statusDotClasses(status?: string | null): {
  dot: string;
  text: string;
  label: string;
} {
  const s = (status || 'active').toLowerCase();
  if (s === 'banned') {
    return {
      dot: 'bg-red-500',
      text: 'text-red-600 dark:text-red-400',
      label: 'Banned',
    };
  }
  if (s === 'suspended' || s === 'deactivated') {
    return {
      dot: 'bg-orange-500',
      text: 'text-orange-600 dark:text-orange-400',
      label: s === 'deactivated' ? 'Deactivated' : 'Suspended',
    };
  }
  if (s === 'deleted') {
    return {
      dot: 'bg-slate-400',
      text: 'text-slate-500 dark:text-slate-400',
      label: 'Deleted',
    };
  }
  return {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Active',
  };
}
