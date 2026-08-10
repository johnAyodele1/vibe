import React, { useState } from 'react';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { useCountries } from '../../hooks/useLocation';
import { CustomSelect } from './CustomSelect';

interface AdultAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'signup';
  defaultRole?: 'user' | 'provider';
}

const AdultAuthModal: React.FC<AdultAuthModalProps> = ({ isOpen, onClose, defaultMode = 'login', defaultRole = 'user' }) => {
  const [mode, setMode] = React.useState<'login' | 'signup'>(defaultMode);
  const [role, setRole] = React.useState<'user' | 'provider'>(defaultRole);

  // Sync mode and role whenever defaultMode or defaultRole changes, or when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setRole(defaultRole);
    }
  }, [isOpen, defaultMode, defaultRole]);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    displayName: '',
    dateOfBirth: '',
    country: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAdultAuth();
  const { data: countries } = useCountries();

  if (!isOpen) return null;

  const checkPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', colorClass: '' };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score === 1) return { score: 1, label: 'weak', colorClass: 'bg-red-500 w-1/4' };
    if (score === 2) return { score: 2, label: 'fair', colorClass: 'bg-orange-500 w-2/4' };
    if (score === 3) return { score: 3, label: 'strong', colorClass: 'bg-yellow-500 w-3/4' };
    if (score >= 4) return { score: 4, label: 'great', colorClass: 'bg-green-500 w-full' };
    return { score: 0, label: 'weak', colorClass: 'bg-red-500 w-[5%]' };
  };

  const strength = checkPasswordStrength(formData.password);

  const countryOptions = Array.isArray(countries)
    ? countries.map(c => ({ value: c.name, label: `${c.flag || ''} ${c.name}` }))
    : [
        { value: 'United Kingdom', label: '🇬🇧 United Kingdom' },
        { value: 'United States', label: '🇺🇸 United States' },
        { value: 'Nigeria', label: '🇳🇬 Nigeria' }
      ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let loggedUser = null;
      if (mode === 'login') {
        loggedUser = await login({ email: formData.email, password: formData.password });
      } else {
        loggedUser = await signup({ ...formData, role });
      }
      onClose();
      // Role-based post login redirection logic
      const targetRole = loggedUser?.role || role;
      if (targetRole === 'provider') {
        window.location.href = '/adult/provider/onboarding';
      } else {
        window.location.href = '/';
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <div className="w-full max-w-md az-glass border border-[var(--az-border)] rounded-2xl p-5 sm:p-6 relative max-h-[90vh] overflow-y-auto no-scrollbar">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white z-10">✕</button>

        <h2 className="text-2xl sm:text-3xl font-serif italic text-white mb-4 text-center">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>

        {error && <p className="text-[var(--az-accent-primary)] text-sm mb-3 text-center">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <>
              {/* Account type selector */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRole('user')}
                  className={`flex-grow py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${role === 'user' ? 'bg-[var(--az-accent-primary)] text-white border-transparent shadow-[0_2px_12px_rgba(200,16,46,0.3)]' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                >
                  Join as User
                </button>
                <button
                  type="button"
                  onClick={() => setRole('provider')}
                  className={`flex-grow py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${role === 'provider' ? 'bg-[var(--az-accent-gold)] text-black border-transparent shadow-[0_2px_12px_rgba(234,179,8,0.3)]' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                >
                  Join as Provider
                </button>
              </div>

              {/* Username + Display Name grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Username block */}
                <div className="flex flex-col gap-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Username</label>
                  <input
                    type="text"
                    placeholder="Your username"
                    required
                    className="w-full h-[46px] bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-3.5 text-white focus:border-[var(--az-accent-rose)] outline-none box-border text-sm"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                {/* Display / Stage Name block */}
                <div className="flex flex-col gap-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">
                    {role === 'provider' ? 'Stage Name' : 'Display Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={role === 'provider' ? 'Your stage name' : 'Your screen name'}
                    required
                    className="w-full h-[46px] bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-3.5 text-white focus:border-[var(--az-accent-rose)] outline-none box-border text-sm"
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
              </div>

              {/* Date of Birth + Country grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date of Birth block */}
                <div className="flex flex-col gap-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Date of Birth</label>
                  <input
                    type="date"
                    required
                    className="w-full h-[46px] bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-3.5 text-white outline-none box-border text-sm"
                    value={formData.dateOfBirth}
                    onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </div>

                {/* Country block */}
                <div className="flex flex-col gap-1 justify-end">
                  <CustomSelect
                    label="Country"
                    value={formData.country || null}
                    options={countryOptions}
                    onSelect={(val) => setFormData({ ...formData, country: val })}
                    placeholder="Select country"
                  />
                </div>
              </div>
            </>
          )}

          {/* Email block */}
          <div className="flex flex-col gap-1">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Email Address</label>
            <input
              type="email"
              placeholder="your@email.com"
              required
              className="w-full h-[46px] bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-3.5 text-white focus:border-[var(--az-accent-rose)] outline-none box-border text-sm"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          {/* Password block */}
          <div className="flex flex-col gap-1">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Password</label>
            <div className="relative w-full">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                required
                className="w-full h-[46px] bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl pl-3.5 pr-12 text-white focus:border-[var(--az-accent-rose)] outline-none box-border text-sm"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-white/50 hover:text-white"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {mode === 'signup' && formData.password && (
              <div className="flex items-center gap-3 mt-1 animate-fadeIn">
                <div className="flex-1 bg-white/5 h-1 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength.colorClass}`} />
                </div>
                <span className="text-[10px] font-bold text-[var(--az-text-secondary)] uppercase font-sans">
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Submit Button block */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full h-[50px] bg-gradient-to-r from-[var(--az-accent-primary)] to-red-700 hover:brightness-110 active:scale-[0.98] text-white font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_6px_24px_rgba(200,16,46,0.35)] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              mode === 'login' ? 'Login' : 'Sign Up'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--az-text-secondary)]">
          {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="ml-2 text-[var(--az-accent-rose)] font-bold hover:underline"
          >
            {mode === 'login' ? 'Create one' : 'Login instead'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AdultAuthModal;
