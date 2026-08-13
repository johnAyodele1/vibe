import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import { PushNotificationTestCard } from '../Settings/PushNotificationTestCard';
import { LocationSelect } from './LocationSelect';

const UserSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken');

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState<any>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Deactivate state
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    fetchProfile();
  }, [token]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/profiles/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDisplayName(data.data.displayName || '');
        setBio(data.data.bio || '');
        setLocation(data.data.location || {});
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/profiles/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName, bio, location }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Profile updated successfully');
      } else {
        toast.error(data.message || 'Failed to update profile');
      }
    } catch (err) {
      toast.error('Network error updating profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.message || 'Failed to change password');
      }
    } catch (err) {
      toast.error('Network error changing password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (confirmText !== CONFIRM_PHRASE) {
      toast.error(`Type "${CONFIRM_PHRASE}" to confirm`);
      return;
    }

    setDeactivateLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/auth/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        toast.success('Account deactivated successfully');
        logout();
        navigate('/');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to deactivate account');
      }
    } catch (err) {
      toast.error('Network error deactivating account');
    } finally {
      setDeactivateLoading(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white flex items-center justify-center font-sans">
        <p className="text-sm text-[var(--az-text-secondary)]">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl font-serif italic text-white tracking-wide">Account Configurations</h1>
          <p className="text-xs text-[var(--az-text-secondary)] mt-1">Configure your personal profile, alert settings, and security.</p>
        </div>

        {/* 1. Profile Section */}
        <div className="settings-section">
          <h3 className="settings-section__title">Personal Profile</h3>
          <p className="settings-section__desc">Manage how you appear to others in the Adult Zone.</p>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="settings-field">
              <label className="settings-label">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="settings-input"
                placeholder="Enter display name"
                required
              />
            </div>

            <div className="settings-field">
              <label className="settings-label">Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                className="settings-input h-24 py-3 resize-none"
                placeholder="Tell us a bit about yourself..."
                maxLength={500}
              />
            </div>

            <LocationSelect value={location} onChange={setLocation} />

            <button
              type="submit"
              disabled={savingProfile || !displayName}
              className="settings-save-btn mt-4"
            >
              {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        {/* 2. Notification Settings */}
        <div className="settings-section" id="push-test-section">
          <h3 className="settings-section__title">Notification Settings</h3>
          <p className="settings-section__desc">Manage and test your device's push notifications.</p>
          <PushNotificationTestCard />
        </div>

        {/* 3. Account Security (Change Password) */}
        <div className="settings-section">
          <h3 className="settings-section__title">Account Security</h3>
          <p className="settings-section__desc">Change your account password below.</p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="settings-field">
              <label className="settings-label">Current Password</label>
              <div className="settings-input-wrapper">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  className="settings-input-eye"
                  onClick={() => setShowCurrent(!showCurrent)}
                >
                  {showCurrent ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">New Password</label>
              <div className="settings-input-wrapper">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Min. 8 characters"
                  required
                />
                <button
                  type="button"
                  className="settings-input-eye"
                  onClick={() => setShowNew(!showNew)}
                >
                  {showNew ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="settings-input"
                placeholder="Repeat new password"
                required
              />
            </div>

            <button
              type="submit"
              className="settings-save-btn"
              disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordLoading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* 4. Danger Zone (Deactivate Account) */}
        <div className="settings-section settings-section--danger">
          <h3 className="settings-section__title">Deactivate Account</h3>
          <p className="settings-section__desc">
            Your account will be deactivated. Your profile will be hidden from other users.
            You can reactivate by logging in again.
          </p>

          {!showConfirmDeactivate ? (
            <button
              type="button"
              className="settings-danger-btn"
              onClick={() => setShowConfirmDeactivate(true)}
            >
              Deactivate My Account
            </button>
          ) : (
            <div className="deactivate-confirm">
              <p className="deactivate-confirm__instruction">
                Type <strong>{CONFIRM_PHRASE}</strong> to confirm:
              </p>
              <input
                className="settings-input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                placeholder={CONFIRM_PHRASE}
              />
              <div className="deactivate-confirm__actions">
                <button
                  type="button"
                  className="settings-danger-btn"
                  onClick={handleDeactivate}
                  disabled={deactivateLoading || confirmText !== CONFIRM_PHRASE}
                >
                  {deactivateLoading ? 'Deactivating...' : 'Yes, Deactivate'}
                </button>
                <button
                  type="button"
                  className="settings-cancel-btn"
                  onClick={() => { setShowConfirmDeactivate(false); setConfirmText(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
