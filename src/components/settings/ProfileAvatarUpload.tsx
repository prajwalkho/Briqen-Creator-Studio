import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, Trash2, Upload, X } from 'lucide-react';
import { removeProfileAvatar, uploadProfileAvatar } from '../../services/userService';
import { UserProfile } from '../../types/studio';

interface ProfileAvatarUploadProps {
  profile: UserProfile;
  onProfileUpdated: (user: UserProfile) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const ProfileAvatarUpload: React.FC<ProfileAvatarUploadProps> = ({
  profile,
  onProfileUpdated,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const displayName = profile.fullName || profile.displayName || 'Creator';
  const initials = (displayName || profile.email || 'B').trim().charAt(0).toUpperCase();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFilePicked = (file: File | null) => {
    setError(null);
    if (!file) return;

    if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
      setError('Unsupported file type. Please choose a JPG, JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image exceeds the 5 MB maximum file size.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextPreview);
  };

  const handleCancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveUpload = async () => {
    if (!selectedFile || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const res = await uploadProfileAvatar(selectedFile);
      onProfileUpdated(res.user);
      handleCancelPreview();
      onNotify('success', res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload profile picture.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await removeProfileAvatar();
      onProfileUpdated(res.user);
      setConfirmRemoveOpen(false);
      onNotify('success', res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove profile picture.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setRemoving(false);
    }
  };

  const activeImageSrc = previewUrl || profile.avatarUrl;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Profile Picture
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Upload a JPG, JPEG, PNG, or WebP photo up to 5 MB. Images are automatically resized, optimized, and stored securely.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          {activeImageSrc ? (
            <img
              src={activeImageSrc}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="h-24 w-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
            />
          ) : (
            <div className="h-24 w-24 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl font-display font-bold text-amber-700 dark:text-amber-300">
              {initials}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <input
            ref={fileInputRef}
            id="avatar-upload-input"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => handleFilePicked(e.target.files?.[0] || null)}
            className="sr-only"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <label
              htmlFor="avatar-upload-input"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>{profile.avatarUrl ? 'Choose New Photo' : 'Upload Photo'}</span>
            </label>

            {selectedFile && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void handleSaveUpload()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{uploading ? 'Optimizing...' : 'Save Photo'}</span>
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleCancelPreview}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Cancel</span>
                </button>
              </>
            )}

            {profile.avatarUrl && !selectedFile && (
              <button
                type="button"
                onClick={() => setConfirmRemoveOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Photo</span>
              </button>
            )}
          </div>

          {selectedFile ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Preview ready: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Accepted formats: JPG, JPEG, PNG, WebP · Maximum 5 MB · Automatically cropped to 512×512 WebP.
            </p>
          )}
        </div>
      </div>

      {confirmRemoveOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-avatar-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-6 space-y-4">
            <h4
              id="remove-avatar-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-white"
            >
              Remove profile picture?
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your custom avatar image will be removed from storage and your account will revert to your default initials avatar.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={removing}
                onClick={() => setConfirmRemoveOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => void handleConfirmRemove()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-60"
              >
                {removing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Remove Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
