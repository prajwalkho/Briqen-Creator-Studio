import React from 'react';
import type { AdminProjectItem } from '../../types/admin';
import { formatAdminDate } from './adminUtils';

interface UserProjectTableProps {
  projects: AdminProjectItem[];
}

export const UserProjectTable: React.FC<UserProjectTableProps> = ({ projects }) => {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          This user has not created any projects yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-3">Brand</th>
              <th className="py-3 px-3">Platform</th>
              <th className="py-3 px-3">Aspect</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                <td className="py-3 px-4">
                  <p className="font-semibold text-slate-900 dark:text-white">{p.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">
                    {p.description || p.targetAudience || 'No description'}
                  </p>
                </td>
                <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{p.brandName || '—'}</td>
                <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{p.platform}</td>
                <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                  {p.aspectRatio}
                </td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 capitalize text-[11px] text-slate-700 dark:text-slate-300">
                    {p.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {formatAdminDate(p.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
