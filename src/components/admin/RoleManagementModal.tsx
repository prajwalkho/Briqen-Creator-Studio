import React, { useState } from 'react';
import { AlertCircle, Loader2, Shield, X } from 'lucide-react';
import { updateAdminUserRole } from '../../services/adminService';
import type { AdminCanonicalRole } from '../../types/admin';
import type { UserProfile } from '../../types/studio';
import { formatRoleName, normalizeRoleClient } from './adminUtils';

interface RoleManagementModalProps {
  user: UserProfile;
  actorRole: AdminCanonicalRole;
  onClose: () => void;
  onSuccess: (updated: UserProfile, message: string) => void;
}

const ROLE_OPTIONS: Array<{
  value: AdminCanonicalRole;
  label: string;
  description: string;
}> = [
  {
    value: 'user',
    label: 'Regular User',
    description: 'Standard creator workspace access only.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Operational access to regular user accounts scoped by granular permissions.',
  },
  {
    value: 'super_admin',
    label: 'Super Admin (Platform Owner)',
    description: 'Unrestricted platform governance, Admin permissions, analytics, and permanent purge.',
  },
];

export const RoleManagementModal: React.FC<RoleManagementModalProps> = ({
  user,
  actorRole,
  onClose,
  onSuccess,
}) => {
  const [role, setRole] = useState<AdminCanonicalRole>(normalizeRoleClient(user.role));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = actorRole === 'super_admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await updateAdminUserRole(user.id, role);
      onSuccess(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Shield className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Manage Role & Privileges
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user.email} · Current: {formatRoleName(user.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            {ROLE_OPTIONS.map((opt) => {
              const disabled =
                !isSuperAdmin && (opt.value === 'admin' || opt.value === 'super_admin');
              const selected = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setRole(opt.value)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-left transition-colors ${
                    selected
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {opt.label}
                    </span>
                    {disabled && (
                      <span className="text-[11px] font-mono text-slate-500">Super Admin only</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Save Role</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
