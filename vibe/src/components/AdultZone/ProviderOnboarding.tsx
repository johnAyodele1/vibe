import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import LocationSelect from './LocationSelect';
import { toast } from 'sonner';
import { useOnboardingStore } from './useOnboardingStore';

const ProviderOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken');

  const {
    currentStep: step,
    completedSteps,
    setCurrentStep: setStep,
    setCompletedSteps,
    setIsComplete,
    setStepData,
  } = useOnboardingStore();

  const [profileData, setProfileData] = useState({
    bio: '',
    gender: 'female',
    dateOfBirth: '',
  });

  // DOB Dropdowns State
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  const [dobDay, setDobDay] = useState<number>(1);
  const [dobMonth, setDobMonth] = useState<number>(1);
  const [dobYear, setDobYear] = useState<number>(currentYear - 18);
  const [dobError, setDobError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [videoPreview, setVideoPreview] = useState<string>('');
  const [services, setServices] = useState<string[]>(['live_cam']);
  const [pricing, setPricing] = useState({
    pricePerMinute: 3.99,
    tonightRate: 150,
    chargeForMedia: false,
    pricePerPhoto: 10,
    pricePerVideo: 25,
  });

  const [tipMenu, setTipMenu] = useState<{ amount: number; action: string }[]>([
    { amount: 50, action: 'Send an exclusive photo' },
    { amount: 100, action: 'Special shoutout' },
  ]);

  const [locationValue, setLocationValue] = useState<any>({});
  const [coverageArea, setCoverageArea] = useState('My city only');

  const [payoutMethod, setPayoutMethod] = useState('bank');
  const [payoutDetails, setPayoutDetails] = useState({
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    routingCode: '',
    accountType: 'Checking',
    paypalEmail: '',
    cryptoCurrency: 'USDT',
    cryptoAddress: '',
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Suggested values for calculation
  const [calcMinutes, setCalcMinutes] = useState(30);

  // DOB validation effect
  useEffect(() => {
    if (dobDay && dobMonth && dobYear) {
      const dobStr = `${dobYear}-${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}`;
      const dob = new Date(dobStr);
      const ageDiff = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiff);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (dob.getTime() > Date.now()) {
        setDobError('Date of birth cannot be in the future');
      } else if (age < 18) {
        setDobError('Must be 18 years or older');
      } else {
        setDobError(null);
      }
      setProfileData(prev => ({ ...prev, dateOfBirth: dobStr }));
    }
  }, [dobDay, dobMonth, dobYear]);

  // Fetch onboarding progress on mount to pre-populate form
  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    if (user && user.role !== 'provider') {
      navigate('/');
      return;
    }

    const fetchOnboardingProgress = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/onboarding`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const resJson = await res.json();
        if (resJson.success) {
          const data = resJson.data || resJson;
          setStep(data.currentStep);
          setCompletedSteps(data.completedSteps);
          setIsComplete(data.isComplete);

          // Populate local states
          if (data.stepData[1]) {
            const s1 = data.stepData[1];
            setProfileData(s1);
            if (s1.dateOfBirth) {
              const parts = s1.dateOfBirth.split('-');
              if (parts.length === 3) {
                setDobYear(parseInt(parts[0]));
                setDobMonth(parseInt(parts[1]));
                setDobDay(parseInt(parts[2]));
              }
            }
          }
          if (data.stepData[2]) {
            setPhotos(data.stepData[2].photos || []);
            setVideoPreview(data.stepData[2].videoPreview || '');
          }
          if (data.stepData[3]) {
            setServices(data.stepData[3].servicesOffered || []);
          }
          if (data.stepData[4]) {
            const s4 = data.stepData[4];
            setPricing(prev => ({
              ...prev,
              pricePerMinute: s4.pricing?.perMinuteRate || 3.99,
              tonightRate: s4.pricing?.tonightRate || 150,
            }));
            setTipMenu(s4.tipMenu || []);
          }
          if (data.stepData[5]) {
            setLocationValue(data.stepData[5].location || {});
            const dbArea = data.stepData[5].coverageArea || 'city';
            setCoverageArea(dbArea === 'city' ? 'My city only' : dbArea === 'state' ? 'My state/region' : 'Anywhere');
          }
          if (data.stepData[6]) {
            setPayoutMethod(data.stepData[6].payoutMethod || 'bank');
            const details = data.stepData[6].payoutDetails || {};
            setPayoutDetails({
              bankName: details.bankName || '',
              accountHolderName: details.accountHolder || details.accountHolderName || '',
              accountNumber: details.accountNumber || '',
              routingCode: details.routingNumber || details.routingCode || '',
              accountType: details.accountType ? (details.accountType.charAt(0).toUpperCase() + details.accountType.slice(1)) : 'Checking',
              paypalEmail: details.paypalEmail || '',
              cryptoCurrency: details.currency || 'USDT',
              cryptoAddress: details.address || '',
            });
          }

          if (data.isComplete && window.location.pathname.includes('onboarding')) {
            setStep(7);
          }
        } else {
          throw new Error();
        }
      } catch (err) {
        console.error('Error fetching onboarding progress, trying local storage:', err);
        const backupStr = localStorage.getItem('az_provider_onboarding');
        if (backupStr) {
          try {
            const backup = JSON.parse(backupStr);
            const ageInMs = Date.now() - backup.savedAt;
            const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
            if (ageInMs < sevenDaysInMs) {
              setStep(backup.currentStep);
              setCompletedSteps(backup.completedSteps);
              toast.warning("Restored from local backup — some data may not be up to date.");
            } else {
              setStep(1);
              setCompletedSteps([]);
            }
          } catch {
            setStep(1);
            setCompletedSteps([]);
          }
        } else {
          setStep(1);
          setCompletedSteps([]);
        }
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchOnboardingProgress();
  }, [user?.role, token, navigate, setStep, setCompletedSteps, setIsComplete]);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (max 5MB)');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=image&filename=${encodeURIComponent(file.name)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.uploadUrl) throw new Error(data.error || 'Failed pre-signed URL fetch');

      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      const photoUrl = data.publicUrl;
      setPhotos(prev => [...prev, photoUrl]);
      toast.success('Photo uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/media/presigned-url?type=video&filename=${encodeURIComponent(file.name)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.uploadUrl) throw new Error(data.error || 'Failed pre-signed URL fetch');

      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      setVideoPreview(data.publicUrl);
      toast.success('Video preview uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Video upload failed');
    } finally {
      setUploading(false);
    }
  };

  const toggleService = (srv: string) => {
    setServices(prev => {
      if (prev.includes(srv)) {
        if (prev.length === 1) {
          toast.error('Please select at least one service');
          return prev;
        }
        return prev.filter(s => s !== srv);
      } else {
        return [...prev, srv];
      }
    });
  };

  const addTipItem = () => {
    setTipMenu(prev => [...prev, { amount: 50, action: '' }]);
  };

  const removeTipItem = (idx: number) => {
    setTipMenu(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTipItem = (idx: number, field: 'amount' | 'action', value: any) => {
    setTipMenu(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const saveStep = async (setUpLater: boolean = false) => {
    setSaving(true);
    try {
      let stepPayload: any = {};

      if (step === 1) {
        if (!profileData.bio || !profileData.dateOfBirth) {
          toast.error('Please fill in bio and Date of Birth');
          setSaving(false);
          return;
        }
        if (dobError) {
          toast.error(dobError);
          setSaving(false);
          return;
        }
        stepPayload = {
          bio: profileData.bio,
          dateOfBirth: profileData.dateOfBirth,
          gender: profileData.gender
        };
      }

      else if (step === 2) {
        stepPayload = { photos, videoPreview };
      }

      else if (step === 3) {
        if (!services || services.length === 0) {
          toast.error('Please select at least one service');
          setSaving(false);
          return;
        }
        stepPayload = { servicesOffered: services };
      }

      else if (step === 4) {
        if (services.includes('private_call') && pricing.pricePerMinute < 1.99) {
          toast.error('Minimum rate per minute is $1.99');
          setSaving(false);
          return;
        }
        if (services.includes('hookup') && pricing.tonightRate < 1) {
          toast.error('Minimum rate for tonight is $1');
          setSaving(false);
          return;
        }
        stepPayload = {
          perMinuteRate: pricing.pricePerMinute,
          tonightRate: pricing.tonightRate,
          tipMenu
        };
      }

      else if (step === 5) {
        if (!locationValue.country || !locationValue.state || !locationValue.city) {
          toast.error('Please specify country, state, and city.');
          setSaving(false);
          return;
        }
        stepPayload = {
          country: locationValue.country,
          state: locationValue.state,
          city: locationValue.city,
          coverageArea: coverageArea === 'My city only' ? 'city' : coverageArea === 'My state/region' ? 'state' : 'anywhere'
        };
      }

      else if (step === 6) {
        if (setUpLater) {
          stepPayload = {
            payoutMethod: 'pending'
          };
        } else {
          let pDetails: any = {};
          if (payoutMethod === 'bank') {
            pDetails = {
              bankName: payoutDetails.bankName,
              accountHolder: payoutDetails.accountHolderName,
              accountNumber: payoutDetails.accountNumber,
              routingNumber: payoutDetails.routingCode,
              accountType: payoutDetails.accountType.toLowerCase(),
            };
          } else if (payoutMethod === 'paypal') {
            pDetails = { paypalEmail: payoutDetails.paypalEmail };
          } else if (payoutMethod === 'crypto') {
            pDetails = { currency: payoutDetails.cryptoCurrency, address: payoutDetails.cryptoAddress };
          }

          stepPayload = {
            payoutMethod,
            bankDetails: payoutMethod === 'bank' ? pDetails : undefined,
            paypalEmail: payoutMethod === 'paypal' ? payoutDetails.paypalEmail : undefined,
            crypto: payoutMethod === 'crypto' ? pDetails : undefined
          };
        }
      }

      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/onboarding/step/${step}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(stepPayload)
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && data.errors) {
          const firstErr = Object.values(data.errors)[0] as string;
          toast.error(firstErr || 'Validation error');
          return;
        }
        throw new Error(data.error?.message || data.error || 'Failed to save progress');
      }

      // Update store
      setStepData(step, stepPayload);
      setStep(data.currentStep);
      setCompletedSteps(data.completedSteps);

      // Save to localStorage mirror
      localStorage.setItem('az_provider_onboarding', JSON.stringify({
        currentStep: data.currentStep,
        completedSteps: data.completedSteps,
        savedAt: Date.now(),
      }));

      if (data.currentStep === 7) {
        setIsComplete(true);
        localStorage.removeItem('az_provider_onboarding');
      }

      toast.success(`Step ${step} saved successfully!`);
    } catch (err: any) {
      toast.error(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const stepsList = ['Profile', 'Photos', 'Services', 'Pricing', 'Location', 'Payout', 'Done'];

  // Skeleton Loader while initial progress is fetching
  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain flex flex-col py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto w-full mb-12 animate-pulse">
          {/* Full-width progress bar skeleton */}
          <div className="h-2 w-full bg-[var(--az-bg-secondary)] rounded-full mb-4" />
          {/* Step indicator skeleton */}
          <div className="flex justify-between mt-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx} className="h-3 w-16 bg-[var(--az-bg-secondary)] rounded" />
            ))}
          </div>
        </div>

        {/* Card skeleton */}
        <div className="max-w-2xl mx-auto w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-8 shadow-2xl space-y-6 animate-pulse">
          <div className="h-8 w-2/3 bg-[var(--az-bg-tertiary)] rounded mb-8" />
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] rounded" />
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] rounded" />
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain flex flex-col py-24 px-4 sm:px-6 lg:px-8">
      {/* Step Header */}
      <div className="max-w-3xl mx-auto w-full mb-12">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs uppercase tracking-widest text-[var(--az-text-secondary)] font-bold">Provider Onboarding Wizard</span>
          <span className="text-xs font-mono text-[var(--az-accent-gold)] font-bold">Step {step} of 7</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-[var(--az-bg-secondary)] rounded-full overflow-hidden border border-[var(--az-border)]">
          <div
            className="h-full bg-gradient-to-r from-[var(--az-accent-primary)] to-[var(--az-accent-rose)] transition-all duration-500"
            style={{ width: `${(step / 7) * 100}%` }}
          />
        </div>

        {/* Breadcrumbs / Tabs */}
        <div className="hidden sm:flex justify-between mt-4 border-b border-[var(--az-border)]/50 pb-2">
          {stepsList.map((st, i) => {
            const stepNumber = i + 1;
            const isCompleted = completedSteps.includes(stepNumber);
            const isActive    = step === stepNumber;
            const isLocked    = !isCompleted && !isActive;

            // DONE tab (step 7) is special and NEVER clickable
            if (stepNumber === 7) {
              const isFinished = completedSteps.includes(6);
              return (
                <span
                  key={st}
                  className={[
                    'text-[10px] font-bold uppercase tracking-wider transition-colors pb-0.5',
                    isFinished ? 'tab--completed' : 'tab--locked',
                  ].join(' ')}
                >
                  {st}
                </span>
              );
            }

            return (
              <button
                key={st}
                disabled={isLocked || saving}
                onClick={isCompleted ? () => setStep(stepNumber) : undefined}
                className={[
                  'text-[10px] font-bold uppercase tracking-wider transition-colors pb-0.5 outline-none',
                  isCompleted ? 'tab--completed' : '',
                  isActive    ? 'tab--active'    : '',
                  isLocked    ? 'tab--locked'    : '',
                ].join(' ')}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 sm:p-8 shadow-2xl relative">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">Tell us about yourself</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Create your high-converting profile description & basic details.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Short Bio</label>
                <textarea
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none min-h-[140px] text-sm"
                  placeholder="Describe yourself in a way that makes people want to connect..."
                  maxLength={1000}
                  value={profileData.bio}
                  onChange={e => setProfileData({ ...profileData, bio: e.target.value })}
                />
                <div className="flex justify-end text-[10px] text-[var(--az-text-muted)] mt-1">
                  <span>{profileData.bio.length} / 1000 characters</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Gender</label>
                  <select
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                    value={profileData.gender}
                    onChange={e => setProfileData({ ...profileData, gender: e.target.value })}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-Binary</option>
                    <option value="trans">Transgender</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-2 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] text-sm"
                      value={dobDay}
                      onChange={e => setDobDay(parseInt(e.target.value))}
                    >
                      {days.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>

                    <select
                      className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-2 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] text-sm"
                      value={dobMonth}
                      onChange={e => setDobMonth(parseInt(e.target.value))}
                    >
                      {months.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>

                    <select
                      className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-2 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] text-sm"
                      value={dobYear}
                      onChange={e => setDobYear(parseInt(e.target.value))}
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  {dobError && (
                    <span className="text-xs text-red-500 mt-2 block font-semibold">{dobError}</span>
                  )}
                  <span className="text-[10px] text-[var(--az-text-muted)] mt-1 block">Specify your verified day, month, and year of birth.</span>
                </div>
              </div>
            </div>

            <div className="pt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={logout}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => saveStep()}
                disabled={saving || !!dobError}
                className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Save & Continue →'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">Showcase Yourself</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Upload gorgeous visual media. The first image is your primary profile image.</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-4">Photos (Up to 8)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {photos.map((ph, idx) => (
                    <div key={idx} className="aspect-square bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl overflow-hidden relative group">
                      <img src={ph} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black text-white text-xs flex items-center justify-center transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div className="aspect-square bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl flex flex-col items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[var(--az-accent-rose)] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] uppercase font-bold text-[var(--az-text-secondary)] mt-2">Uploading...</span>
                    </div>
                  )}
                  {photos.length < 8 && !uploading && (
                    <label className="aspect-square bg-[var(--az-bg-tertiary)] border-2 border-dashed border-var(--az-border) hover:border-[var(--az-accent-rose)] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all">
                      <span className="text-2xl text-[var(--az-text-secondary)]">+</span>
                      <span className="text-[10px] uppercase font-bold text-[var(--az-text-secondary)] mt-1">Upload</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} disabled={uploading} />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Introductory video preview (optional)</label>
                {videoPreview ? (
                  <div className="bg-[var(--az-bg-tertiary)] rounded-2xl overflow-hidden border border-[var(--az-border)] relative">
                    <video src={videoPreview} controls className="w-full max-h-[300px] object-cover" />
                    <button
                      onClick={() => setVideoPreview('')}
                      className="absolute top-4 right-4 px-3 py-1 bg-black/60 hover:bg-black text-white rounded text-xs transition-colors"
                    >
                      Remove Video
                    </button>
                  </div>
                ) : (
                  <label className="w-full py-10 bg-[var(--az-bg-tertiary)] border-2 border-dashed border-var(--az-border) hover:border-[var(--az-accent-rose)] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all">
                    {uploading ? (
                      <>
                        <div className="w-8 h-8 border-3 border-[var(--az-accent-rose)] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs text-[var(--az-text-secondary)] font-bold uppercase mt-3">Uploading Video...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl">📹</span>
                        <span className="text-xs text-[var(--az-text-secondary)] font-serif italic mt-2">A short preview video gets up to 3x more profile traffic!</span>
                      </>
                    )}
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>

            <div className="pt-6 flex flex-col-reverse gap-4 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                ← Back
              </button>
              <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row sm:gap-4 sm:items-center">
                <button
                  onClick={() => saveStep()}
                  disabled={saving}
                  className="w-full sm:w-auto text-center py-2 text-xs font-bold text-[var(--az-text-secondary)] hover:text-white uppercase tracking-widest cursor-pointer"
                >
                  Skip
                </button>
                <button
                  onClick={() => saveStep()}
                  disabled={saving}
                  className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    'Save & Continue →'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">What services do you offer?</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Members can search & filter by these items. Choose at least one category.</p>
            </div>

            <div className="space-y-4">
              {[
                { id: 'live_cam', icon: '📹', title: 'Live Webcam Shows', desc: 'Go live on the open cams feeds and earn tips from spectators.' },
                { id: 'private_call', icon: '📞', title: 'Private Video Calls', desc: 'Accept direct video calls for an automated per-minute pricing rate.' },
                { id: 'sext', icon: '💬', title: 'Private Messaging / Sext', desc: 'Charge for direct messages, exclusive text chats, and locked media payloads.' },
                { id: 'hookup', icon: '🌙', title: 'Available for Tonight', desc: 'Inform members nearby that you can meet for local agreements.' },
                { id: 'random', icon: '🎲', title: 'Random Stranger Sessions', desc: 'Enter matching directories for live dynamic encounters.' }
              ].map(srv => {
                const isSelected = services.includes(srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => toggleService(srv.id)}
                    className={`relative p-5 rounded-2xl border cursor-pointer transition-all flex items-start gap-4 ${isSelected ? 'bg-red-950/40 border-[var(--az-accent-primary)] ring-1 ring-[var(--az-accent-primary)] shadow-[0_0_15px_var(--az-glow)] opacity-100' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] opacity-60 hover:opacity-100'}`}
                  >
                    <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">{srv.icon}</span>
                    <div>
                      <h4 className="text-lg font-serif italic text-white mb-1">{srv.title}</h4>
                      <p className="text-xs text-[var(--az-text-secondary)]">{srv.desc}</p>
                    </div>
                    {isSelected && (
                      <span className="absolute top-3 right-4 text-green-400 font-bold text-lg">✓</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => setStep(2)}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => saveStep()}
                disabled={saving || services.length === 0}
                className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Save & Continue →'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">Set Your Rates</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Define what users pay to connect. Earn 75% take-home on all balances.</p>
            </div>

            <div className="space-y-6">
              {/* Conditional pricing message if no paid services selected */}
              {!services.includes('private_call') && !services.includes('hookup') && (
                <div className="p-4 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl text-center text-xs text-[var(--az-text-secondary)]">
                  You haven't selected any paid services. You can still add a tip menu for your free interactions.
                </div>
              )}

              {services.includes('private_call') && (
                <div className="p-5 bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)]">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Per-minute Video Call Rate</label>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono text-[var(--az-accent-gold)] font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1.99"
                      className="bg-black border border-[var(--az-border)] rounded-xl px-4 py-3 text-white font-mono outline-none text-xl w-32"
                      value={pricing.pricePerMinute}
                      onChange={e => setPricing({ ...pricing, pricePerMinute: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="text-xs text-[var(--az-text-muted)]">Suggested range: $3.99 – $9.99/min</span>
                  </div>
                </div>
              )}

              {services.includes('hookup') && (
                <div className="p-5 bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)]">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Your Rate for Tonight</label>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono text-[var(--az-accent-gold)] font-bold">$</span>
                    <input
                      type="number"
                      className="bg-black border border-[var(--az-border)] rounded-xl px-4 py-3 text-white font-mono outline-none text-xl w-32"
                      value={pricing.tonightRate}
                      onChange={e => setPricing({ ...pricing, tonightRate: parseInt(e.target.value) || 0 })}
                    />
                    <span className="text-xs text-[var(--az-text-muted)]">Fixed premium flat-fee for tonight arrange requests.</span>
                  </div>
                </div>
              )}

              {/* Tip Menu Builder */}
              <div className="p-5 bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)] space-y-4">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Tip Menu Actions</label>
                  <button onClick={addTipItem} className="text-[10px] uppercase font-bold text-[var(--az-accent-gold)] hover:underline cursor-pointer">
                    + Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {tipMenu.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-2 p-3 bg-black/20 rounded-xl border border-[var(--az-border)]/50 sm:flex-row sm:items-center sm:bg-transparent sm:p-0 sm:border-0 sm:gap-2">
                      <div className="flex items-center gap-2 justify-between sm:justify-start">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">💎</span>
                          <span className="text-[10px] uppercase font-bold text-[var(--az-text-secondary)] sm:hidden">Credits:</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="w-20 sm:w-16 bg-black border border-[var(--az-border)] rounded-lg px-2 py-1.5 text-white font-mono text-center text-sm sm:text-xs"
                            value={item.amount}
                            onChange={e => updateTipItem(idx, 'amount', parseInt(e.target.value) || 0)}
                          />
                          <button onClick={() => removeTipItem(idx)} className="sm:hidden text-[var(--az-accent-primary)] hover:text-white text-xs p-1">
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="flex-grow flex items-center gap-2 w-full">
                        <input
                          type="text"
                          placeholder="What you'll perform for this tip"
                          className="flex-grow bg-black border border-[var(--az-border)] rounded-lg px-3 py-2 text-white text-xs w-full"
                          value={item.action}
                          onChange={e => updateTipItem(idx, 'action', e.target.value)}
                        />
                        <button onClick={() => removeTipItem(idx)} className="hidden sm:block text-[var(--az-accent-primary)] hover:text-white text-xs px-2 cursor-pointer">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Earnings Calculator Slider */}
              <div className="p-6 bg-gradient-to-r from-red-950/20 to-yellow-950/20 border border-[var(--az-border)] rounded-3xl">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--az-accent-gold)] mb-4">Interactive Take-home Calculator</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span>Private minutes per week</span>
                      <span className="font-bold text-white">{calcMinutes} minutes</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="10"
                      className="w-full accent-[var(--az-accent-rose)] cursor-pointer"
                      value={calcMinutes}
                      onChange={e => setCalcMinutes(parseInt(e.target.value))}
                    />
                  </div>

                  <div className="flex justify-between items-center border-t border-[var(--az-border)]/50 pt-4">
                    <span className="text-xs text-[var(--az-text-secondary)]">Weekly Take-Home (75%)</span>
                    <span className="text-2xl font-mono text-green-400 font-bold">
                      ${((calcMinutes * pricing.pricePerMinute) * 0.75).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => setStep(3)}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => saveStep()}
                disabled={saving}
                className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Save & Continue →'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">Where are you based?</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Only your generalized City and State will be visible to members browsing local channels.</p>
            </div>

            <div className="space-y-6">
              <LocationSelect value={locationValue} onChange={setLocationValue} />

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Coverage Area</label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {['My city only', 'My state/region', 'Anywhere'].map(area => (
                    <button
                      key={area}
                      onClick={() => setCoverageArea(area)}
                      className={`py-2 px-1 rounded-xl text-[8px] min-[360px]:text-[9px] sm:text-[10px] font-bold uppercase tracking-wider min-[360px]:tracking-widest border transition-all cursor-pointer ${coverageArea === area ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              {locationValue.city && (
                <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4 text-center">
                  <p className="text-xs text-[var(--az-text-secondary)]">Map scope rendering for:</p>
                  <p className="font-serif italic text-white text-lg mt-1">{locationValue.city.name}, {locationValue.country?.name}</p>
                  <div className="mt-3 aspect-[16/9] w-full rounded-xl bg-black/40 border border-[var(--az-border)] flex items-center justify-center">
                    <span className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest">Static Map Simulation (GPS: {locationValue.city.lat}, {locationValue.city.lng})</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => setStep(4)}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => saveStep()}
                disabled={saving}
                className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Save & Continue →'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-serif italic text-white mb-2">Payout Method Settings</h2>
              <p className="text-sm text-[var(--az-text-secondary)]">Select how you wish to process premium take-home balances. Payouts cleared every Friday.</p>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  { id: 'bank', name: 'Bank Transfer' },
                  { id: 'paypal', name: 'PayPal' },
                  { id: 'crypto', name: 'Crypto' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setPayoutMethod(opt.id)}
                    className={`py-2 px-1 rounded-xl text-[8px] min-[360px]:text-[9px] sm:text-[10px] font-bold uppercase tracking-wider min-[360px]:tracking-widest border transition-all cursor-pointer ${payoutMethod === opt.id ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
                  >
                    {opt.name}
                  </button>
                ))}
              </div>

              {payoutMethod === 'bank' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Bank Name</label>
                    <input
                      type="text"
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                      value={payoutDetails.bankName}
                      onChange={e => setPayoutDetails({ ...payoutDetails, bankName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Account Number</label>
                      <input
                        type="text"
                        className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                        value={payoutDetails.accountNumber}
                        onChange={e => setPayoutDetails({ ...payoutDetails, accountNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Routing/Sort Code</label>
                      <input
                        type="text"
                        className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                        value={payoutDetails.routingCode}
                        onChange={e => setPayoutDetails({ ...payoutDetails, routingCode: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {payoutMethod === 'paypal' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">PayPal Registered Email</label>
                  <input
                    type="email"
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                    value={payoutDetails.paypalEmail}
                    onChange={e => setPayoutDetails({ ...payoutDetails, paypalEmail: e.target.value })}
                  />
                </div>
              )}

              {payoutMethod === 'crypto' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Currency Network</label>
                    <select
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                      value={payoutDetails.cryptoCurrency}
                      onChange={e => setPayoutDetails({ ...payoutDetails, cryptoCurrency: e.target.value })}
                    >
                      <option value="BTC">Bitcoin (BTC)</option>
                      <option value="USDT">Tether (USDT - TRC20)</option>
                      <option value="ETH">Ethereum (ETH)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Wallet Address</label>
                    <input
                      type="text"
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                      value={payoutDetails.cryptoAddress}
                      onChange={e => setPayoutDetails({ ...payoutDetails, cryptoAddress: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 flex flex-col-reverse gap-4 sm:flex-row sm:justify-between sm:items-center">
              <button
                onClick={() => setStep(5)}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
              >
                ← Back
              </button>
              <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row sm:gap-4 sm:items-center">
                <button
                  onClick={() => saveStep(true)}
                  disabled={saving}
                  className="w-full sm:w-auto text-center py-2 text-xs font-bold text-[var(--az-text-secondary)] hover:text-white uppercase tracking-widest cursor-pointer"
                >
                  Set Up Later
                </button>
                <button
                  onClick={() => saveStep()}
                  disabled={saving}
                  className="w-full sm:w-auto px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    'Save & Complete Setup →'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-6 text-center py-8">
            <div className="w-20 h-20 bg-green-950/50 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
              <span className="text-4xl text-green-400">✓</span>
            </div>

            <h2 className="text-4xl font-serif italic text-white mb-2">You're Ready to Go Live</h2>
            <p className="text-sm text-[var(--az-text-secondary)] max-w-md mx-auto leading-relaxed">
              Congratulations! Your premium profile setup is fully complete. Members in your proximity can now discover and tipping your services.
            </p>

            <div className="bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)] p-6 max-w-sm mx-auto space-y-3 text-left">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--az-text-secondary)]">Profile Details</span>
                <span className="text-green-400 font-bold">✓ Created</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--az-text-secondary)]">Pricing Configurations</span>
                <span className="text-green-400 font-bold">✓ Complete</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--az-text-secondary)]">Dynamic Location Map</span>
                <span className="text-green-400 font-bold">✓ Mapped</span>
              </div>
            </div>

            <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/adult/provider/dashboard')}
                className="px-8 py-4 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all cursor-pointer"
              >
                Go to My Dashboard →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderOnboarding;
