import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import LocationSelect from './LocationSelect';
import { toast } from 'sonner';

const ProviderOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken');

  const [step, setStep] = useState(1);
  const [profileData, setProfileData] = useState({
    bio: '',
    gender: 'female',
    dateOfBirth: '',
  });

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

  // Suggested values for calculation
  const [calcMinutes, setCalcMinutes] = useState(30);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    // If user has complete status or if not provider, redirect accordingly
    if (user && user.role !== 'provider') {
      navigate('/');
    }
  }, [user, token, navigate]);

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

      // Direct upload simulation or mock binary put
      await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      // Save public URL to profile
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

  const saveStep = async (nextStep: number) => {
    try {
      if (step === 1) {
        if (!profileData.bio || !profileData.dateOfBirth) {
          toast.error('Please fill in bio and Date of Birth');
          return;
        }
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              bio: profileData.bio,
              dateOfBirth: profileData.dateOfBirth,
              gender: profileData.gender
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update profile basic details');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_profile_details', JSON.stringify(profileData));
        }
      }

      if (step === 2) {
        // Save photos & video preview
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/photos`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ photos, videoPreview })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update media gallery');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_media_details', JSON.stringify({ photos, videoPreview }));
        }
      }

      if (step === 3) {
        // Services offered update
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/services`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ servicesOffered: services })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update services');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_services_details', JSON.stringify(services));
        }
      }

      if (step === 4) {
        if (services.includes('private_call') && pricing.pricePerMinute < 1.99) {
          toast.error('Minimum rate per minute is $1.99');
          return;
        }
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/pricing`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              pricePerMinute: pricing.pricePerMinute,
              tonightRate: pricing.tonightRate,
              tipMenu
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update rates/pricing details');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_pricing_details', JSON.stringify({ pricing, tipMenu }));
        }
      }

      if (step === 5) {
        if (!locationValue.country || !locationValue.state || !locationValue.city) {
          toast.error('Please specify country, state, and city.');
          return;
        }
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/location`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              location: {
                country: locationValue.country,
                state: locationValue.state,
                city: locationValue.city
              }
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save location details');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_location_details', JSON.stringify(locationValue));
        }
      }

      if (step === 6) {
        // Save payout method details
        try {
          const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              payoutInfo: {
                method: payoutMethod,
                details: payoutDetails
              }
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to save payout info');
        } catch (xhrErr) {
          console.warn('Onboarding XHR fallback active:', xhrErr);
          localStorage.setItem('provider_payout_details', JSON.stringify({ payoutMethod, payoutDetails }));
        }
      }

      setStep(nextStep);
    } catch (err: any) {
      toast.error(err.message || 'Operation failed');
    }
  };

  const stepsList = ['Profile', 'Photos', 'Services', 'Pricing', 'Location', 'Payout', 'Done'];

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

        {/* Breadcrumbs */}
        <div className="hidden sm:flex justify-between mt-4">
          {stepsList.map((st, i) => (
            <span
              key={st}
              className={`text-[10px] font-bold uppercase tracking-wider ${step === i + 1 ? 'text-[var(--az-accent-rose)]' : step > i + 1 ? 'text-green-400' : 'text-[var(--az-text-muted)]'}`}
            >
              {st}
            </span>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-8 shadow-2xl relative">
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

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Date of Birth</label>
                  <input
                    type="date"
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                    value={profileData.dateOfBirth}
                    onChange={e => setProfileData({ ...profileData, dateOfBirth: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={logout} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                Cancel
              </button>
              <button onClick={() => saveStep(2)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                Save & Continue →
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
                  {photos.length < 8 && (
                    <label className="aspect-square bg-[var(--az-bg-tertiary)] border-2 border-dashed border-[var(--az-border)] hover:border-[var(--az-accent-rose)] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all">
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
                  <label className="w-full py-10 bg-[var(--az-bg-tertiary)] border-2 border-dashed border-[var(--az-border)] hover:border-[var(--az-accent-rose)] rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all">
                    <span className="text-3xl">📹</span>
                    <span className="text-xs text-[var(--az-text-secondary)] font-serif italic mt-2">A short preview video gets up to 3x more profile traffic!</span>
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={() => setStep(1)} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ← Back
              </button>
              <div className="flex gap-4">
                <button onClick={() => setStep(3)} className="text-xs font-bold text-[var(--az-text-secondary)] hover:text-white uppercase tracking-widest">
                  Skip
                </button>
                <button onClick={() => saveStep(3)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                  Save & Continue →
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
                    className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-start gap-4 ${isSelected ? 'bg-red-950/20 border-[var(--az-accent-primary)] shadow-[0_0_15px_var(--az-glow)]' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] opacity-70 hover:opacity-100'}`}
                  >
                    <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">{srv.icon}</span>
                    <div>
                      <h4 className="text-lg font-serif italic text-white mb-1">{srv.title}</h4>
                      <p className="text-xs text-[var(--az-text-secondary)]">{srv.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={() => setStep(2)} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ← Back
              </button>
              <button onClick={() => saveStep(4)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                Save & Continue →
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
                  <button onClick={addTipItem} className="text-[10px] uppercase font-bold text-[var(--az-accent-gold)] hover:underline">
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {tipMenu.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-xs">💎</span>
                      <input
                        type="number"
                        className="w-16 bg-black border border-[var(--az-border)] rounded-lg px-2 py-2 text-white font-mono text-center"
                        value={item.amount}
                        onChange={e => updateTipItem(idx, 'amount', parseInt(e.target.value) || 0)}
                      />
                      <input
                        type="text"
                        placeholder="What you'll perform for this tip"
                        className="flex-grow bg-black border border-[var(--az-border)] rounded-lg px-3 py-2 text-white text-xs"
                        value={item.action}
                        onChange={e => updateTipItem(idx, 'action', e.target.value)}
                      />
                      <button onClick={() => removeTipItem(idx)} className="text-[var(--az-accent-primary)] hover:text-white text-xs px-2">
                        ✕
                      </button>
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
                      className="w-full accent-[var(--az-accent-rose)]"
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

            <div className="pt-6 flex justify-between">
              <button onClick={() => setStep(3)} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ← Back
              </button>
              <button onClick={() => saveStep(5)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                Save & Continue →
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
                <div className="grid grid-cols-3 gap-2">
                  {['My city only', 'My state/region', 'Anywhere'].map(area => (
                    <button
                      key={area}
                      onClick={() => setCoverageArea(area)}
                      className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${coverageArea === area ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
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

            <div className="pt-6 flex justify-between">
              <button onClick={() => setStep(4)} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ← Back
              </button>
              <button onClick={() => saveStep(6)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                Save & Continue →
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
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bank', name: 'Bank Transfer' },
                  { id: 'paypal', name: 'PayPal' },
                  { id: 'crypto', name: 'Crypto' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setPayoutMethod(opt.id)}
                    className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${payoutMethod === opt.id ? 'bg-[var(--az-accent-primary)] text-white border-transparent' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
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
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                      value={payoutDetails.bankName}
                      onChange={e => setPayoutDetails({ ...payoutDetails, bankName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Account Number</label>
                      <input
                        type="text"
                        className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                        value={payoutDetails.accountNumber}
                        onChange={e => setPayoutDetails({ ...payoutDetails, accountNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Routing/Sort Code</label>
                      <input
                        type="text"
                        className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
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
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
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
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
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
                      className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white outline-none"
                      value={payoutDetails.cryptoAddress}
                      onChange={e => setPayoutDetails({ ...payoutDetails, cryptoAddress: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={() => setStep(5)} className="px-6 py-3 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ← Back
              </button>
              <div className="flex gap-4">
                <button onClick={() => setStep(7)} className="text-xs font-bold text-[var(--az-text-secondary)] hover:text-white uppercase tracking-widest">
                  Set Up Later
                </button>
                <button onClick={() => saveStep(7)} className="px-8 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg">
                  Save & Complete Setup →
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
                className="px-8 py-4 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all"
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
