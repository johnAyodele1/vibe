import React from 'react';

const NaughtyRooms: React.FC = () => {
  const categories = ['🔥 Hot', '💋 Romance', '🎭 Roleplay', '👥 Group', '🌶️ Spicy', '🌈 LGBTQ+'];

  const rooms = [
    { name: 'After Dark Lounge', description: 'Classy conversation and casual vibes', users: 245, tag: 'Chill', color: 'border-blue-500/30' },
    { name: 'The Red Room', description: 'High intensity, explicit roleplay only', users: 890, tag: 'Wild', color: 'border-red-500/50' },
    { name: 'Fantasy Forest', description: 'Themed scenarios and storytelling', users: 120, tag: 'Explicit', color: 'border-purple-500/30' },
    { name: 'Midnight Desires', description: 'Open sharing and media exchange', users: 560, tag: 'Wild', color: 'border-pink-500/40' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex flex-wrap gap-2 mb-10">
        {categories.map((c) => (
          <button key={c} className="px-5 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-full text-xs font-bold text-[var(--az-text-secondary)] hover:border-[var(--az-accent-rose)] transition-colors">
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rooms.map((room) => (
          <div key={room.name} className={`p-8 bg-[var(--az-bg-secondary)] rounded-2xl border-2 ${room.color} az-card-hover group`}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                  room.tag === 'Wild' ? 'bg-[var(--az-accent-primary)] text-white' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)]'
                }`}>
                  {room.tag}
                </span>
                <h3 className="text-3xl font-serif italic text-[var(--az-text-primary)] mt-3 group-hover:text-[var(--az-accent-rose)] transition-colors">
                  {room.name}
                </h3>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex -space-x-2 mb-2">
                  {[
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=100&auto=format&fit=crop",
                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop"
                  ].map((url, index) => (
                    <div key={index} className="w-8 h-8 rounded-full border-2 border-[var(--az-bg-secondary)] bg-gray-800 overflow-hidden">
                      <img src={url} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--az-bg-secondary)] bg-[var(--az-bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--az-text-secondary)]">
                    +
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[var(--az-text-secondary)] font-bold">
                  {room.users} MEMBERS ONLINE
                </span>
              </div>
            </div>

            <p className="text-[var(--az-text-secondary)] font-serif italic mb-8 border-l-2 border-[var(--az-border)] pl-4">
              "{room.description}"
            </p>

            <button className="w-full py-4 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-accent-primary)] text-[var(--az-text-primary)] font-bold uppercase tracking-widest rounded-xl transition-all border border-[var(--az-border)] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              Join Room
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NaughtyRooms;
