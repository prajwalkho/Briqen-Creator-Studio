import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyProfileBundle } from '../services/userService';
import { AccountManagement } from '../components/settings/AccountManagement';
import { ChangePassword } from '../components/settings/ChangePassword';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { PersonalInformation } from '../components/settings/PersonalInformation';
import { PreferencesSettings } from '../components/settings/PreferencesSettings';
import { ProfileAvatarUpload } from '../components/settings/ProfileAvatarUpload';
import { ProfileSettings } from '../components/settings/ProfileSettings';
import { SecuritySettings } from '../components/settings/SecuritySettings';
import { SettingsLayout, SettingsToast } from '../components/settings/SettingsLayout';
import { SETTINGS_NAV_ITEMS, SettingsSectionId } from '../components/settings/SettingsSidebar';

const VALID_SECTIONS = new Set<SettingsSectionId>(SETTINGS_NAV_ITEMS.map((item) => item.id));

function parseSectionParam(value: string | null): SettingsSectionId {
  if (value && VALID_SECTIONS.has(value as SettingsSectionId)) {
    return value as SettingsSectionId;
  }
  return 'profile';
}

export const SettingsPage: React.FC = () => {
  const { profile, setProfileState } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = parseSectionParam(searchParams.get('tab'));

  const [toast, setToast] = useState<SettingsToast | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(!profile);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ id: Date.now(), type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    void getMyProfileBundle()
      .then((bundle) => {
        if (active) {
          setProfileState(bundle.user);
        }
      })
      .catch(() => {
        // AuthContext already manages session validity
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [setProfileState]);

  const handleSelectSection = (section: SettingsSectionId) => {
    setSearchParams({ tab: section });
  };

  if (loadingProfile && !profile) {
    return (
      <SettingsLayout
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        toast={toast}
        onDismissToast={() => setToast(null)}
      >
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-4">
          <div className="h-16 w-16 rounded-xl animate-pulse bg-slate-100 dark:bg-slate-800" />
          <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      toast={toast}
      onDismissToast={() => setToast(null)}
    >
      {profile && activeSection === 'profile' && (
        <ProfileSettings profile={profile} onNavigateSection={handleSelectSection} />
      )}

      {profile && activeSection === 'personal' && (
        <PersonalInformation
          profile={profile}
          onProfileUpdated={setProfileState}
          onNotify={notify}
        />
      )}

      {profile && activeSection === 'avatar' && (
        <ProfileAvatarUpload
          profile={profile}
          onProfileUpdated={setProfileState}
          onNotify={notify}
        />
      )}

      {profile && activeSection === 'password' && (
        <ChangePassword
          profile={profile}
          onProfileUpdated={setProfileState}
          onNotify={notify}
        />
      )}

      {activeSection === 'security' && <SecuritySettings onNotify={notify} />}

      {activeSection === 'preferences' && <PreferencesSettings onNotify={notify} />}

      {activeSection === 'notifications' && <NotificationSettings onNotify={notify} />}

      {profile && activeSection === 'account' && (
        <AccountManagement
          profile={profile}
          onProfileUpdated={setProfileState}
          onNotify={notify}
        />
      )}
    </SettingsLayout>
  );
};
