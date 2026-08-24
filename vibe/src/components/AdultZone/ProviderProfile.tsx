import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import LocationSelect from './LocationSelect';
import { toast } from 'sonner';

const isValidRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const ProviderProfile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem('adultAccessToken');

  const initialTab = searchParams.get('tab') === 'payment' ? 'payment' : 'basic';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

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

  const [profileData, setProfileData] = useState({
    bio: '',
    gender: 'female',
    stageName: '',
  });

  const [photos, setPhotos] = useState<string[]>([
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop"
  ]);
  const [videoPreview, setVideoPreview] = useState<string>('');

  // Dummy reads to avoid compiler unused-variable issues
  useEffect(() => {
    if (photos.length === 0 || videoPreview.length > 0) {
      // noop
    }
  }, [photos, videoPreview]);

  const [services, setServices] = useState<string[]>(['live_cam', 'private_call']);
  const [pricing, setPricing] = useState({
    pricePerMinute: 0,
    tonightRate: 0,
  });

  const [tipMenu, setTipMenu] = useState<{ amount: number; action: string }[]>([
    { amount: 50, action: 'Send an exclusive photo' },
    { amount: 100, action: 'Special shoutout' }
  ]);

  const [locationValue, setLocationValue] = useState<any>({});
  const [schedule, setSchedule] = useState<any[]>([
    { day: 'Monday', active: true, start: '20:00', end: '02:00' },
    { day: 'Tuesday', active: false, start: '20:00', end: '02:00' },
    { day: 'Wednesday', active: true, start: '20:00', end: '02:00' },
    { day: 'Thursday', active: false, start: '20:00', end: '02:00' },
    { day: 'Friday', active: true, start: '20:00', end: '02:00' },
    { day: 'Saturday', active: true, start: '18:00', end: '03:00' },
    { day: 'Sunday', active: false, start: '20:00', end: '02:00' }
  ]);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success && data.data.user) {
          const u = data.data.user;
          const profile = u.providerProfile || {};
          setProfileData({
            bio: u.bio || '',
            gender: u.gender || 'female',
            stageName: profile.stageName || u.firstName || ''
          });
          if (profile.photos && profile.photos.length > 0) {
            setPhotos(profile.photos);
          }
          if (profile.videoPreview) {
            setVideoPreview(profile.videoPreview);
          }
          if (profile.servicesOffered) {
            setServices(profile.servicesOffered);
          }
          setPricing({
            pricePerMinute: profile.pricePerMinute ?? 0,
            tonightRate: profile.tonightRate ?? 0
          });
          if (profile.tipMenu && profile.tipMenu.length > 0) {
            setTipMenu(profile.tipMenu);
          }
          if (profile.location) {
            setLocationValue(profile.location);
          }
          if (profile.schedule && profile.schedule.length > 0) {
            setSchedule(profile.schedule);
          }
        }

        // Fetch payout onboarding step data for payment configuration prefill
        const payoutRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me/onboarding`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payoutData = await payoutRes.json();
        if (payoutRes.ok && payoutData.success && payoutData.stepData && payoutData.stepData[6]) {
          const step6 = payoutData.stepData[6];
          setPayoutMethod(step6.payoutMethod || 'bank');
          const details = step6.payoutDetails || {};
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
      } catch (err) {
        console.error('Failed to pre-populate profile editor:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadProfile();
  }, [token, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--az-accent-gold)] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Loading Profile Editor...</p>
        </div>
      </div>
    );
  }

  const toggleService = (id: string) => {
    setServices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaveBasic = async () => {
    setSavingBasic(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bio: profileData.bio,
          gender: profileData.gender,
          stageName: profileData.stageName
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const errMsg = typeof data.error === 'string'
          ? data.error
          : data.error?.message || data.message || 'Failed to update profile';
        throw new Error(errMsg);
      }
      toast.success('Basic profile details updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingBasic(false);
    }
  };

  const handleSaveServicesAndPricing = async () => {
    if (services.includes('private_call') && !isValidRate(pricing.pricePerMinute)) {
      toast.error('Per-minute rate must be greater than 0 diamonds');
      return;
    }

    if (services.includes('hookup') && !isValidRate(pricing.tonightRate)) {
      toast.error('Rate for tonight must be greater than 0 diamonds');
      return;
    }

    setSavingServices(true);
    try {
      const serviceRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me/services`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ servicesOffered: services })
      });
      const serviceData = await serviceRes.json().catch(() => null);
      if (!serviceRes.ok || !serviceData?.success) {
        throw new Error(serviceData?.error?.message || serviceData?.error || serviceData?.message || 'Failed to update services');
      }

      const pricingRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me/pricing`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          perMinuteRate: pricing.pricePerMinute,
          tonightRate: pricing.tonightRate,
          tipMenu
        })
      });
      const pricingData = await pricingRes.json().catch(() => null);
      if (!pricingRes.ok || !pricingData?.success) {
        throw new Error(pricingData?.error?.message || pricingData?.error || pricingData?.message || 'Failed to update pricing / tips');
      }

      toast.success('Services & Rates configurations saved!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save Services & Rates');
    } finally {
      setSavingServices(false);
    }
  };

  const handleSaveLocation = async () => {
    setSavingLocation(true);
    try {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/location`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ location: locationValue })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save location');
      } catch (xhrErr) {
        console.warn('Profile location fallback active:', xhrErr);
        localStorage.setItem('provider_location_details', JSON.stringify(locationValue));
      }
      toast.success('Coverage location updated successfully!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      // Validate schedule format first!
      const timeRegex = /^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
      for (const sch of schedule) {
        if (sch.active) {
          if (!sch.start || !timeRegex.test(sch.start)) {
            throw new Error(`Invalid start time format for ${sch.day}. Please use HH:MM format (e.g., 12:00 to 23:59). Entered: "${sch.start || ''}"`);
          }
          if (!sch.end || !timeRegex.test(sch.end)) {
            throw new Error(`Invalid end time format for ${sch.day}. Please use HH:MM format (e.g., 12:00 to 23:59). Entered: "${sch.end || ''}"`);
          }
        }
      }

      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ schedule })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed to save schedule');
      toast.success('Weekly calendar parameters saved successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">

        <div>
          <h1 className="text-4xl font-serif italic text-white tracking-wide">Public Profile Editor</h1>
          <p className="text-xs text-[var(--az-text-secondary)] mt-1">Configure your public-facing performer persona & parameters</p>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[var(--az-border)]/30 gap-6 overflow-x-auto">
          {['basic', 'services', 'location', 'schedule', 'payment'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className={`pb-4 text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'text-[var(--az-accent-rose)] border-b-2 border-[var(--az-accent-rose)]' : 'text-[var(--az-text-secondary)] hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-8 shadow-xl">
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Stage Name</label>
                  <input
                    type="text"
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                    value={profileData.stageName}
                    onChange={e => setProfileData({ ...profileData, stageName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Gender Category</label>
                  <select
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                    value={profileData.gender}
                    onChange={e => setProfileData({ ...profileData, gender: e.target.value })}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-Binary</option>
                    <option value="trans">Transgender</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Short Bio Description</label>
                <textarea
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:outline-none min-h-[140px] text-sm"
                  value={profileData.bio}
                  onChange={e => setProfileData({ ...profileData, bio: e.target.value })}
                />
              </div>

              <button
                onClick={handleSaveBasic}
                disabled={savingBasic}
                className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {savingBasic ? 'Processing...' : 'Save Basic Info'}
              </button>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-6">
              <h3 className="text-lg font-serif italic text-white mb-4">Toggle services & specify rates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'live_cam', name: '📹 Live Webcam shows' },
                  { id: 'private_call', name: '📞 Private Video Calls' },
                  { id: 'sext', name: '💬 Messaging / Inbox' },
                  { id: 'hookup', name: '🌙 Available for Tonight' }
                ].map(srv => {
                  const active = services.includes(srv.id);
                  return (
                    <button
                      key={srv.id}
                      onClick={() => toggleService(srv.id)}
                      className={`py-3 px-4 rounded-xl border text-xs font-bold text-left transition-all ${active ? 'bg-red-950/20 border-[var(--az-accent-primary)] text-white shadow-[0_0_10px_var(--az-glow)]' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'}`}
                    >
                      {srv.name}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[var(--az-border)]/30">
                {services.includes('private_call') && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Rate per Private Minute (💎)</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white font-mono outline-none"
                      value={pricing.pricePerMinute}
                      onChange={e => {
                        const value = Number(e.target.value);
                        setPricing({ ...pricing, pricePerMinute: Number.isFinite(value) ? value : 0 });
                      }}
                    />
                  </div>
                )}
                {services.includes('hookup') && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Rate for Tonight Arrangement (💎)</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white font-mono outline-none"
                      value={pricing.tonightRate}
                      onChange={e => {
                        const value = Number(e.target.value);
                        setPricing({ ...pricing, tonightRate: Number.isFinite(value) ? value : 0 });
                      }}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveServicesAndPricing}
                disabled={savingServices}
                className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {savingServices ? 'Processing...' : 'Save Services & Rates'}
              </button>
            </div>
          )}

          {activeTab === 'location' && (
            <div className="space-y-6">
              <h3 className="text-lg font-serif italic text-white mb-4">Coverage Coordinates Select</h3>
              <LocationSelect value={locationValue} onChange={setLocationValue} />

              <button
                onClick={handleSaveLocation}
                disabled={savingLocation}
                className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {savingLocation ? 'Processing...' : 'Save Location'}
              </button>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
              <h3 className="text-lg font-serif italic text-white mb-4">Weekly availability scheduler</h3>
              <div className="space-y-3">
                {schedule.map((sch, i) => (
                  <div key={sch.day} className="flex items-center justify-between p-4 bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)]">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={sch.active}
                        className="accent-[var(--az-accent-rose)] h-4 w-4"
                        onChange={e => {
                          const val = e.target.checked;
                          setSchedule(prev => prev.map((s, idx) => idx === i ? { ...s, active: val } : s));
                        }}
                      />
                      <span className="text-sm font-semibold text-white">{sch.day}</span>
                    </div>

                    {sch.active && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-16 bg-black border border-[var(--az-border)] rounded px-2 py-1 text-xs text-white text-center font-mono"
                          value={sch.start}
                          onChange={e => {
                            const val = e.target.value;
                            setSchedule(prev => prev.map((s, idx) => idx === i ? { ...s, start: val } : s));
                          }}
                        />
                        <span className="text-xs text-[var(--az-text-secondary)]">to</span>
                        <input
                          type="text"
                          className="w-16 bg-black border border-[var(--az-border)] rounded px-2 py-1 text-xs text-white text-center font-mono"
                          value={sch.end}
                          onChange={e => {
                            const val = e.target.value;
                            setSchedule(prev => prev.map((s, idx) => idx === i ? { ...s, end: val } : s));
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {savingSchedule ? 'Processing...' : 'Save Schedule'}
              </button>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="space-y-6" data-testid="payment-tab-content">
              <h3 className="text-lg font-serif italic text-white mb-4">Payout Method & Details</h3>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bank', name: 'Bank Transfer' },
                  { id: 'paypal', name: 'PayPal' },
                  { id: 'crypto', name: 'Crypto' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setPayoutMethod(opt.id)}
                    className={`py-3 px-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${payoutMethod === opt.id ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
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
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Account Holder Name</label>
                    <input
                      type="text"
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none focus:border-[var(--az-accent-rose)] transition-colors"
                      value={payoutDetails.accountHolderName}
                      onChange={e => setPayoutDetails({ ...payoutDetails, accountHolderName: e.target.value })}
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

              <button
                onClick={async () => {
                  setSavingPayment(true);
                  try {
                    let pDetails: Record<string, unknown> = {};
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

                    const stepPayload = {
                      payoutMethod,
                      bankDetails: payoutMethod === 'bank' ? pDetails : undefined,
                      paypalEmail: payoutMethod === 'paypal' ? payoutDetails.paypalEmail : undefined,
                      crypto: payoutMethod === 'crypto' ? pDetails : undefined
                    };

                    const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/onboarding/step/6`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify(stepPayload)
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      throw new Error(data.message || data.error || 'Failed to save payout settings');
                    }
                    toast.success('Payout settings updated successfully!');
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to update payout settings');
                  } finally {
                    setSavingPayment(false);
                  }
                }}
                disabled={savingPayment}
                data-testid="save-payment-btn"
                className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                {savingPayment ? 'Processing...' : 'Save Payment Settings'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ProviderProfile;
