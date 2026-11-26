import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { UserPreferences, UserProfile } from '../types/studio';
import {
  type DemoQuickLoginOption,
  fetchCurrentUser,
  getAccessToken,
  getAuthConfig,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  setAccessToken,
  setOnUnauthorizedHandler,
} from '../services/authService';
import {
  getPreferences,
  updatePreferences as apiUpdatePreferences,
} from '../services/userService';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  isAuthenticated: boolean;
  loading: boolean;
  googleOAuthEnabled: boolean;
  demoLoginEnabled: boolean;
  demoAccounts: DemoQuickLoginOption[];
  themePreference: 'light' | 'dark' | 'system';
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setThemePreference: (mode: 'light' | 'dark' | 'system') => Promise<void>;
  updatePreferences: (
    patch: Partial<
      Pick<
        UserPreferences,
        'theme' | 'language' | 'timezone' | 'defaultAspectRatio' | 'defaultExportQuality'
      >
    >
  ) => Promise<UserPreferences>;
  setProfileState: (user: UserProfile | null) => void;
  clearAuthState: () => Promise<void>;
  login: (email: string, password: string, rememberMe: boolean) => Promise<UserProfile>;
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
  }) => Promise<{ user: UserProfile; message: string; requiresVerification: boolean }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveThemeMode(mode: 'light' | 'dark' | 'system'): 'dark' | 'light' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(true);
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoQuickLoginOption[]>([]);
  const [themePreference, setThemePreferenceState] = useState<'light' | 'dark' | 'system'>('dark');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const apply = () => {
      const resolved = resolveThemeMode(themePreference);
      setTheme(resolved);
      const root = document.documentElement;
      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    apply();

    if (themePreference !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePreference]);

  const loadUserPreferences = useCallback(async () => {
    if (!getAccessToken() && !auth.currentUser) return;
    try {
      const prefs = await getPreferences();
      setPreferences(prefs);
      if (prefs.theme === 'light' || prefs.theme === 'dark' || prefs.theme === 'system') {
        setThemePreferenceState(prefs.theme);
      }
    } catch {
      // Keep current theme if preferences fail to load
    }
  }, []);

  const updatePreferences = useCallback(
    async (
      patch: Partial<
        Pick<
          UserPreferences,
          'theme' | 'language' | 'timezone' | 'defaultAspectRatio' | 'defaultExportQuality'
        >
      >
    ) => {
      const res = await apiUpdatePreferences(patch);
      setPreferences(res.preferences);
      if (
        res.preferences.theme === 'light' ||
        res.preferences.theme === 'dark' ||
        res.preferences.theme === 'system'
      ) {
        setThemePreferenceState(res.preferences.theme);
      }
      return res.preferences;
    },
    []
  );

  const setThemePreference = useCallback(
    async (mode: 'light' | 'dark' | 'system') => {
      setThemePreferenceState(mode);
      if (getAccessToken() || auth.currentUser) {
        try {
          const res = await apiUpdatePreferences({ theme: mode });
          setPreferences(res.preferences);
        } catch {
          // ignore network error; local UI state stays responsive
        }
      }
    },
    []
  );

  const toggleTheme = useCallback(() => {
    const nextMode: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    void setThemePreference(nextMode);
  }, [theme, setThemePreference]);

  const refreshProfile = useCallback(async () => {
    if (!getAccessToken() && !auth.currentUser) {
      setProfile(null);
      setPreferences(null);
      return;
    }
    try {
      const user = await fetchCurrentUser();
      setProfile(user);
      await loadUserPreferences();
    } catch (err) {
      console.error('Failed to sync user profile:', err);
    }
  }, [loadUserPreferences]);

  useEffect(() => {
    setOnUnauthorizedHandler(() => {
      if (!auth.currentUser) {
        setProfile(null);
        setPreferences(null);
      }
    });
    return () => setOnUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let active = true;
    let firebaseResolved = false;
    let jwtResolved = false;

    const maybeFinishLoading = () => {
      if (active && firebaseResolved && jwtResolved) {
        setLoading(false);
      }
    };

    void getAuthConfig()
      .then((cfg) => {
        if (active) {
          setGoogleOAuthEnabled(cfg.googleOAuthEnabled);
          setDemoLoginEnabled(Boolean(cfg.demoLoginEnabled));
          setDemoAccounts(Array.isArray(cfg.demoAccounts) ? cfg.demoAccounts : []);
        }
      })
      .catch(() => {
        // default stays safe if config request fails
      });

    // Silently restore password-based session from HttpOnly refresh cookie
    void refreshSession()
      .then(async (session) => {
        if (!active) return;
        if (session?.user) {
          setProfile(session.user);
          await loadUserPreferences();
        }
      })
      .finally(() => {
        jwtResolved = true;
        maybeFinishLoading();
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      setFirebaseUser(user);
      if (user) {
        try {
          const synced = await fetchCurrentUser();
          if (active) {
            setProfile(synced);
            await loadUserPreferences();
          }
        } catch (err) {
          console.error('Auth profile sync error:', err);
        }
      } else if (!getAccessToken()) {
        setProfile(null);
        setPreferences(null);
      }
      firebaseResolved = true;
      maybeFinishLoading();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadUserPreferences]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const session = await loginUser({ email, password, rememberMe });
      setProfile(session.user);
      await loadUserPreferences();
      return session.user;
    },
    [loadUserPreferences]
  );

  const register = useCallback(
    async (payload: {
      fullName: string;
      email: string;
      password: string;
      confirmPassword: string;
      acceptTerms: boolean;
    }) => {
      return registerUser(payload);
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    setAccessToken(null);
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const clearAuthState = useCallback(async () => {
    setAccessToken(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setFirebaseUser(null);
    setProfile(null);
    setPreferences(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    if (auth.currentUser) {
      await signOut(auth);
    }
    setFirebaseUser(null);
    setProfile(null);
    setPreferences(null);
  }, []);

  const isAuthenticated = Boolean(profile || firebaseUser);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        preferences,
        isAuthenticated,
        loading,
        googleOAuthEnabled,
        demoLoginEnabled,
        demoAccounts,
        themePreference,
        theme,
        toggleTheme,
        setThemePreference,
        updatePreferences,
        setProfileState: setProfile,
        clearAuthState,
        login,
        register,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
