import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { AuthSplitLayout } from '../components/auth/AuthSplitLayout';
import { useAuth } from '../context/AuthContext';
import { evaluatePasswordStrength, isValidEmail } from '../utils/passwordStrength';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    acceptTerms?: string;
  }>({});

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (fullName.trim().length < 2) {
      errors.fullName = 'Full name must be at least 2 characters.';
    }
    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!isValidEmail(email)) {
      errors.email = 'Enter a valid email address.';
    }
    if (!strength.valid) {
      errors.password = strength.errorMessage || 'Choose a stronger password.';
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!acceptTerms) {
      errors.acceptTerms = 'Please accept the Terms of Service and Privacy Policy.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await register({
        fullName: fullName.trim(),
        email: normalizedEmail,
        password,
        confirmPassword,
        acceptTerms,
      });

      navigate('/login', {
        replace: true,
        state: {
          prefillEmail: normalizedEmail,
          notice: result.message || 'Account created successfully. Please sign in to continue.',
        },
      });
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const strengthBarColors = [
    'bg-red-500',
    'bg-red-500',
    'bg-amber-500',
    'bg-blue-500',
    'bg-emerald-500',
  ];

  return (
    <AuthSplitLayout>
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Create your workspace
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Start scripting, generating scenes, and exporting videos.
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

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          <div className="space-y-1">
            <label
              htmlFor="reg-fullname"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Full name
            </label>
            <div className="relative">
              <UserIcon className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="reg-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: undefined }));
                }}
                placeholder="Alex Rivera"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
            </div>
            {fieldErrors.fullName && (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.fullName}</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="reg-email"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="alex@studio.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reg-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                placeholder="Create a strong password"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {password.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 grid grid-cols-4 gap-1">
                    {[0, 1, 2, 3].map((step) => (
                      <div
                        key={step}
                        className={`h-1 rounded-sm transition-colors ${
                          strength.score > step
                            ? strengthBarColors[strength.score]
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {strength.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { ok: strength.checks.minLength, label: '8+ characters' },
                    { ok: strength.checks.uppercase, label: 'Uppercase letter' },
                    { ok: strength.checks.lowercase, label: 'Lowercase letter' },
                    { ok: strength.checks.number, label: 'Number' },
                    { ok: strength.checks.special, label: 'Special character' },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className={`inline-flex items-center gap-1 ${
                        item.ok
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Check className={`h-3 w-3 ${item.ok ? 'opacity-100' : 'opacity-30'}`} />
                      <span>{item.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fieldErrors.password && (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="reg-confirm-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Confirm password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="reg-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                  }
                }}
                placeholder="Re-enter your password"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="space-y-1 pt-0.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => {
                  setAcceptTerms(e.target.checked);
                  if (fieldErrors.acceptTerms) {
                    setFieldErrors((p) => ({ ...p, acceptTerms: undefined }));
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090D16] text-amber-500 focus:ring-amber-500/40"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                I accept the{' '}
                <Link to="/terms" className="text-amber-600 dark:text-amber-400 underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-amber-600 dark:text-amber-400 underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {fieldErrors.acceptTerms && (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.acceptTerms}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 dark:text-slate-400 pt-1">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-amber-600 dark:text-amber-400 hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
};
