import React, { useState } from 'react';
import { useAdultAuth } from '../../contexts/AdultAuthContext';

interface AdultAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'signup';
}

const AdultAuthModal: React.FC<AdultAuthModalProps> = ({ isOpen, onClose, defaultMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode);
  const [role, setRole] = useState<'user' | 'provider'>('user');
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

  if (!isOpen) return null;

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
      <div className="w-full max-w-md az-glass border border-[var(--az-border)] rounded-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white">✕</button>

        <h2 className="text-3xl font-serif italic text-white mb-6 text-center">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>

        {error && <p className="text-[var(--az-accent-primary)] text-sm mb-4 text-center">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setRole('user')}
                  className={`flex-grow py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${role === 'user' ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                >
                  Join as User
                </button>
                <button
                  type="button"
                  onClick={() => setRole('provider')}
                  className={`flex-grow py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${role === 'provider' ? 'bg-[var(--az-accent-gold)] text-black border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                >
                  Join as Provider
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Username"
                  required
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={role === 'provider' ? 'Stage Name' : 'Display Name'}
                  required
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
                  value={formData.displayName}
                  onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  required
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                  value={formData.dateOfBirth}
                  onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Country"
                  required
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
                  value={formData.country}
                  onChange={e => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </>
          )}

          <input
            type="email"
            placeholder="Email Address"
            required
            className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            required
            className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
          />

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
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
