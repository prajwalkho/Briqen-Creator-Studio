import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus, X } from 'lucide-react';
import { createAdminUser } from '../../services/adminService';
import type { AdminCanonicalRole } from '../../types/admin';
import type { UserProfile } from '../../types/studio';

interface AddUserModalProps {
  actorRole: AdminCanonicalRole;
  onClose: () => void;
  onCreated: (user: UserProfile, message: string) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ actorRole, onClose, onCreated }) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AdminCanonicalRole>('user');
  const [isVerified, setIsVerified] = useState(true);
  const [creditsBalance, setCreditsBalance] = useState(1000);
  const [country, setCountry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = actorRole === 'super_admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await createAdminUser({
        fullName: fullName.trim(),
        username: username.trim() || undefined,
        email: email.trim(),
        password,
        role,
        isVerified,
        creditsBalance,
        country: country.trim() || undefined,
      });
      onCreated(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Create New User Account
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Provision a user directly in Cloud SQL PostgreSQL
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="new-user-fullname"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Full Name
              </label>
              <input
                id="new-user-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Taylor"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-user-username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Username (optional)
              </label>
              <input
                id="new-user-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jordantaylor"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="new-user-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Email Address
            </label>
            <input
              id="new-user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan@company.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="new-user-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Initial Password
            </label>
            <div className="relative">
              <input
                id="new-user-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, number, symbol"
                className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="new-user-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Role
              </label>
              <select
                id="new-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as AdminCanonicalRole)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              >
                <option value="user">Regular User</option>
                {isSuperAdmin && <option value="admin">Admin</option>}
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-user-credits"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Credits
              </label>
              <input
                id="new-user-credits"
                type="number"
                min={0}
                value={creditsBalance}
                onChange={(e) => setCreditsBalance(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-user-country"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Country
              </label>
              <input
                id="new-user-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="United States"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-amber-500"
            />
            <span>Mark email address as verified immediately</span>
          </label>

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
              <span>Create Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
