import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';
import type { AdminUserGenerationsResponse } from '../../types/admin';
import { formatAdminDateTime, formatFileSize } from './adminUtils';

interface UserGenerationHistoryProps {
  data: AdminUserGenerationsResponse;
}

export const UserGenerationHistory: React.FC<UserGenerationHistoryProps> = ({ data }) => {
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Deliberate AI Generation Actions + Technical Retry Attempts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Deliberate AI Generation Actions ({data.actions.length})
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Expand an action to inspect underlying technical worker retry attempts
          </span>
        </div>

        {data.actions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No AI media generation actions recorded for this user.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] divide-y divide-slate-100 dark:divide-slate-800/80">
            {data.actions.map((action) => {
              const expanded = expandedActionId === action.id;
              return (
                <div key={action.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[11px] uppercase text-amber-700 dark:text-amber-300">
                          {action.mediaType}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {action.projectTitle || 'Untitled Project'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {action.provider} · {action.model}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${
                            action.status === 'completed'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : action.status === 'failed'
                              ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {action.status}
                        </span>
                        {action.retryCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 tabular-nums">
                            <RefreshCw className="h-3 w-3" />
                            <span>{action.retryCount} retries</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {action.prompt}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {formatAdminDateTime(action.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedActionId((prev) => (prev === action.id ? null : action.id))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span>{action.attempts.length} attempts</span>
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] p-3 space-y-2">
                      {action.job && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
                          <span>
                            Job ID: <code className="font-mono">{action.job.id}</code>
                          </span>
                          <span>Status: {action.job.status}</span>
                          <span className="tabular-nums">Progress: {action.job.progress}%</span>
                          {action.job.errorMessage && (
                            <span className="text-red-600 dark:text-red-400">
                              Error: {action.job.errorMessage}
                            </span>
                          )}
                        </div>
                      )}

                      {action.attempts.length === 0 ? (
                        <p className="text-[11px] text-slate-500">No attempt records logged.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {action.attempts.map((attempt) => (
                            <div
                              key={attempt.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-md bg-white dark:bg-[#13161E] border border-slate-200 dark:border-slate-800"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold tabular-nums">
                                  Attempt #{attempt.attemptNumber}
                                </span>
                                <span
                                  className={
                                    attempt.status === 'completed'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }
                                >
                                  {attempt.status}
                                </span>
                                {attempt.errorMessage && (
                                  <span className="text-red-500">{attempt.errorMessage}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-slate-400 tabular-nums">
                                {attempt.durationMs != null && <span>{attempt.durationMs} ms</span>}
                                <span>{formatAdminDateTime(attempt.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rendered Exports */}
      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          Rendered Video Exports ({data.exports.length})
        </h3>
        {data.exports.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No exported renders recorded for this user.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Export Title</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Resolution</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {data.exports.map((exp) => (
                  <tr key={exp.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                      {exp.title}
                    </td>
                    <td className="py-2.5 px-3 font-mono uppercase">{exp.format}</td>
                    <td className="py-2.5 px-3 font-mono">{exp.resolution}</td>
                    <td className="py-2.5 px-3 tabular-nums">{exp.totalDurationSec}s</td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {formatFileSize(exp.fileSizeBytes)}
                    </td>
                    <td className="py-2.5 px-3 capitalize">{exp.status}</td>
                    <td className="py-2.5 px-4 text-right">
                      {exp.downloadUrl ? (
                        <a
                          href={exp.downloadUrl}
                          download
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
