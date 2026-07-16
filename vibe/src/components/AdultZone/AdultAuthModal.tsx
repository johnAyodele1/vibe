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
    firstName: '',
    dateOfBirth: '',
    gender: 'Female'
  });
  const [error, setError] = useState('');
  const { login, signup } = useAdultAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login({ email: formData.email, password: formData.password });
      } else {
        await signup({ ...formData, role });
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
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

              <input
                type="text"
                placeholder="First Name"
                required
                className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  required
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                  value={formData.dateOfBirth}
                  onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                />
                <select
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                  value={formData.gender}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Trans">Trans</option>
                  <option value="Other">Other</option>
                </select>
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
            className="w-full py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {mode === 'login' ? 'Login' : 'Sign Up'}
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
