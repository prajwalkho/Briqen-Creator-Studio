export interface PasswordCheckResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  checks: {
    minLength: boolean;
    lowercase: boolean;
    uppercase: boolean;
    number: boolean;
    special: boolean;
  };
  valid: boolean;
  errorMessage: string | null;
}

export function evaluatePasswordStrength(password: string): PasswordCheckResult {
  const checks = {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = Math.min(4, Math.max(0, passedCount - 1)) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<0 | 1 | 2 | 3 | 4, PasswordCheckResult['label']> = {
    0: 'Too weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };

  let errorMessage: string | null = null;
  if (!checks.minLength) {
    errorMessage = 'Password must be at least 8 characters long.';
  } else if (!checks.lowercase) {
    errorMessage = 'Include at least one lowercase letter.';
  } else if (!checks.uppercase) {
    errorMessage = 'Include at least one uppercase letter.';
  } else if (!checks.number) {
    errorMessage = 'Include at least one number.';
  } else if (!checks.special) {
    errorMessage = 'Include at least one special character.';
  }

  return {
    score,
    label: password.length === 0 ? 'Too weak' : labels[score],
    checks,
    valid: passedCount === 5 && password.length <= 128,
    errorMessage,
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
