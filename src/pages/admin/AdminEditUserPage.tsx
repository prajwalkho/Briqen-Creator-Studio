import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { EditUserForm } from '../../components/admin/EditUserForm';
import { getAdminUserDetail } from '../../services/adminService';
import type { UserProfile } from '../../types/studio';

export const AdminEditUserPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    getAdminUserDetail(userId)
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load user.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <AdminLayout
      title="Edit User Account"
      subtitle={user ? `${user.fullName || user.email} · ${user.email}` : 'Loading account'}
      actions={
        userId ? (
          <Link
            to={`/admin/users/${userId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Profile</span>
          </Link>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading || !user ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <EditUserForm user={user} onUpdated={(updated) => setUser(updated)} />
      )}
    </AdminLayout>
  );
};
