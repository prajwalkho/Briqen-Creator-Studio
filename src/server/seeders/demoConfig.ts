import { validatePasswordComplexity } from '../auth/security.ts';

export interface DemoConfig {
  isProduction: boolean;
  demoAccountsEnabled: boolean;
  demoLoginEnabled: boolean;
  demoPassword: string;
  passwordConfiguredInEnv: boolean;
}

function parseBoolEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

export function isDemoFlagExplicitlyTrue(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function getDemoConfig(): DemoConfig {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    return {
      isProduction: true,
      demoAccountsEnabled: false,
      demoLoginEnabled: false,
      demoPassword: '',
      passwordConfiguredInEnv: false,
    };
  }

  const demoAccountsEnabled = parseBoolEnv(process.env.ENABLE_DEMO_ACCOUNTS, true);
  const demoLoginEnabled = demoAccountsEnabled && parseBoolEnv(process.env.ENABLE_DEMO_LOGIN, true);
  const envPwd = (process.env.DEMO_ACCOUNT_PASSWORD || '').trim();

  return {
    isProduction: false,
    demoAccountsEnabled,
    demoLoginEnabled,
    demoPassword: envPwd || 'BriqenDemo@2026',
    passwordConfiguredInEnv: Boolean(envPwd),
  };
}

export function assertDemoSeedingAllowed(): DemoConfig {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Demo mode security guard: Demo account seeding and quick-login are strictly disabled when NODE_ENV=production.'
    );
  }

  const cfg = getDemoConfig();
  if (!cfg.demoAccountsEnabled) {
    throw new Error(
      'Demo account seeding is disabled (ENABLE_DEMO_ACCOUNTS=false).'
    );
  }

  const complexity = validatePasswordComplexity(cfg.demoPassword);
  if (!complexity.valid) {
    throw new Error(`Invalid DEMO_ACCOUNT_PASSWORD: ${complexity.reason}`);
  }

  return cfg;
}

export function assertDemoModeSafeOnStartup(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    (isDemoFlagExplicitlyTrue(process.env.ENABLE_DEMO_ACCOUNTS) ||
      isDemoFlagExplicitlyTrue(process.env.ENABLE_DEMO_LOGIN))
  ) {
    throw new Error(
      'Fatal configuration error: ENABLE_DEMO_ACCOUNTS and ENABLE_DEMO_LOGIN must not be enabled in production.'
    );
  }
}

export interface DemoQuickLoginOption {
  label: string;
  role: 'super_admin' | 'admin' | 'user';
  email: string;
  password: string;
  description: string;
}

export function getDemoQuickLoginOptions(): DemoQuickLoginOption[] {
  const cfg = getDemoConfig();
  if (cfg.isProduction || !cfg.demoLoginEnabled) {
    return [];
  }
  return [
    {
      label: 'Super Admin Demo',
      role: 'super_admin',
      email: 'superadmin1@briqen.demo',
      password: cfg.demoPassword,
      description: 'Full platform control, role management, permanent deletion & audit logs',
    },
    {
      label: 'Admin Demo',
      role: 'admin',
      email: 'admin1@briqen.demo',
      password: cfg.demoPassword,
      description: 'Manage regular users, bans, projects, scripts, scenes & AI inspection',
    },
    {
      label: 'Regular User Demo',
      role: 'user',
      email: 'user1@briqen.demo',
      password: cfg.demoPassword,
      description: 'Standard creator workspace with demo projects, scripts & mock assets',
    },
  ];
}
