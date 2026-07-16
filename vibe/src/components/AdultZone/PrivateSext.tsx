import React from 'react';

const PrivateSext: React.FC = () => {
  const conversations = [
    { name: 'Elena Rose', preview: 'Did you see what I sent you? 😉', time: '2m', unread: 2, online: true },
    { name: 'Marcus Steel', preview: 'Can\'t wait for tonight...', time: '1h', unread: 0, online: true },
    { name: 'Siren00', preview: 'Unlock the photo to see more.', time: '5h', unread: 1, online: false },
    { name: 'VIP Hostess', preview: 'Welcome to your private lounge.', time: '1d', unread: 0, online: false },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex w-80 flex-col border-r border-[var(--az-border)] bg-[#070406]">
        <div className="p-6 border-b border-[var(--az-border)]">
          <h2 className="text-xl font-serif italic text-[var(--az-text-primary)]">Messages</h2>
        </div>
        <div className="flex-grow overflow-y-auto no-scrollbar">
          {conversations.map((c) => (
            <div key={c.name} className="p-4 flex gap-4 cursor-pointer hover:bg-[var(--az-bg-secondary)] transition-colors border-b border-[var(--az-border)]/50 group">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[var(--az-border)]">
                  <img src="/placeholder.svg" className="w-full h-full object-cover" />
                </div>
                {c.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#070406]" />}
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-sm text-[var(--az-text-primary)] truncate group-hover:text-[var(--az-accent-rose)]">{c.name}</h4>
                  <span className="text-[10px] text-[var(--az-text-muted)]">{c.time}</span>
                </div>
                <p className={`text-xs truncate ${c.unread ? 'text-[var(--az-text-primary)] font-bold' : 'text-[var(--az-text-secondary)]'}`}>
                  {c.preview}
                </p>
              </div>
              {c.unread > 0 && (
                <div className="flex-shrink-0 w-5 h-5 bg-[var(--az-accent-primary)] rounded-full flex items-center justify-center text-[10px] font-bold shadow-[0_0_8px_var(--az-glow)]">
                  {c.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow flex flex-col bg-[var(--az-bg-primary)]">
        {/* Chat Header */}
        <div className="p-4 az-glass border-b border-[var(--az-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--az-accent-rose)]">
              <img src="/placeholder.svg" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="font-bold text-[var(--az-text-primary)]">Elena Rose</h3>
              <span className="text-[10px] text-green-500 uppercase font-bold tracking-widest">Online Now</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button className="text-xl hover:scale-110 transition-transform">📹</button>
            <button className="text-xl hover:scale-110 transition-transform">💎</button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          <div className="flex flex-col items-end">
            <div className="bg-[var(--az-accent-primary)] text-white p-4 rounded-2xl rounded-tr-none max-w-xs shadow-lg">
              <p className="text-sm">Hey, I loved your last post. Can we talk in private?</p>
            </div>
            <span className="text-[10px] text-[var(--az-text-muted)] mt-2 font-mono uppercase">Seen 2:45 PM</span>
          </div>

          <div className="flex flex-col items-start">
            <div className="bg-[var(--az-bg-secondary)] text-[var(--az-text-primary)] p-4 rounded-2xl rounded-tl-none max-w-xs border border-[var(--az-border)] shadow-lg">
              <p className="text-sm">I'd love that. Here is a little something to get you started...</p>
            </div>
          </div>

          <div className="flex flex-col items-start">
            <div className="relative w-64 h-80 rounded-2xl overflow-hidden border border-[var(--az-border)] shadow-2xl group cursor-pointer">
              <img src="/placeholder.svg" className="w-full h-full object-cover filter blur-2xl transition-all group-hover:blur-xl" />
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center p-4">
                <span className="text-3xl mb-4">🔒</span>
                <p className="text-xs font-bold text-white mb-6 uppercase tracking-widest">Locked Media Content</p>
                <button className="px-6 py-2 bg-[var(--az-accent-gold)] text-black font-bold rounded-full text-[10px] uppercase tracking-widest shadow-[0_0_15px_var(--az-accent-gold)] active:scale-95 transition-all">
                  Unlock for 15💎
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-[var(--az-border)] az-glass">
          <div className="flex items-center gap-4 bg-[var(--az-bg-tertiary)] rounded-full px-6 py-2 border border-[var(--az-border)]">
            <button className="text-xl opacity-60 hover:opacity-100 transition-opacity">📸</button>
            <input
              type="text"
              placeholder="Send a naughty message..."
              className="flex-grow bg-transparent border-none outline-none text-sm text-[var(--az-text-primary)] py-2"
            />
            <button className="text-xl opacity-60 hover:opacity-100 transition-opacity">🎙️</button>
            <button className="w-8 h-8 bg-[var(--az-accent-primary)] rounded-full flex items-center justify-center text-white text-xs shadow-lg">
              →
            </button>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            <button className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] hover:text-[var(--az-accent-gold)] transition-colors">
              🎁 Send Gift
            </button>
            <button className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] hover:text-[var(--az-accent-rose)] transition-colors">
              📸 Request Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivateSext;
