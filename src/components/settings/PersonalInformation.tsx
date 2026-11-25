import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { resendEmailVerification, updatePersonalInfo } from '../../services/userService';
import { UserProfile } from '../../types/studio';
import { isValidEmail } from '../../utils/passwordStrength';

interface PersonalInformationProps {
  profile: UserProfile;
  onProfileUpdated: (user: UserProfile) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

interface FormState {
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  bio: string;
  country: string;
  state: string;
  city: string;
  website: string;
  linkedinUrl: string;
  githubUrl: string;
}

function buildInitialState(profile: UserProfile): FormState {
  return {
    fullName: profile.fullName || profile.displayName || '',
    username: profile.username || '',
    email: profile.email || '',
    phoneNumber: profile.phoneNumber || '',
    bio: profile.bio || '',
    country: profile.country || '',
    state: profile.state || '',
    city: profile.city || '',
    website: profile.website || '',
    linkedinUrl: profile.linkedinUrl || '',
    githubUrl: profile.githubUrl || '',
  };
}

function validateUrl(value: string, requiredHost?: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return false;
    if (requiredHost) {
      const h = parsed.hostname.toLowerCase();
      return h === requiredHost || h.endsWith(`.${requiredHost}`);
    }
    return true;
  } catch {
    return false;
  }
}

export const PersonalInformation: React.FC<PersonalInformationProps> = ({
  profile,
  onProfileUpdated,
  onNotify,
}) => {
  const [form, setForm] = useState<FormState>(() => buildInitialState(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setForm(buildInitialState(profile));
  }, [profile]);

  const setField = (key: keyof FormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.fullName.trim().length < 2) {
      next.fullName = 'Full name must be at least 2 characters.';
    }
    if (form.username.trim() && !/^[a-zA-Z0-9_.-]{3,32}$/.test(form.username.trim())) {
      next.username = 'Use 3–32 characters (letters, numbers, _, -, or .).';
    }
    if (!isValidEmail(form.email)) {
      next.email = 'Enter a valid email address.';
    }
    if (
      form.phoneNumber.trim() &&
      (!/^[+]?[0-9\s\-().]{7,20}$/.test(form.phoneNumber.trim()) ||
        form.phoneNumber.replace(/\D/g, '').length < 7)
    ) {
      next.phoneNumber = 'Enter a valid phone number (7–20 digits).';
    }
    if (form.bio.trim().length > 500) {
      next.bio = 'Bio must be 500 characters or fewer.';
    }
    if (!validateUrl(form.website)) {
      next.website = 'Enter a valid URL starting with https:// or http://.';
    }
    if (!validateUrl(form.linkedinUrl, 'linkedin.com')) {
      next.linkedinUrl = 'Enter a valid LinkedIn URL (https://linkedin.com/in/...).';
    }
    if (!validateUrl(form.githubUrl, 'github.com')) {
      next.githubUrl = 'Enter a valid GitHub URL (https://github.com/...).';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setServerError(null);
    setSuccessMsg(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const res = await updatePersonalInfo({
        fullName: form.fullName.trim(),
        username: form.username.trim() || null,
        email: form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim() || null,
        bio: form.bio.trim() || null,
        country: form.country.trim() || null,
        state: form.state.trim() || null,
        city: form.city.trim() || null,
        website: form.website.trim() || null,
        linkedinUrl: form.linkedinUrl.trim() || null,
        githubUrl: form.githubUrl.trim() || null,
      });
      onProfileUpdated(res.user);
      setSuccessMsg(res.message);
      onNotify('success', res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save personal information.';
      setServerError(msg);
      onNotify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(buildInitialState(profile));
    setErrors({});
    setServerError(null);
    setSuccessMsg(null);
  };

  const handleResendVerification = async () => {
    if (resending) return;
    setResending(true);
    try {
      const msg = await resendEmailVerification();
      setSuccessMsg(msg);
      onNotify('success', msg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not resend verification link.';
      onNotify('error', msg);
    } finally {
      setResending(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Personal Information
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Update your identity, contact details, location, and public links. Changing your email address requires verification before taking effect.
        </p>
      </div>

      {serverError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {(profile.pendingEmail || !profile.isVerified) && (
        <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <MailCheck className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {profile.pendingEmail
                ? `Email change to ${profile.pendingEmail} is awaiting verification. Check your verification link to confirm.`
                : 'Your current email address has not been verified yet.'}
            </span>
          </div>
          <button
            type="button"
            disabled={resending}
            onClick={() => void handleResendVerification()}
            className="px-3 py-1.5 rounded-md border border-amber-500/40 font-semibold hover:bg-amber-500/15 transition-colors whitespace-nowrap shrink-0"
          >
            {resending ? 'Sending...' : 'Resend Verification'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="pi-fullname"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Full Name
            </label>
            <input
              id="pi-fullname"
              type="text"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              placeholder="Alex Rivera"
              className={inputCls}
            />
            {errors.fullName && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pi-username"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Username (Optional)
            </label>
            <input
              id="pi-username"
              type="text"
              value={form.username}
              onChange={(e) => setField('username', e.target.value)}
              placeholder="alex.rivera"
              className={inputCls}
            />
            {errors.username && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.username}</p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="pi-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Email Address
            </label>
            <input
              id="pi-email"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="alex@studio.com"
              className={inputCls}
            />
            {errors.email && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pi-phone"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Phone Number (Optional)
            </label>
            <input
              id="pi-phone"
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setField('phoneNumber', e.target.value)}
              placeholder="+1 415 555 0199"
              className={inputCls}
            />
            {errors.phoneNumber && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.phoneNumber}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="pi-bio"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Bio / About Me (Optional)
            </label>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              {form.bio.length}/500
            </span>
          </div>
          <textarea
            id="pi-bio"
            rows={3}
            value={form.bio}
            onChange={(e) => setField('bio', e.target.value)}
            placeholder="Creative director producing launch videos and social campaigns."
            className={inputCls}
          />
          {errors.bio && <p className="text-xs text-red-600 dark:text-red-400">{errors.bio}</p>}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="pi-country"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Country
            </label>
            <input
              id="pi-country"
              type="text"
              value={form.country}
              onChange={(e) => setField('country', e.target.value)}
              placeholder="United States"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pi-state"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              State / Region
            </label>
            <input
              id="pi-state"
              type="text"
              value={form.state}
              onChange={(e) => setField('state', e.target.value)}
              placeholder="California"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pi-city"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              City
            </label>
            <input
              id="pi-city"
              type="text"
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
              placeholder="San Francisco"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/70">
          <div className="space-y-1.5">
            <label
              htmlFor="pi-website"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Website URL
            </label>
            <input
              id="pi-website"
              type="url"
              value={form.website}
              onChange={(e) => setField('website', e.target.value)}
              placeholder="https://yourstudio.com"
              className={inputCls}
            />
            {errors.website && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.website}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pi-linkedin"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              LinkedIn Profile
            </label>
            <input
              id="pi-linkedin"
              type="url"
              value={form.linkedinUrl}
              onChange={(e) => setField('linkedinUrl', e.target.value)}
              placeholder="https://linkedin.com/in/handle"
              className={inputCls}
            />
            {errors.linkedinUrl && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.linkedinUrl}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="pi-github"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              GitHub Profile
            </label>
            <input
              id="pi-github"
              type="url"
              value={form.githubUrl}
              onChange={(e) => setField('githubUrl', e.target.value)}
              placeholder="https://github.com/handle"
              className={inputCls}
            />
            {errors.githubUrl && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.githubUrl}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            disabled={saving}
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
