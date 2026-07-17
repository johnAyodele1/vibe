import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const ProviderMessages: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [conversations] = useState<any[]>([
    { id: '1', name: 'MemberName123', preview: 'Hey, are you available tonight?', time: '2 min ago', unread: 2 },
    { id: '2', name: 'DiscreetUser', preview: 'Loved your last show! ❤️', time: '1 hr ago', unread: 0 },
    { id: '3', name: 'User_8821', preview: '[🔒 Locked premium photo]', time: '3 hr ago', unread: 0 }
  ]);
  const [activeId, setActiveId] = useState<string>('1');
  const [messages, setMessages] = useState<any[]>([
    { id: 'm1', sender: 'member', text: 'Hey, are you available tonight?', time: '2 min ago' }
  ]);
  const [textInput, setTextInput] = useState('');

  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumPrice, setPremiumPrice] = useState(50);

  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  const handleSend = () => {
    if (!textInput.trim()) return;
    setMessages(prev => [...prev, { id: 'm-temp-' + Date.now(), sender: 'provider', text: textInput, time: 'Just Now' }]);
    setTextInput('');
    toast.success('Message sent');
  };

  const sendPaidMedia = () => {
    setMessages(prev => [
      ...prev,
      {
        id: 'm-premium-' + Date.now(),
        sender: 'provider',
        text: `🔒 Locked premium content • Cost: 💎 ${premiumPrice} credits`,
        time: 'Just Now',
        isLocked: true,
        price: premiumPrice
      }
    ]);
    setPremiumModalOpen(false);
    toast.success(`Premium locked media sent for 💎 ${premiumPrice} credits`);
  };

  const activeChat = conversations.find(c => c.id === activeId);

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl overflow-hidden h-[75vh] flex">

        {/* Sidebar */}
        <div className="w-1/3 border-r border-[var(--az-border)]/50 flex flex-col h-full bg-[var(--az-bg-secondary)]">
          <div className="p-4 border-b border-[var(--az-border)]/50">
            <h2 className="text-xl font-serif italic text-white">Inbox Messages</h2>
            <p className="text-[10px] text-[var(--az-text-secondary)]">Chatting with active subscribers</p>
          </div>

          <div className="flex-grow overflow-y-auto divide-y divide-[var(--az-border)]/20">
            {conversations.map(c => (
              <div
                key={c.id}
                onClick={() => { setActiveId(c.id); setMessages([{ id: 'm1', sender: 'member', text: c.preview, time: c.time }]); }}
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${activeId === c.id ? 'bg-[var(--az-bg-tertiary)]' : 'hover:bg-[var(--az-bg-tertiary)]/40'}`}
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{c.name}</h4>
                  <p className="text-[11px] text-[var(--az-text-secondary)] mt-0.5 max-w-[150px] truncate">{c.preview}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-[var(--az-text-muted)] font-mono">{c.time}</p>
                  {c.unread > 0 && (
                    <span className="inline-block mt-1 w-5 h-5 rounded-full bg-[var(--az-accent-rose)] text-[10px] font-bold flex items-center justify-center text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat window */}
        <div className="w-2/3 flex flex-col h-full bg-[#050304]">
          {activeChat ? (
            <>
              {/* Top info bar */}
              <div className="p-4 bg-[var(--az-bg-secondary)] border-b border-[var(--az-border)]/50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{activeChat.name}</h3>
                  <p className="text-[10px] text-green-400">● Online Now</p>
                </div>
                <button
                  onClick={() => setPremiumModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--az-accent-gold)] to-yellow-600 text-black font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
                >
                  💎 Send Paid Media
                </button>
              </div>

              {/* Message Feed */}
              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                {messages.map(m => {
                  const isProvider = m.sender === 'provider';
                  return (
                    <div key={m.id} className={`flex ${isProvider ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] p-4 rounded-2xl text-xs relative ${isProvider ? 'bg-[var(--az-accent-primary)] text-white rounded-br-none' : 'bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-[var(--az-text-primary)] rounded-bl-none'}`}>
                        {m.isLocked && <span className="mr-1">🔒</span>}
                        <span>{m.text}</span>
                        <span className="block text-[8px] text-right mt-2 text-white/50 font-mono">{m.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom input */}
              <div className="p-4 bg-[var(--az-bg-secondary)] border-t border-[var(--az-border)]/50 flex gap-2">
                <input
                  type="text"
                  placeholder="Type message here..."
                  className="flex-grow bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white focus:outline-none"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="px-6 py-3 bg-[var(--az-accent-rose)] hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center text-sm font-serif italic text-[var(--az-text-muted)]">
              Select a conversation to start chatting
            </div>
          )}
        </div>

      </div>

      {/* Send Premium Modal */}
      {premiumModalOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 relative">
            <button onClick={() => setPremiumModalOpen(false)} className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white">✕</button>

            <h3 className="text-xl font-serif italic text-white mb-4">Send Paid Premium Media</h3>
            <p className="text-xs text-[var(--az-text-secondary)] mb-6">Set the pricing unlock cost in credits. User pays to reveal media.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Price (Credits)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-[var(--az-accent-gold)]">💎</span>
                  <input
                    type="number"
                    className="w-full bg-black border border-[var(--az-border)] rounded-xl px-4 py-3 text-white font-mono text-lg outline-none"
                    value={premiumPrice}
                    onChange={e => setPremiumPrice(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="border border-dashed border-[var(--az-border)] rounded-xl p-6 text-center cursor-pointer hover:border-[var(--az-accent-rose)] transition-colors">
                <span className="text-2xl">📁</span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mt-2">Select Image / Video File</p>
              </div>

              <button
                onClick={sendPaidMedia}
                className="w-full py-4 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg"
              >
                Send Locked Payload
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProviderMessages;
