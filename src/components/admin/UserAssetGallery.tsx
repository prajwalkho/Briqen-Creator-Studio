import React from 'react';
import { Download, FileAudio, Film, Image as ImageIcon } from 'lucide-react';
import type { AdminAssetItem } from '../../types/admin';
import { formatAdminDate, formatFileSize } from './adminUtils';

interface UserAssetGalleryProps {
  assets: AdminAssetItem[];
}

export const UserAssetGallery: React.FC<UserAssetGalleryProps> = ({ assets }) => {
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          No media assets stored for this user.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {assets.map((asset) => {
        const isMock = Boolean(
          asset.metadataJson &&
            (asset.metadataJson.demoAsset === true || asset.metadataJson.mock === true)
        );
        return (
          <div
            key={asset.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden flex flex-col"
          >
            <div className="aspect-video bg-slate-100 dark:bg-[#0B0D12] relative flex items-center justify-center overflow-hidden">
              {asset.assetType === 'image' ? (
                <img
                  src={asset.signedUrl}
                  alt={asset.fileName}
                  className="w-full h-full object-cover"
                />
              ) : asset.assetType === 'video' ? (
                <video
                  src={asset.signedUrl}
                  controls
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="p-4 w-full flex flex-col items-center gap-3">
                  <FileAudio className="h-8 w-8 text-amber-500" />
                  <audio src={asset.signedUrl} controls className="w-full h-8" />
                </div>
              )}

              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/70 text-white font-mono text-[10px] uppercase inline-flex items-center gap-1">
                {asset.assetType === 'image' ? (
                  <ImageIcon className="h-3 w-3" />
                ) : asset.assetType === 'video' ? (
                  <Film className="h-3 w-3" />
                ) : (
                  <FileAudio className="h-3 w-3" />
                )}
                <span>{asset.assetType}</span>
              </span>

              {isMock && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-violet-600/90 text-white font-mono text-[10px]">
                  Demo / Mock
                </span>
              )}
            </div>

            <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {asset.fileName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {asset.projectTitle || 'Project Asset'} · {asset.provider}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                  {formatFileSize(asset.fileSizeBytes)} · {formatAdminDate(asset.createdAt)}
                </span>
                <a
                  href={asset.downloadUrl}
                  download={asset.fileName}
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  <Download className="h-3 w-3" />
                  <span>File</span>
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
