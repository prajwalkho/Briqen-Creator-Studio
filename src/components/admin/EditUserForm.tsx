import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { updateAdminUser, uploadAdminUserAvatar } from '../../services/adminService';
import type { UserProfile } from '../../types/studio';

interface EditUserFormProps {
  user: UserProfile;
  onUpdated: (updated: UserProfile, message: string) => void;
}

export const EditUserForm: React.FC<EditUserFormProps> = ({ user, onUpdated }) => {
  const [fullName, setFullName] = useState(user.fullName || user.displayName || '');
  const [username, setUsername] = useState(user.username || '');
  const [email, setEmail] = useState(user.email || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [bio, setBio] = useState(user.bio || '');
  const [country, setCountry] = useState(user.country || '');
  const [state, setState] = useState(user.state || '');
  const [city, setCity] = useState(user.city || '');
  const [website, setWebsite] = useState(user.website || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user.linkedinUrl || '');
  const [githubUrl, setGithubUrl] = useState(user.githubUrl || '');
  const [creditsBalance, setCreditsBalance] = useState<number>(user.creditsBalance ?? 1000);
  const [isVerified, setIsVerified] = useState<boolean>(Boolean(user.isVerified));
  const [accountStatus, setAccountStatus] = useState<'active' | 'suspended'>(
    user.accountStatus === 'suspended' ? 'suspended' : 'active'
  );

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload: Record<string, unknown> = {
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        bio: bio.trim(),
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
        website: website.trim(),
        linkedinUrl: linkedinUrl.trim(),
        githubUrl: githubUrl.trim(),
        creditsBalance,
        isVerified,
      };
      if (user.accountStatus !== 'banned' && user.accountStatus !== 'deleted') {
        payload.accountStatus = accountStatus;
      }

      const res = await updateAdminUser(user.id, payload);
      setNotice(res.message);
      onUpdated(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user account.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    setNotice(null);
    try {
      const res = await uploadAdminUserAvatar(user.id, file);
      setNotice(res.message);
      onUpdated(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateAdminUser(user.id, { removeAvatar: true });
      setNotice('Profile picture removed.');
      onUpdated(res.user, 'Profile picture removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Avatar control */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={fullName || user.email}
              className="h-14 w-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-display text-lg font-bold text-amber-700 dark:text-amber-300">
              {(fullName || user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Profile Picture</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              JPG, PNG, or WebP up to 5 MB (auto-resized to 512px WebP)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void handleAvatarChange(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploadingAvatar}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {uploadingAvatar ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            <span>Upload Photo</span>
          </button>
          {user.avatarUrl && (
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => void handleRemoveAvatar()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>

      {/* Personal & Account Information */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-4">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          Account & Personal Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-fullname" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Full Name
            </label>
            <input
              id="edit-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-username" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Username
            </label>
            <input
              id="edit-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <input
              id="edit-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Phone Number
            </label>
            <input
              id="edit-phone"
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-country" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Country
            </label>
            <input
              id="edit-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="edit-state" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                State
              </label>
              <input
                id="edit-state"
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-city" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                City
              </label>
              <input
                id="edit-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-bio" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Bio
          </label>
          <textarea
            id="edit-bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-website" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Website URL
            </label>
            <input
              id="edit-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-linkedin" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              LinkedIn URL
            </label>
            <input
              id="edit-linkedin"
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-github" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              GitHub URL
            </label>
            <input
              id="edit-github"
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="space-y-1.5">
            <label htmlFor="edit-credits" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Studio Credits Balance
            </label>
            <input
              id="edit-credits"
              type="number"
              min={0}
              value={creditsBalance}
              onChange={(e) => setCreditsBalance(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-status" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Account Status
            </label>
            <select
              id="edit-status"
              disabled={user.accountStatus === 'banned' || user.accountStatus === 'deleted'}
              value={accountStatus}
              onChange={(e) => setAccountStatus(e.target.value as 'active' | 'suspended')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm disabled:opacity-50"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-amber-500"
              />
              <span>Email verified</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span>Save Changes</span>
        </button>
      </div>
    </form>
  );
};
