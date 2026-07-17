import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const ProviderLive: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [isLive, setIsLive] = useState(false);
  const [duration, setDuration] = useState(0);
  const [viewerCount] = useState(142);
  const [sessionTips] = useState(1250);

  const [chatMessages, setChatMessages] = useState<any[]>([
    { id: '1', user: 'Member_882', text: 'Hey there beauty! Gorgeous room!' },
    { id: '2', user: 'DiscreetLover', text: 'Tipped 50 credits! Play a special song?', tip: 50 },
    { id: '3', user: 'VibeGold', text: 'Looking amazing today' }
  ]);

  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  useEffect(() => {
    let timer: any;
    if (isLive) {
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(timer);
  }, [isLive]);

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartStream = () => {
    setIsLive(true);
    toast.success('Successfully started live streaming session!');
  };

  const handleEndStream = () => {
    if (window.confirm('Are you sure you want to end this webcam session?')) {
      setIsLive(false);
      toast.info(`Session ended. Tips accumulated: 💎 ${sessionTips}`);
    }
  };

  const handleSendChat = () => {
    if (!inputText.trim()) return;
    setChatMessages(prev => [...prev, { id: 'msg-temp-' + Date.now(), user: 'Me (Provider)', text: inputText }]);
    setInputText('');
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Video Preview Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-black border border-[var(--az-border)] rounded-3xl aspect-video relative overflow-hidden flex flex-col justify-between p-6 shadow-2xl">
            {/* Top Row indicators */}
            <div className="flex justify-between items-center z-10">
              {isLive ? (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[var(--az-accent-primary)] text-white text-[10px] font-bold uppercase rounded-full shadow-[0_0_10px_var(--az-glow)] animate-pulse">
                    🔴 Live Room
                  </span>
                  <span className="font-mono text-xs bg-black/60 px-2.5 py-1 rounded-full text-white">
                    {formatDuration(duration)}
                  </span>
                </div>
              ) : (
                <span className="px-3 py-1 bg-[var(--az-bg-secondary)] text-[var(--az-text-secondary)] text-[10px] font-bold uppercase rounded-full">
                  Offline Preview
                </span>
              )}

              <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full">
                <span className="text-[10px] text-white font-mono">👁️ {viewerCount}</span>
              </div>
            </div>

            {/* Video preview dummy */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-2">
                <span className="text-5xl opacity-40">📹</span>
                <p className="text-xs text-[var(--az-text-muted)] font-serif italic">WebRTC Camera Preview ( navigator.getUserMedia )</p>
              </div>
            </div>

            {/* Bottom Stream Control Bar */}
            <div className="flex justify-between items-center z-10 border-t border-[var(--az-border)]/20 pt-4 mt-auto bg-black/35 backdrop-blur-sm -mx-6 -mb-6 p-6">
              <div className="flex gap-2">
                <button className="w-10 h-10 rounded-xl bg-black/60 border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-bg-tertiary)] text-lg">🎙️</button>
                <button className="w-10 h-10 rounded-xl bg-black/60 border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-bg-tertiary)] text-lg">📷</button>
              </div>

              {!isLive ? (
                <button
                  onClick={handleStartStream}
                  className="px-10 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all"
                >
                  Start Webcam Session
                </button>
              ) : (
                <button
                  onClick={handleEndStream}
                  className="px-10 py-3 bg-red-950 text-red-400 border border-red-500/30 hover:bg-red-900 font-bold text-xs uppercase tracking-widest rounded-full transition-all"
                >
                  End Session
                </button>
              )}
            </div>
          </div>

          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-serif italic text-white">Cumulative Session Tips</h4>
              <p className="text-xs text-[var(--az-text-secondary)] mt-0.5">Tip metrics accumulated from public viewing arena</p>
            </div>
            <span className="text-3xl font-mono font-bold text-[var(--az-accent-gold)]">💎 {sessionTips}</span>
          </div>
        </div>

        {/* Right: Live Chat arena */}
        <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 h-[500px] flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-serif italic text-white mb-2">Live Room Chat</h3>
            <p className="text-[10px] text-[var(--az-text-secondary)] border-b border-[var(--az-border)]/30 pb-3">Spectators interact here in real-time</p>
          </div>

          <div className="flex-grow overflow-y-auto py-4 space-y-3 pr-1">
            {chatMessages.map(msg => (
              <div key={msg.id} className="text-xs space-y-0.5">
                {msg.tip ? (
                  <div className="p-2 bg-yellow-950/20 border border-yellow-500/30 rounded-lg text-[var(--az-accent-gold)] font-bold mb-1">
                    🎉 {msg.user} tipped 💎 {msg.tip} credits!
                  </div>
                ) : (
                  <div>
                    <span className="font-bold text-[var(--az-accent-rose)]">{msg.user}: </span>
                    <span className="text-[var(--az-text-primary)]">{msg.text}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-[var(--az-border)]/30 pt-4">
            <input
              type="text"
              placeholder="Chat with spectators..."
              className="flex-grow bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
            />
            <button onClick={handleSendChat} className="px-4 py-2.5 bg-[var(--az-accent-rose)] hover:bg-pink-700 text-white font-bold text-xs uppercase rounded-xl">
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProviderLive;
