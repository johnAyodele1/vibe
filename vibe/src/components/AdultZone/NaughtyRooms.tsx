import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';

// ============================================================================
// MAIN NAUGHTY ROOMS SYSTEM COMPONENT
// ============================================================================

const NaughtyRooms: React.FC = () => {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAdultAuth();

  // Authentication token
  const token = localStorage.getItem('adultAccessToken') || '';

  // API Request Headers
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  });

  // State
  const [rooms, setRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('🔥 All');

  // Room Creation Modal States
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newRoomCategory, setNewRoomCategory] = useState('💋 Casual');
  const [newRoomMood, setNewRoomMood] = useState('chill');
  const [submittingRoom, setSubmittingRoom] = useState(false);

  // Categories defined in spec
  const categories = [
    '🔥 All',
    '💋 Casual',
    '🎭 Roleplay',
    '👥 Group Fantasy',
    '🌈 LGBTQ+',
    '🌶️ Spicy',
    '⭐ VIP Exclusive'
  ];

  const handleCreateRoomClick = () => {
    if (!currentUser) {
      toast.error('You must be logged in to create a room');
      return;
    }
    let initialCategory = categoryFilter;
    if (initialCategory === '🔥 All') {
      initialCategory = '💋 Casual';
    }
    setNewRoomCategory(initialCategory);
    setIsCreateRoomModalOpen(true);
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      toast.error('Room name is required');
      return;
    }

    // Curate beautiful coverGradients & icons matching category/mood for high fidelity
    let coverGradient = ['#c8102e', '#0a0608'];
    let icon = '🌶️';

    const catLower = newRoomCategory.toLowerCase();

    if (catLower.includes('casual')) {
      coverGradient = ['#12080a', '#1a090d'];
      icon = '🍸';
    } else if (catLower.includes('roleplay')) {
      coverGradient = ['#2d090d', '#100304'];
      icon = '💋';
    } else if (catLower.includes('group fantasy')) {
      coverGradient = ['#092315', '#030d07'];
      icon = '🌲';
    } else if (catLower.includes('lgbtq')) {
      coverGradient = ['#1e0a2d', '#080310'];
      icon = '🌈';
    } else if (catLower.includes('spicy')) {
      coverGradient = ['#1b092a', '#0a0310'];
      icon = '😈';
    } else if (catLower.includes('vip')) {
      coverGradient = ['#1a1105', '#0a0702'];
      icon = '⭐';
    }

    try {
      setSubmittingRoom(true);
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newRoomName,
          description: newRoomDescription,
          category: newRoomCategory,
          mood: newRoomMood,
          tags: [],
          coverGradient,
          icon,
          rules: [
            'No real contact info sharing.',
            'Explicit content allowed — respect others.',
            'No hate speech or discrimination.'
          ],
          requiresSubscription: newRoomCategory === '⭐ VIP Exclusive'
        }),
      });

      const data = await response.json();
      if (data.success && data.data?.room) {
        toast.success(`Room "${data.data.room.name}" created successfully!`);
        setIsCreateRoomModalOpen(false);
        setNewRoomName('');
        setNewRoomDescription('');
        handleJoinEnterRoom(data.data.room);
      } else {
        toast.error(data.error?.message || 'Failed to create room');
      }
    } catch (err) {
      console.error('Error creating room:', err);
      toast.error('Error creating room');
    } finally {
      setSubmittingRoom(false);
    }
  };

  // --------------------------------------------------------------------------
  // Fetch Rooms
  // --------------------------------------------------------------------------
  const fetchRoomsList = async () => {
    try {
      setLoadingRooms(true);
      let urlStr = `${API_BASE_URL}/v1/adult/rooms`;
      const params = [];
      if (categoryFilter !== '🔥 All') {
        params.push(`category=${encodeURIComponent(categoryFilter)}`);
      }
      if (params.length > 0) {
        urlStr += `?${params.join('&')}`;
      }

      const response = await fetch(urlStr, {
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success && data.data?.rooms) {
        setRooms(data.data.rooms);
      } else {
        setRooms([]);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (!roomId) {
      fetchRoomsList();
    }
  }, [roomId, categoryFilter]);

  // --------------------------------------------------------------------------
  // Join Room Redirect / Trigger
  // --------------------------------------------------------------------------
  const handleJoinEnterRoom = async (room: any) => {
    if (!currentUser) {
      toast.error('You must be logged in to join Naughty Rooms');
      return;
    }

    // VIP upgrade trigger
    if (room.requiresSubscription && currentUser.role === 'user' && (!currentUser.credits || currentUser.credits < 10)) {
      // Mock validation / tier subscription check as per spec "lock icon 🔒 and Gold+ text instead"
      toast.error('Gold+ subscription required to enter this VIP room! Please upgrade.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${room._id}/join`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Welcome to ${room.name}!`);
        navigate(`/rooms/${room._id}`);
      } else {
        toast.error(data.error?.message || 'Failed to join room');
      }
    } catch (err) {
      console.error('Error joining room:', err);
      toast.error('Error joining room');
    }
  };

  // Socket listener for real-time live memberCounts on cards
  useEffect(() => {
    if (roomId) return; // Only for Rooms Landing Cards page

    const socketUrl = SOCKET_URL || window.location.origin;
    const socketInstance = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('Landing Rooms Socket Connected for real-time counts');
      // Briefly listen / join standard rooms if needed, or rely on active socket emissions
    });

    socketInstance.on('room:member_count', (data: { count: number; roomId?: string }) => {
      // If server sends roomId, update that specific room's count
      if (data?.roomId) {
        setRooms(prev => prev.map(r => r._id === data.roomId ? { ...r, memberCount: data.count } : r));
      }
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId]);

  // --------------------------------------------------------------------------
  // RENDER VIEW CHANGER
  // --------------------------------------------------------------------------
  if (roomId) {
    return <RoomHub roomId={roomId} getHeaders={getHeaders} currentUser={currentUser} token={token} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl md:text-5xl font-serif italic text-[var(--az-text-primary)] mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Naughty Rooms
        </h1>
        <p className="text-sm text-[var(--az-text-secondary)]">
          Find your vibe. Join the conversation.
        </p>
      </div>

      {/* Category filters (horizontal scroll) */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-10 no-scrollbar scroll-smooth">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
              categoryFilter === c
                ? 'bg-[var(--az-accent-primary)] border-transparent text-white shadow-[0_0_12px_var(--az-glow)]'
                : 'bg-[var(--az-bg-secondary)] border-[var(--az-border)] text-[var(--az-text-secondary)] hover:border-[var(--az-accent-rose)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid of rooms */}
      {loadingRooms ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-64 bg-[var(--az-bg-secondary)] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-6xl mb-4">😈</span>
          <h3 className="text-xl font-serif italic text-[var(--az-text-primary)] mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            No rooms match your vibe right now
          </h3>
          <p className="text-sm text-[var(--az-text-secondary)] mb-6">
            Try a different category or create your own room to start the conversation!
          </p>
          <button
            onClick={handleCreateRoomClick}
            className="px-6 py-2.5 bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:scale-105 active:scale-95 transition-all"
          >
            Create a Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => {
            const hasAccess = !room.requiresSubscription || (currentUser && currentUser.credits >= 10);
            const coverGrad = room.coverGradient && room.coverGradient.length >= 2
              ? `linear-gradient(135deg, ${room.coverGradient[0]} 0%, ${room.coverGradient[1]} 100%)`
              : 'linear-gradient(135deg, #c8102e 0%, #0a0608 100%)';

            return (
              <div
                key={room._id}
                className="relative p-6 rounded-2xl border border-[var(--az-border)] overflow-hidden transition-all duration-300 group hover:-translate-y-1 hover:border-[var(--az-accent-rose)] hover:shadow-[0_0_24px_rgba(200,16,46,0.2)]"
                style={{
                  background: coverGrad,
                }}
              >
                {/* 8% grain texture overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=400')]" />

                {/* Shimmer effect border on card hover */}
                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-r from-transparent via-white to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    {/* Top row */}
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{room.icon || '🔴'}</span>
                        <h3 className="text-xl font-serif font-bold text-white leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
                          {room.name}
                        </h3>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                        room.mood === 'explicit'
                          ? 'bg-red-600/80 text-white shadow-[0_0_8px_rgba(220,38,38,0.5)]'
                          : room.mood === 'wild'
                            ? 'bg-amber-600/80 text-white'
                            : 'bg-teal-600/80 text-white'
                      }`}>
                        {room.mood || 'Chill'}
                      </span>
                    </div>

                    {/* Room Description */}
                    <p className="text-xs text-gray-300 font-sans line-clamp-2 mb-6 min-h-[32px]">
                      {room.description || 'Welcome to this interactive Adult Naughty Room! Join to start chatting.'}
                    </p>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-end justify-between border-t border-white/10 pt-4">
                    <div>
                      {/* LIVE counting up pulsing indicator */}
                      <div className="flex items-center gap-2 mb-2 text-white">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#f00]" />
                        <span className="text-[10px] font-mono font-bold tracking-wider">
                          {(room.memberCount || 0).toLocaleString()} ONLINE
                        </span>
                      </div>

                      {/* Stacked avatars */}
                      <div className="flex -space-x-2">
                        {[
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop',
                          'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=100&auto=format&fit=crop',
                          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop',
                        ].map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            className="w-6 h-6 rounded-full border border-gray-900 object-cover"
                            alt="Active user"
                          />
                        ))}
                        <div className="w-6 h-6 rounded-full bg-black/60 border border-gray-900 flex items-center justify-center text-[8px] text-gray-300 font-bold">
                          +{room.memberCount > 3 ? room.memberCount - 3 : 2}
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    <div>
                      {!hasAccess ? (
                        <button
                          onClick={() => handleJoinEnterRoom(room)}
                          className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-black text-xs font-bold rounded-full flex items-center gap-1 shadow-lg"
                        >
                          🔒 Gold+
                        </button>
                      ) : (
                        <button
                          onClick={() => handleJoinEnterRoom(room)}
                          className="px-5 py-2.5 rounded-full bg-transparent hover:bg-white hover:text-black border border-white text-white text-xs font-bold tracking-widest uppercase transition-all shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                        >
                          Enter Room
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ROOM MODAL */}
      {isCreateRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#180a0e] border border-[var(--az-border)] rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-5">
              <h3 className="text-lg font-serif italic text-white font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
                Create a Naughty Room
              </h3>
              <button onClick={() => setIsCreateRoomModalOpen(false)} className="text-gray-500 hover:text-white text-base">✕</button>
            </div>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Room Name (required)
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  maxLength={50}
                  required
                  placeholder="e.g. Secret Desires, Late Night Whispers..."
                  className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Description
                </label>
                <textarea
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="Tell people what your room is about..."
                  className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)] resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Category
                  </label>
                  <select
                    value={newRoomCategory}
                    onChange={(e) => setNewRoomCategory(e.target.value)}
                    className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[var(--az-accent-rose)]"
                  >
                    {categories.filter(c => c !== '🔥 All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                    Vibe Mood
                  </label>
                  <select
                    value={newRoomMood}
                    onChange={(e) => setNewRoomMood(e.target.value)}
                    className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[var(--az-accent-rose)]"
                  >
                    <option value="chill">Chill</option>
                    <option value="wild">Wild</option>
                    <option value="explicit">Explicit</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submittingRoom || !newRoomName.trim()}
                className="w-full py-3 bg-[var(--az-accent-primary)] hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg mt-4"
              >
                {submittingRoom ? 'Creating Room...' : 'Create and Join Room'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ROOM HUB LAYOUT VIEW (IN-ROOM CONTEXT)
// ============================================================================

interface InRoomProps {
  roomId: string;
  getHeaders: () => any;
  currentUser: any;
  token: string;
}

const RoomHub: React.FC<InRoomProps> = ({ roomId, getHeaders, currentUser, token }) => {
  const navigate = useNavigate();

  // Socket state
  const socketRef = useRef<Socket | null>(null);

  // Core States
  const [room, setRoom] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'threads' | 'media' | 'poll' | 'members'>('feed');

  // Desktop panels toggles / bottom drawers
  const [isRulesCollapsed, setIsRulesCollapsed] = useState(false);
  const [isWhoHereOpen, setIsWhoHereOpen] = useState(false);
  const [isPollWidgetOpen, setIsPollWidgetOpen] = useState(false);

  // Live count
  const [liveCount, setLiveCount] = useState(0);

  // Initialize Room Details & Socket
  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}`, { headers: getHeaders() });
        const data = await response.json();
        if (data.success && data.data?.room) {
          setRoom(data.data.room);
          setLiveCount(data.data.room.memberCount || 0);
        }
      } catch (err) {
        console.error('Failed to load room details:', err);
      }
    };
    fetchRoomDetails();

    // Establish Socket Connection
    const socketUrl = SOCKET_URL || window.location.origin;
    const socketInstance = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log(`Connected to room:${roomId} socket`);
      socketInstance.emit('room:join', { roomId });
    });

    // Listeners for live user count and status updates
    socketInstance.on('room:member_count', (data: { count: number }) => {
      if (data) {
        // scale animation trigger can be handled locally
        setLiveCount(data.count);
      }
    });

    return () => {
      socketInstance.emit('room:leave', { roomId });
      socketInstance.disconnect();
    };
  }, [roomId]);

  // Leave room call
  const handleLeaveRoomAction = async () => {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: getHeaders(),
      });
      toast.info('You have left the room.');
      navigate('/rooms');
    } catch (err) {
      console.error(err);
      navigate('/rooms');
    }
  };

  if (!room) {
    return (
      <div className="flex h-[70vh] items-center justify-center bg-transparent">
        <div className="w-10 h-10 border-4 border-[var(--az-accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Stick Compact Room Header */}
      <div className="sticky top-0 z-30 bg-[#12080a]/90 backdrop-blur-md border border-[var(--az-border)] p-4 rounded-xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeaveRoomAction}
            className="p-2 bg-[var(--az-bg-secondary)] hover:bg-[var(--az-bg-tertiary)] rounded-full text-white transition-colors"
            title="Leave Room"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{room.icon || '🔴'}</span>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                {room.name}
              </h2>
              <span className="text-[9px] font-bold bg-crimson text-white px-2 py-0.5 rounded uppercase tracking-wider bg-red-600">
                {room.mood}
              </span>
            </div>
            <p className="text-xs text-[var(--az-text-secondary)] line-clamp-1 max-w-xl">
              {room.description}
            </p>
          </div>
        </div>

        {/* Live Counters & Quick Drawer Icons (Mobile) */}
        <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-0 border-white/5 pt-2 md:pt-0">
          <div className="flex items-center gap-2 text-white">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#f00]" />
            <span className="text-xs font-mono font-bold">{liveCount} ONLINE</span>
          </div>

          {/* Quick Drawer triggers for mobile */}
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              onClick={() => setIsWhoHereOpen(true)}
              className="p-2 bg-[var(--az-bg-secondary)] rounded-lg text-xs font-bold text-gray-300"
              title="Who's here"
            >
              👥 members
            </button>
            <button
              onClick={() => setIsPollWidgetOpen(true)}
              className="p-2 bg-[var(--az-bg-secondary)] rounded-lg text-xs font-bold text-gray-300"
              title="Polls"
            >
              📊 polls
            </button>
          </div>
        </div>
      </div>

      {/* Tabs list (Sticky & full screen mobile horizontal scroll) */}
      <div className="flex gap-2 border-b border-[var(--az-border)] pb-3 mb-6 overflow-x-auto no-scrollbar">
        {[
          { id: 'feed', label: '💬 Feed' },
          { id: 'threads', label: '🧵 Threads' },
          { id: 'media', label: '📷 Media' },
          { id: 'poll', label: '📊 Room Poll' },
          { id: 'members', label: '👥 Members' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === t.id
                ? 'bg-[var(--az-bg-secondary)] text-[var(--az-accent-rose)] border-b-2 border-[var(--az-accent-rose)]'
                : 'text-[var(--az-text-secondary)] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Grid: LEFT Chat/Feeds Tab + RIGHT Desktop Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* LEFT COLUMN - Tab Content */}
        <div className="lg:col-span-7 flex flex-col min-h-[60vh]">
          {activeTab === 'feed' && <MessageFeed roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} currentUser={currentUser} />}
          {activeTab === 'threads' && <ThreadSection roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} currentUser={currentUser} />}
          {activeTab === 'media' && <MediaGallery roomId={roomId} getHeaders={getHeaders} />}
          {activeTab === 'poll' && <PollWidget roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} currentUser={currentUser} />}
          {activeTab === 'members' && <MembersList roomId={roomId} getHeaders={getHeaders} />}
        </div>

        {/* RIGHT COLUMN - Desktop Panels */}
        <div className="hidden lg:col-span-3 lg:flex flex-col gap-6">
          {/* Who's Here Panel */}
          <WhoHereSidebar roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} />

          {/* Mini Active Poll Widget */}
          <MiniPollSidebar roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} currentUser={currentUser} />

          {/* Session Leaderboard */}
          <LeaderboardSidebar roomId={roomId} getHeaders={getHeaders} />

          {/* Rules Panel */}
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-4">
            <div className="flex justify-between items-center mb-3 cursor-pointer" onClick={() => setIsRulesCollapsed(!isRulesCollapsed)}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--az-accent-rose)]">📋 Room Rules</h3>
              <span>{isRulesCollapsed ? '▼' : '▲'}</span>
            </div>
            {!isRulesCollapsed && (
              <ul className="text-xs text-[var(--az-text-secondary)] space-y-2 font-serif italic list-decimal pl-4">
                {room.rules && room.rules.length > 0 ? (
                  room.rules.map((rule: string, i: number) => <li key={i}>{rule}</li>)
                ) : (
                  <>
                    <li>No real contact info sharing.</li>
                    <li>Explicit content allowed — respect others.</li>
                    <li>No hate speech or discrimination.</li>
                    <li>Moderators have final say.</li>
                    <li>Report, don't retaliate.</li>
                  </>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* DRAWERS FOR MOBILE CLIENTS */}
      {isWhoHereOpen && (
        <MobileDrawer onClose={() => setIsWhoHereOpen(false)} title="In This Room">
          <WhoHereSidebar roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} />
        </MobileDrawer>
      )}
      {isPollWidgetOpen && (
        <MobileDrawer onClose={() => setIsPollWidgetOpen(false)} title="📊 Room Poll">
          <PollWidget roomId={roomId} socket={socketRef.current} getHeaders={getHeaders} currentUser={currentUser} />
        </MobileDrawer>
      )}
    </div>
  );
};

// ============================================================================
// MOBILE DRAWER COMPONENT Helper
// ============================================================================

interface DrawerProps {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const MobileDrawer: React.FC<DrawerProps> = ({ onClose, title, children }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 md:hidden">
      <div className="h-2/3 bg-[#12080a] border-t border-[var(--az-border)] rounded-t-2xl p-4 flex flex-col">
        <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-4">
          <h3 className="font-serif italic text-white text-lg">{title}</h3>
          <button onClick={onClose} className="p-2 text-white font-bold text-sm">Close ✕</button>
        </div>
        <div className="flex-grow overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// LIVE MESSAGE FEED COMPONENT (SUB-COMPONENT FEED TAB)
// ============================================================================

interface FeedProps {
  roomId: string;
  socket: Socket | null;
  getHeaders: () => any;
  currentUser: any;
}

const MessageFeed: React.FC<FeedProps> = ({ roomId, socket, getHeaders, currentUser }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ userId: string; displayName: string }[]>([]);

  // Refs for scrolling and lazy batching
  const feedEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollUpButton, setShowScrollUpButton] = useState(false);
  const [unreadNewMessagesCount, setUnreadNewMessagesCount] = useState(0);

  // Buffering / batching window for socket messages
  const messageBufferRef = useRef<any[]>([]);
  const batchTimeoutRef = useRef<any | null>(null);

  // Floating Reaction message ID state
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  // Quoted reply message state
  const [replyingToMessage, setReplyingToMessage] = useState<any | null>(null);

  // Debounced typing emmiter state
  const lastTypingTimeRef = useRef<number>(0);

  // Load Initial Messages (cursor pagination simple style)
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/messages?limit=50`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        if (data.success && data.data?.messages) {
          setMessages(data.data.messages);
          scrollToBottomInstant();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [roomId]);

  // Handle Socket events
  useEffect(() => {
    if (!socket) return;

    // Throttled / batched message handling (200ms batch)
    const processBatch = () => {
      if (messageBufferRef.current.length > 0) {
        const buffered = [...messageBufferRef.current];
        messageBufferRef.current = [];

        setMessages((prev) => {
          // Filter duplicates just in case
          const prevIds = new Set(prev.map(m => m._id));
          const toAdd = buffered.filter(b => !prevIds.has(b._id));
          return [...prev, ...toAdd];
        });

        // Auto-scroll helper or show alert pill
        const isUserScrolledUp = checkIsScrolledUp();
        if (isUserScrolledUp) {
          setUnreadNewMessagesCount(prev => prev + buffered.length);
        } else {
          scrollToBottomSmooth();
        }
      }
      batchTimeoutRef.current = null;
    };

    socket.on('room:new_message', (data: { message: any }) => {
      if (data?.message) {
        // Buffer
        messageBufferRef.current.push(data.message);
        if (!batchTimeoutRef.current) {
          batchTimeoutRef.current = setTimeout(processBatch, 200);
        }
      }
    });

    socket.on('room:message_deleted', (data: { messageId: string }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, content: '[deleted]', isDeleted: true } : m));
    });

    socket.on('room:message_reacted', (data: { messageId: string; reactions: any[] }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
    });

    // Typing alerts
    socket.on('room:typing', (data: { userId: string; displayName: string }) => {
      if (data?.userId === currentUser?.id || data?.userId === currentUser?._id) return;
      setTypingUsers(prev => {
        if (prev.some(u => u.userId === data.userId)) return prev;
        return [...prev, data];
      });

      // Clear after 3 seconds of inactivity
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
      }, 3000);
    });

    return () => {
      socket.off('room:new_message');
      socket.off('room:message_deleted');
      socket.off('room:message_reacted');
      socket.off('room:typing');
      if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
    };
  }, [socket]);

  // Scroll detection helpers
  const checkIsScrolledUp = () => {
    const el = scrollContainerRef.current;
    if (!el) return false;
    const threshold = 150; // pixels
    return el.scrollHeight - el.scrollTop - el.clientHeight > threshold;
  };

  const handleScrollEvent = () => {
    const isUp = checkIsScrolledUp();
    setShowScrollUpButton(isUp);
    if (!isUp) {
      setUnreadNewMessagesCount(0);
    }
  };

  const scrollToBottomInstant = () => {
    setTimeout(() => {
      if (feedEndRef.current) {
        feedEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    }, 100);
  };

  const scrollToBottomSmooth = () => {
    setTimeout(() => {
      if (feedEndRef.current) {
        feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  // --------------------------------------------------------------------------
  // Send Message Logic (includes Optimistic Rendering)
  // --------------------------------------------------------------------------
  const handleSendMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const bodyText = inputText;
    setInputText('');

    // Generate optimistic message representation
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      roomId,
      threadId: null,
      senderId: currentUser?._id || currentUser?.id,
      senderName: currentUser?.displayName || currentUser?.username || 'You',
      senderAvatarUrl: currentUser?.profilePhoto || '/placeholder.svg',
      senderBadge: currentUser?.subscriptionTier !== 'none' ? 'Gold' : null,
      content: bodyText,
      mediaUrl: null,
      reactions: [],
      isPinned: false,
      isDeleted: false,
      createdAt: new Date(),
    };

    // Render optimistically
    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottomSmooth();

    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          content: bodyText,
          replyToMessageId: replyingToMessage?._id || null,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        // Rollback on failure
        setMessages((prev) => prev.filter(m => m._id !== tempId));
        toast.error(data.error?.message || 'Failed to send message');
      } else {
        // Replace optimistic ID with the actual saved model
        setMessages((prev) => prev.map(m => m._id === tempId ? data.data.message : m));
        setReplyingToMessage(null);
      }
    } catch (err) {
      console.error(err);
      // Rollback
      setMessages((prev) => prev.filter(m => m._id !== tempId));
      toast.error('Network error. Failed to send message.');
    }
  };

  // Typing debounce emitter
  const handleInputTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingTimeRef.current > 2000) {
      lastTypingTimeRef.current = now;
      socket.emit('room:typing', { roomId });
    }
  };

  // React to own or other message
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    setActiveReactionPickerId(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/messages/${messageId}/react`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji }),
      });
      const data = await response.json();
      if (!data.success) {
        toast.error('Could not react to message');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete message (soft)
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Message deleted');
      } else {
        toast.error('Failed to delete message');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col flex-grow bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl h-[65vh] overflow-hidden relative">
      {/* Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollEvent}
        className="flex-grow p-4 overflow-y-auto space-y-4 no-scrollbar"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs text-gray-500 italic">Entering feed conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <span className="text-4xl mb-2">💬</span>
            <p className="text-sm font-serif italic text-gray-400">Main Feed is currently quiet.</p>
            <p className="text-[10px] text-gray-500">Be the first to say something hot below!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === currentUser?.id || msg.senderId === currentUser?._id;
            const isMod = currentUser?.role === 'provider'; // Providers behave like mod/hosts

            return (
              <div
                key={msg._id}
                className="flex items-start gap-3 group relative hover:bg-white/[0.02] p-2 rounded-lg transition-all animate-[slideIn_0.2s_ease-out]"
              >
                <img
                  src={msg.senderAvatarUrl || '/placeholder.svg'}
                  className="w-8 h-8 rounded-full object-cover border border-white/10"
                  alt="Sender"
                />

                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-300 font-serif italic">{msg.senderName}</span>
                    {msg.senderBadge && (
                      <span className="text-[8px] font-bold bg-amber-500 text-black px-1.5 py-0.5 rounded">
                        {msg.senderBadge}
                      </span>
                    )}
                    <span className="text-[9px] text-gray-500">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Message Bubble text content */}
                  <div className={`text-xs ${msg.isDeleted ? 'text-gray-500 italic' : 'text-gray-300'}`}>
                    {msg.content}
                  </div>

                  {/* Reaction chips below bubble */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.reactions.map((r: any) => {
                        const hasReacted = r.userIds.some((id: string) => id === currentUser?.id || id === currentUser?._id);
                        return (
                          <button
                            key={r.emoji}
                            onClick={() => handleReactToMessage(msg._id, r.emoji)}
                            className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 border transition-all ${
                              hasReacted
                                ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 animate-[bounce_0.3s_ease-out]'
                                : 'bg-black/40 border-white/5 text-gray-400 hover:border-white/10'
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Floating controls on hover (Desktop) */}
                <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1.5 bg-[#1a0c10] border border-white/5 rounded-lg px-2 py-1 shadow-lg">
                  <button
                    onClick={() => setActiveReactionPickerId(msg._id)}
                    className="text-xs hover:scale-125 transition-transform"
                    title="Add reaction"
                  >
                    🔥
                  </button>
                  <button
                    onClick={() => setReplyingToMessage(msg)}
                    className="text-[10px] text-gray-400 hover:text-white"
                  >
                    Reply
                  </button>
                  {(isOwn || isMod) && (
                    <button
                      onClick={() => handleDeleteMessage(msg._id)}
                      className="text-[10px] text-red-500 hover:text-red-400 ml-1"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Popover Emoji Picker */}
                {activeReactionPickerId === msg._id && (
                  <div className="absolute right-2 top-10 z-40 bg-[#1e0e12] border border-[var(--az-border)] rounded-full px-3 py-1.5 flex gap-2 shadow-2xl animate-[bounce_0.2s_ease-out]">
                    {['🔥', '💋', '❤️', '😈', '⭐'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReactToMessage(msg._id, emoji)}
                        className="text-base hover:scale-150 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setActiveReactionPickerId(null)}
                      className="text-[10px] text-gray-500 pl-1 border-l border-white/5"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Floating Scroll helpers */}
      {showScrollUpButton && (
        <button
          onClick={scrollToBottomSmooth}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg hover:scale-105 transition-all flex items-center gap-1.5 z-20"
        >
          {unreadNewMessagesCount > 0 ? (
            <span>⚡ {unreadNewMessagesCount} NEW MESSAGES BELOW</span>
          ) : (
            <span>⇣ SCROLL TO BOTTOM</span>
          )}
        </button>
      )}

      {/* Typing Indicator dots */}
      {typingUsers.length > 0 && (
        <div className="p-3 bg-black/40 border-t border-white/5 flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {typingUsers.slice(0, 3).map((_, idx) => (
              <div key={idx} className="w-5 h-5 rounded-full bg-rose-900 border border-black flex items-center justify-center text-[8px] text-white">
                💬
              </div>
            ))}
          </div>
          <span className="text-[10px] text-gray-400 italic">
            {typingUsers.length === 1
              ? `${typingUsers[0].displayName} is writing...`
              : `${typingUsers[0].displayName} and ${typingUsers.length - 1} other are writing...`}
          </span>
          <div className="flex gap-1 items-center pl-1">
            <span className="w-1 h-1 rounded-full bg-rose-500 animate-[bounce_0.8s_infinite]" />
            <span className="w-1 h-1 rounded-full bg-rose-500 animate-[bounce_0.8s_infinite_150ms]" />
            <span className="w-1 h-1 rounded-full bg-rose-500 animate-[bounce_0.8s_infinite_300ms]" />
          </div>
        </div>
      )}

      {/* Message input area */}
      <form onSubmit={handleSendMessageSubmit} className="bg-black/60 border-t border-[var(--az-border)] p-3 space-y-2">
        {replyingToMessage && (
          <div className="flex justify-between items-center bg-rose-950/40 border-l-2 border-rose-500 px-3 py-1.5 rounded text-[10px]">
            <span className="text-rose-300">Replying to {replyingToMessage.senderName}: "{replyingToMessage.content.slice(0, 40)}..."</span>
            <button onClick={() => setReplyingToMessage(null)} className="text-gray-500 hover:text-white">✕</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Action icon shortcuts */}
          <div className="flex gap-1 text-sm bg-[var(--az-bg-secondary)] px-2.5 py-1.5 rounded-lg border border-white/5">
            <button type="button" onClick={() => setInputText(prev => prev + '🔥')} title="Hot">🔥</button>
            <button type="button" onClick={() => setInputText(prev => prev + '💋')} title="Kiss">💋</button>
            <button type="button" onClick={() => setInputText(prev => prev + '😈')} title="Devil">😈</button>
          </div>

          <input
            type="text"
            value={inputText}
            onChange={handleInputTextChange}
            placeholder="Type your message..."
            maxLength={500}
            className="flex-grow bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[var(--az-accent-rose)] focus:ring-1 focus:ring-[var(--az-accent-rose)]"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-5 py-2.5 bg-[var(--az-accent-primary)] hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase rounded-xl transition-all shadow-[0_0_12px_var(--az-glow)]"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

// ============================================================================
// ORGANIZED TOPIC-BASED THREADS TAB
// ============================================================================

interface ThreadProps {
  roomId: string;
  socket: Socket | null;
  getHeaders: () => any;
  currentUser: any;
}

const ThreadSection: React.FC<ThreadProps> = ({ roomId, socket, getHeaders, currentUser }) => {
  const [threads, setThreads] = useState<any[]>([]);
  const [activeSort, setActiveSort] = useState<'hot' | 'new' | 'top'>('hot');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Thread inputs
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newMedia, setNewBodyMedia] = useState('');
  const [submittingThread, setSubmittingThread] = useState(false);

  // Active opened thread details panel state (View 3)
  const [openedThreadId, setOpenedThreadId] = useState<string | null>(null);

  // Fetch threads list
  const fetchThreads = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads?sort=${activeSort}`, {
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success && data.data?.threads) {
        setThreads(data.data.threads);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!openedThreadId) {
      fetchThreads();
    }
  }, [roomId, activeSort, openedThreadId]);

  // Handle Thread updates from Socket inside Thread Section
  useEffect(() => {
    if (!socket) return;

    socket.on('room:thread_created', (data: { thread: any }) => {
      if (data?.thread) {
        setThreads(prev => [data.thread, ...prev]);
        toast.info(`New thread posted: "${data.thread.title}"`);
      }
    });

    socket.on('room:thread_updated', (data: { threadId: string; replyCount: number; lastReplyAt: Date; lastReplyAuthor: string; reactionCounts: any }) => {
      setThreads(prev => prev.map(t => t._id === data.threadId ? {
        ...t,
        replyCount: data.replyCount,
        lastReplyAt: data.lastReplyAt,
        lastReplyAuthor: data.lastReplyAuthor,
        reactionCounts: data.reactionCounts || t.reactionCounts
      } : t));
    });

    socket.on('room:thread_pinned', (data: { threadId: string; isPinned: boolean }) => {
      setThreads(prev => prev.map(t => t._id === data.threadId ? { ...t, isPinned: data.isPinned } : t));
    });

    return () => {
      socket.off('room:thread_created');
      socket.off('room:thread_updated');
      socket.off('room:thread_pinned');
    };
  }, [socket]);

  // Create thread submission
  const handleCreateThreadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error('Title and Post Body content are required.');
      return;
    }

    try {
      setSubmittingThread(true);
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          title: newTitle,
          body: newBody,
          mediaUrl: newMedia || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Successfully started thread!');
        setIsModalOpen(false);
        setNewTitle('');
        setNewBody('');
        setNewBodyMedia('');
        fetchThreads();
      } else {
        toast.error(data.error?.message || 'Failed to create thread');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error. Could not post thread.');
    } finally {
      setSubmittingThread(false);
    }
  };

  // Toggle react thread directly from card list
  const handleReactThreadCard = async (threadId: string, emoji: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/react`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji }),
      });
      const data = await response.json();
      if (data.success) {
        setThreads(prev => prev.map(t => t._id === threadId ? data.data.thread : t));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER VIEW 3 (THREAD DETAIL CONTEXT PANEL)
  // --------------------------------------------------------------------------
  if (openedThreadId) {
    return <ThreadDetail threadId={openedThreadId} roomId={roomId} onBack={() => setOpenedThreadId(null)} getHeaders={getHeaders} currentUser={currentUser} socket={socket} />;
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Sticky sorted/filtering headers */}
      <div className="flex justify-between items-center bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-3">
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg">
          {[
            { id: 'hot', label: '🔥 Hot' },
            { id: 'new', label: '🆕 New' },
            { id: 'top', label: '⭐ Top' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSort(s.id as any)}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                activeSort === s.id
                  ? 'bg-rose-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-md transition-all"
        >
          + New Thread
        </button>
      </div>

      {/* Threads List vertical stack */}
      <div className="space-y-4">
        {threads.length === 0 ? (
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-10 text-center">
            <span className="text-4xl mb-2">🧵</span>
            <p className="text-sm font-serif italic text-gray-400 mb-1">No conversation threads here yet.</p>
            <p className="text-xs text-gray-500 mb-4">Start a roleplay scenario or casual prompt now!</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg"
            >
              Start First Thread
            </button>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread._id}
              className={`bg-[var(--az-bg-secondary)] border ${
                thread.isPinned ? 'border-amber-500/40' : 'border-[var(--az-border)]'
              } rounded-2xl p-5 hover:border-[var(--az-accent-rose)] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 relative cursor-pointer`}
              onClick={() => setOpenedThreadId(thread._id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <img
                    src={thread.authorAvatarUrl || '/placeholder.svg'}
                    className="w-6 h-6 rounded-full object-cover"
                    alt="Author"
                  />
                  <span className="text-xs font-bold text-gray-300 font-serif italic">{thread.authorName}</span>
                  <span className="text-[9px] text-gray-500">
                    {new Date(thread.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {thread.isPinned && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1 animate-pulse">
                    📌 Pinned
                  </span>
                )}
              </div>

              <h4 className="text-sm md:text-base font-serif font-bold text-white mb-2 leading-snug">
                {thread.title}
              </h4>
              <p className="text-xs text-gray-400 font-sans line-clamp-2 mb-4 leading-relaxed">
                {thread.body}
              </p>

              {/* Reaction indicators */}
              <div className="flex flex-wrap gap-1.5 mb-4" onClick={(e) => e.stopPropagation()}>
                {['🔥', '💋', '❤️', '😈', '⭐'].map((emoji) => {
                  const count = thread.reactionCounts ? (thread.reactionCounts[emoji] || 0) : 0;
                  const reactionsList = thread.reactions || [];
                  const userReacted = reactionsList.some(
                    (r: any) => r.userId === currentUser?._id || r.userId === currentUser?.id && r.emoji === emoji
                  );

                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReactThreadCard(thread._id, emoji)}
                      className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 border transition-all ${
                        userReacted
                          ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 scale-105'
                          : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/10'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Stats Footer */}
              <div className="flex items-center justify-between border-t border-white/5 pt-3 text-[10px] text-gray-500 font-mono">
                <div className="flex items-center gap-3">
                  <span>💬 {thread.replyCount || 0} REPLIES</span>
                  <span>👁 {thread.viewCount || 0} VIEWS</span>
                </div>
                <span className="text-[10px] text-rose-400 font-bold font-sans uppercase tracking-widest group-hover:text-white">
                  OPEN THREAD →
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE NEW THREAD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-[#180a0e] border border-[var(--az-border)] rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto relative shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-5">
              <h3 className="text-lg font-serif italic text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                Start a New Thread
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white text-base">✕</button>
            </div>

            <form onSubmit={handleCreateThreadSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Thread Title (required) - Max 80 chars
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={80}
                  required
                  placeholder="What's your scenario? Keep it short and punchy."
                  className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)]"
                />
                <div className="text-right text-[10px] text-gray-500 mt-1">{80 - newTitle.length} characters left</div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Opening Post Set-the-Scene description (required) - Max 1000 chars
                </label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  maxLength={1000}
                  required
                  rows={6}
                  placeholder="Set the scene. Describe the situation. Give people something to respond to..."
                  className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)] resize-none"
                />
                <div className="text-right text-[10px] text-gray-500 mt-1">{1000 - newBody.length} characters left</div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Attach Image URL (optional)
                </label>
                <input
                  type="url"
                  value={newMedia}
                  onChange={(e) => setNewBodyMedia(e.target.value)}
                  placeholder="https://images.unsplash.com/... (neon-portrait portrait urls)"
                  className="w-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)]"
                />
              </div>

              <button
                type="submit"
                disabled={submittingThread || !newTitle.trim() || !newBody.trim()}
                className="w-full py-3 bg-[var(--az-accent-primary)] hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg mt-4"
              >
                {submittingThread ? 'Posting Thread...' : 'Post Thread'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// THREAD DETAIL FULL CONTEXT PANEL (VIEW 3)
// ============================================================================

interface DetailProps {
  threadId: string;
  roomId: string;
  onBack: () => void;
  getHeaders: () => any;
  currentUser: any;
  socket: Socket | null;
}

const ThreadDetail: React.FC<DetailProps> = ({ threadId, roomId, onBack, getHeaders, currentUser, socket }) => {
  const [thread, setThread] = useState<any | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [replyInput, setReplyInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [typingUserInThread, setTypingUserInThread] = useState<string | null>(null);

  // Quote reply reference state
  const [quotingMessage, setQuotingMessage] = useState<any | null>(null);

  // Load Thread details & replies (oldest first for narrative flow)
  const fetchThreadDetailsAndReplies = async () => {
    try {
      // Thread details
      const detailRes = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}`, {
        headers: getHeaders(),
      });
      const detailData = await detailRes.json();
      if (detailData.success && detailData.data?.thread) {
        setThread(detailData.data.thread);
        setIsLocked(detailData.data.thread.isLocked);
      }

      // Replies (oldest first - ascending)
      const repliesRes = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/replies`, {
        headers: getHeaders(),
      });
      const repliesData = await repliesRes.json();
      if (repliesData.success && repliesData.data?.replies) {
        setReplies(repliesData.data.replies);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchThreadDetailsAndReplies();

    if (!socket) return;
    socket.emit('thread:join', { threadId });

    socket.on('thread:new_reply', (data: { reply: any }) => {
      if (data?.reply) {
        setReplies(prev => {
          if (prev.some(r => r._id === data.reply._id)) return prev;
          return [...prev, data.reply];
        });
      }
    });

    socket.on('thread:reply_reacted', (data: { replyId: string; reactions: any[] }) => {
      setReplies(prev => prev.map(r => r._id === data.replyId ? { ...r, reactions: data.reactions } : r));
    });

    socket.on('thread:locked', (data: { threadId: string; isLocked: boolean }) => {
      if (data?.threadId === threadId) {
        setIsLocked(data.isLocked);
        toast.info('This thread has been locked by a moderator.');
      }
    });

    socket.on('thread:typing', (data: { userId: string; displayName: string }) => {
      if (data?.userId === currentUser?.id || data?.userId === currentUser?._id) return;
      setTypingUserInThread(data.displayName);

      // Clear after 3 seconds
      setTimeout(() => {
        setTypingUserInThread(null);
      }, 3000);
    });

    return () => {
      socket.emit('thread:leave', { threadId });
      socket.off('thread:new_reply');
      socket.off('thread:reply_reacted');
      socket.off('thread:locked');
      socket.off('thread:typing');
    };
  }, [threadId, socket]);

  // Reply submit
  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim()) return;

    try {
      setSubmittingReply(true);
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/replies`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          content: replyInput,
          replyToMessageId: quotingMessage?._id || null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setReplyInput('');
        setQuotingMessage(null);
        // Socket triggers will automatically append
        fetchThreadDetailsAndReplies();
      } else {
        toast.error(data.error?.message || 'Failed to post reply');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmittingReply(false);
    }
  };

  // React on opening post
  const handleReactOpeningPost = async (emoji: string) => {
    if (!thread) return;
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/react`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji }),
      });
      const data = await response.json();
      if (data.success && data.data?.thread) {
        setThread(data.data.thread);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // React on replies
  const handleReactReply = async (replyId: string, emoji: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/replies/${replyId}/react`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ emoji }),
      });
      const data = await response.json();
      if (!data.success) {
        toast.error('Could not react');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Moderation pins
  const handleTogglePinThread = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/pin`, {
        method: 'PUT',
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.data.thread.isPinned ? 'Thread pinned to top!' : 'Thread unpinned.');
        setThread(data.data.thread);
      } else {
        toast.error(data.error?.message || 'Moderator action failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Moderation locks
  const handleToggleLockThread = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/threads/${threadId}/lock`, {
        method: 'PUT',
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.data.thread.isLocked ? 'Thread locked!' : 'Thread unlocked.');
        setIsLocked(data.data.thread.isLocked);
        setThread(data.data.thread);
      } else {
        toast.error(data.error?.message || 'Moderator action failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Emit thread typing activity
  const handleReplyInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReplyInput(e.target.value);
    if (socket) {
      socket.emit('thread:typing', { threadId });
    }
  };

  if (!thread) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isMod = currentUser?.role === 'provider';

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-5 flex flex-col space-y-4">
      {/* Sticky top Thread Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/5">
        <button
          onClick={onBack}
          className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1"
        >
          ← Back to room
        </button>

        {/* Mod Controls */}
        {isMod && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePinThread}
              className={`px-3 py-1 border rounded text-[10px] font-bold ${
                thread.isPinned
                  ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                  : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              📌 {thread.isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={handleToggleLockThread}
              className={`px-3 py-1 border rounded text-[10px] font-bold ${
                isLocked
                  ? 'bg-red-600/20 border-red-500 text-red-400'
                  : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              🔒 {isLocked ? 'Unlock' : 'Lock'}
            </button>
          </div>
        )}
      </div>

      {/* VIEW 3 OPENING POST */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <img
            src={thread.authorAvatarUrl || '/placeholder.svg'}
            className="w-10 h-10 rounded-full object-cover border border-white/10"
            alt="Author"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white font-serif italic">{thread.authorName}</span>
              <span className="text-[9px] text-gray-500">
                {new Date(thread.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-[var(--az-text-secondary)] font-mono">THREAD AUTHOR</p>
          </div>
        </div>

        <div>
          <h3 className="text-base md:text-xl font-serif font-bold text-white mb-2 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
            {thread.title}
          </h3>
          <p className="text-xs text-gray-300 font-sans leading-relaxed whitespace-pre-wrap">
            {thread.body}
          </p>
        </div>

        {thread.mediaUrl && (
          <div className="max-h-96 overflow-hidden rounded-xl border border-white/5">
            <img src={thread.mediaUrl} className="w-full h-full object-cover" alt="Thread visual trigger" />
          </div>
        )}

        {/* Reaction Picker on Opening Post */}
        <div className="flex flex-wrap gap-2 border-t border-b border-white/5 py-3">
          {['🔥', '💋', '❤️', '😈', '⭐'].map((emoji) => {
            const count = thread.reactionCounts ? (thread.reactionCounts[emoji] || 0) : 0;
            const userReacted = (thread.reactions || []).some(
              (r: any) => (r.userId === currentUser?._id || r.userId === currentUser?.id) && r.emoji === emoji
            );

            return (
              <button
                key={emoji}
                onClick={() => handleReactOpeningPost(emoji)}
                className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 border transition-all ${
                  userReacted
                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 scale-105'
                    : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/10'
                }`}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="text-center py-2">
        <span className="text-[10px] font-mono tracking-widest text-gray-600 uppercase">— REPLIES ({replies.length}) —</span>
      </div>

      {/* REPLIES LIST */}
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2 no-scrollbar">
        {replies.length === 0 ? (
          <p className="text-xs text-center text-gray-500 italic py-6">No responses yet. Set the narrative flow below!</p>
        ) : (
          replies.map((reply) => {
            // Check if replying to nested message
            const quotedReply = replies.find(r => r._id === reply.replyToMessageId);

            return (
              <div key={reply._id} className="bg-black/20 p-3.5 rounded-xl border border-white/5 flex items-start gap-3">
                <img
                  src={reply.senderAvatarUrl || '/placeholder.svg'}
                  className="w-8 h-8 rounded-full object-cover border border-white/10"
                  alt="Responder"
                />

                <div className="flex-grow">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-300 font-serif italic">{reply.senderName}</span>
                      {reply.senderBadge && (
                        <span className="text-[8px] bg-amber-500 text-black px-1 rounded">{reply.senderBadge}</span>
                      )}
                      <span className="text-[9px] text-gray-500">
                        {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setQuotingMessage(reply)}
                        className="text-[10px] text-gray-500 hover:text-white"
                      >
                        Reply
                      </button>
                    </div>
                  </div>

                  {/* Quoted preview rendering */}
                  {quotedReply && (
                    <div className="bg-rose-950/20 border-l-2 border-rose-500/50 px-2 py-1 rounded text-[10px] text-gray-400 mb-2 italic">
                      @{quotedReply.senderName}: "{quotedReply.content.slice(0, 50)}..."
                    </div>
                  )}

                  <div className="text-xs text-gray-300">
                    {reply.content}
                  </div>

                  {/* Reaction counts inside replies */}
                  <div className="flex gap-1.5 mt-2">
                    {['🔥', '💋', '❤️', '😈', '⭐'].map((emoji) => {
                      const reaction = (reply.reactions || []).find((r: any) => r.emoji === emoji);
                      const hasReacted = reaction?.userIds?.some((id: string) => id === currentUser?.id || id === currentUser?._id);
                      if (!reaction) return null;

                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReactReply(reply._id, emoji)}
                          className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 border ${
                            hasReacted
                              ? 'bg-rose-950/50 border-rose-500/30 text-rose-300'
                              : 'bg-black/30 border-white/5 text-gray-500'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{reaction.count}</span>
                        </button>
                      );
                    })}

                    {/* Quick adder shortcuts */}
                    <button
                      onClick={() => handleReactReply(reply._id, '🔥')}
                      className="text-[9px] opacity-0 hover:opacity-100 group-hover:opacity-100 text-gray-500 hover:text-white"
                    >
                      +🔥
                    </button>
                    <button
                      onClick={() => handleReactReply(reply._id, '💋')}
                      className="text-[9px] opacity-0 hover:opacity-100 group-hover:opacity-100 text-gray-500 hover:text-white"
                    >
                      +💋
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Typing indicator inside thread */}
      {typingUserInThread && (
        <div className="text-[10px] text-gray-500 italic flex items-center gap-1 pl-2">
          <span>{typingUserInThread} is writing a reply...</span>
          <span className="w-1 h-1 rounded-full bg-rose-500 animate-ping" />
        </div>
      )}

      {/* Thread reply input */}
      {isLocked ? (
        <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center text-xs text-gray-500 italic">
          🔒 This thread is closed for replies
        </div>
      ) : (
        <form onSubmit={handleReplySubmit} className="space-y-2">
          {quotingMessage && (
            <div className="flex justify-between items-center bg-rose-950/30 border-l border-rose-500 px-3 py-1 rounded text-[10px]">
              <span className="text-rose-300">Replying to {quotingMessage.senderName}</span>
              <button onClick={() => setQuotingMessage(null)} className="text-gray-500">✕</button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replyInput}
              onChange={handleReplyInputChange}
              placeholder="Post a reply inside this narrative thread..."
              maxLength={2000}
              className="flex-grow bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[var(--az-accent-rose)]"
            />
            <button
              type="submit"
              disabled={submittingReply || !replyInput.trim()}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-bold uppercase rounded-xl transition-all"
            >
              Post
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ============================================================================
// MEDIA TAB MASONRY GALLERY LISTS
// ============================================================================

interface MediaProps {
  roomId: string;
  getHeaders: () => any;
}

const MediaGallery: React.FC<MediaProps> = ({ roomId, getHeaders }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/messages?limit=100`, {
          headers: getHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data?.messages) {
          // Filter out only messages with mediaUrl
          const mediaMessages = data.data.messages.filter((m: any) => m.mediaUrl);
          setItems(mediaMessages);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, [roomId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-16 text-center">
        <span className="text-5xl mb-3">📷</span>
        <h4 className="text-base font-serif italic text-white mb-2">No photos shared yet</h4>
        <p className="text-xs text-gray-500">All photos and media triggers shared in the main feed appear here automatically!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item._id} className="relative rounded-xl overflow-hidden border border-white/5 aspect-square group bg-black">
          <img src={item.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Shared item" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end text-left">
            <p className="text-[10px] text-white font-bold">{item.senderName}</p>
            <p className="text-[8px] text-gray-400">
              {new Date(item.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// ROOM POLL TAB (ACTIVE POLL CARDS)
// ============================================================================

interface PollProps {
  roomId: string;
  socket: Socket | null;
  getHeaders: () => any;
  currentUser: any;
}

const PollWidget: React.FC<PollProps> = ({ roomId, socket, getHeaders, currentUser }) => {
  const [activePoll, setActivePoll] = useState<any | null>(null);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [submittingVote, setSubmittingVote] = useState(false);

  // Poll creation inputs
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [optionsInputs, setOptionsInputs] = useState<string[]>(['', '']);
  const [expiresMinutes, setExpiresMinutes] = useState(60);

  // Fetch active poll
  const fetchActivePollDetails = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/polls/active`, {
        headers: getHeaders(),
      });
      const data = await response.json();
      if (data.success && data.data?.polls && data.data.polls.length > 0) {
        const poll = data.data.polls[0];
        setActivePoll(poll);

        // Detect if already voted
        if (poll.voterIds && poll.voterIds.includes(currentUser?._id || currentUser?.id)) {
          setVotedOptionId('voted'); // Placeholder
        }
      } else {
        setActivePoll(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchActivePollDetails();

    if (!socket) return;
    socket.on('room:poll_created', (data: { poll: any }) => {
      if (data?.poll) {
        setActivePoll(data.poll);
        setVotedOptionId(null);
        toast.info('📊 A new room poll has been launched!');
      }
    });

    socket.on('room:poll_updated', (data: { pollId: string; options: any[] }) => {
      setActivePoll((prev: any) => {
        if (prev && prev._id === data.pollId) {
          return { ...prev, options: data.options };
        }
        return prev;
      });
    });

    return () => {
      socket.off('room:poll_created');
      socket.off('room:poll_updated');
    };
  }, [roomId, socket]);

  // Handle vote submit
  const handleVoteAction = async (optionId: string) => {
    if (votedOptionId || submittingVote) return;

    try {
      setSubmittingVote(true);
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/polls/${activePoll._id}/vote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ optionId }),
      });
      const data = await response.json();
      if (data.success) {
        setVotedOptionId(optionId);
        toast.success('Vote recorded!');
        fetchActivePollDetails();
      } else {
        toast.error(data.error?.message || 'Vote failed');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingVote(false);
    }
  };

  // Launch Poll Submit (mod only)
  const handleCreatePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeOptions = optionsInputs.filter(o => o.trim());
    if (!questionInput.trim() || activeOptions.length < 2) {
      toast.error('Question and at least 2 options are required');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/polls`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          question: questionInput,
          options: activeOptions,
          expiresInMinutes: expiresMinutes,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Poll launched!');
        setIsCreatorOpen(false);
        setQuestionInput('');
        setOptionsInputs(['', '']);
        fetchActivePollDetails();
      } else {
        toast.error(data.error?.message || 'Failed to create poll');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddOptionField = () => {
    if (optionsInputs.length >= 6) return;
    setOptionsInputs([...optionsInputs, '']);
  };

  const totalVotes = activePoll ? activePoll.voterIds.length : 0;
  const isMod = currentUser?.role === 'provider';

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-5 relative">
      {/* Launch Poll triggers (mod only) */}
      {isMod && !activePoll && !isCreatorOpen && (
        <div className="absolute right-5 top-5">
          <button
            onClick={() => setIsCreatorOpen(true)}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase rounded-lg"
          >
            Launch Poll
          </button>
        </div>
      )}

      {/* ACTIVE POLL CARD */}
      {activePoll ? (
        <div className="space-y-6 text-left">
          <div className="flex justify-between items-center pb-2 border-b border-white/5">
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
              📊 Room Poll
            </span>
            <span className="text-[10px] text-gray-500">
              ⏳ {new Date(activePoll.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div>
            <h3 className="text-base md:text-lg font-serif italic text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
              {activePoll.question}
            </h3>
          </div>

          <div className="space-y-3">
            {activePoll.options.map((option: any) => {
              const count = option.voteCount || 0;
              const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isSelected = votedOptionId === option.id;

              return (
                <div key={option.id} className="relative">
                  {votedOptionId ? (
                    /* Post vote View */
                    <div
                      className={`p-3.5 rounded-xl border ${
                        isSelected ? 'border-rose-500 bg-rose-950/20' : 'border-white/5 bg-black/20'
                      } overflow-hidden`}
                    >
                      {/* Percent bar fill */}
                      <div
                        className="absolute inset-y-0 left-0 bg-rose-500/10 transition-all duration-1000 ease-out"
                        style={{ width: `${percent}%` }}
                      />

                      <div className="relative z-10 flex justify-between items-center text-xs text-gray-300">
                        <span className="font-bold">{option.text}</span>
                        <span className="font-mono">{count} votes ({percent}%)</span>
                      </div>
                    </div>
                  ) : (
                    /* Pre vote View clickable buttons */
                    <button
                      onClick={() => handleVoteAction(option.id)}
                      disabled={submittingVote}
                      className="w-full text-left p-3.5 rounded-xl border border-white/5 hover:border-rose-500 bg-black/20 text-xs text-gray-300 font-bold hover:text-white transition-all active:scale-[0.99]"
                    >
                      {option.text}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-gray-500 font-mono">
            TOTAL VOTES: {totalVotes} members voted
          </div>
        </div>
      ) : isCreatorOpen ? (
        /* Creator modal view */
        <form onSubmit={handleCreatePollSubmit} className="space-y-4 text-left">
          <div className="flex justify-between items-center pb-2 border-b border-white/5 mb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">📊 Launch Room Poll</h3>
            <button type="button" onClick={() => setIsCreatorOpen(false)} className="text-gray-500">✕</button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Question</label>
            <input
              type="text"
              required
              maxLength={200}
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="e.g. Which scenario should we roleplay next?"
              className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Options</label>
            {optionsInputs.map((val, idx) => (
              <input
                key={idx}
                type="text"
                required={idx < 2}
                value={val}
                onChange={(e) => {
                  const updated = [...optionsInputs];
                  updated[idx] = e.target.value;
                  setOptionsInputs(updated);
                }}
                placeholder={`Option ${idx + 1}`}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white"
              />
            ))}

            {optionsInputs.length < 6 && (
              <button
                type="button"
                onClick={handleAddOptionField}
                className="text-[10px] text-rose-400 hover:text-white underline font-bold"
              >
                + Add Option
              </button>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Duration</label>
            <select
              value={expiresMinutes}
              onChange={(e) => setExpiresMinutes(Number(e.target.value))}
              className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white"
            >
              <option value={15}>15 Minutes</option>
              <option value={30}>30 Minutes</option>
              <option value={60}>1 Hour</option>
              <option value={120}>2 Hours</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-rose-600 text-white text-xs font-bold uppercase rounded-xl"
          >
            Launch Poll
          </button>
        </form>
      ) : (
        /* Empty / No Active poll placeholder */
        <div className="py-12 text-center">
          <span className="text-4xl mb-2">📊</span>
          <h4 className="text-sm font-serif italic text-white mb-1">No active poll right now</h4>
          <p className="text-xs text-gray-500">Moderators can launch interactive polls to steer the room experience!</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MEMBERS LIST (MEMBERS TAB)
// ============================================================================

interface MembersProps {
  roomId: string;
  getHeaders: () => any;
}

const MembersList: React.FC<MembersProps> = ({ roomId, getHeaders }) => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/members`, {
          headers: getHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data?.members) {
          setMembers(data.data.members);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [roomId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-5">
      <div className="text-left mb-4 pb-2 border-b border-white/5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">Active Members List</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((m, idx) => (
          <div key={idx} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5 text-left">
            <div className="flex items-center gap-2.5">
              <img src={m.avatarUrl || '/placeholder.svg'} className="w-8 h-8 rounded-full object-cover" alt={m.displayName} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">{m.displayName}</span>
                  {m.badge && (
                    <span className="text-[8px] bg-amber-500 text-black px-1 rounded font-bold">{m.badge}</span>
                  )}
                </div>
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">{m.role}</span>
              </div>
            </div>
            {m.role === 'member' && (
              <span className="text-[10px] text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded font-mono font-bold">
                {m.messageCount || 0} msgs
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// RIGHT SIDEBAR SUB-COMPONENTS (WHO'S HERE, MINI POLL, LEADERBOARD)
// ============================================================================

const WhoHereSidebar: React.FC<{ roomId: string; socket: Socket | null; getHeaders: () => any }> = ({ roomId, socket, getHeaders }) => {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    const fetchWhoHere = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/members`, {
          headers: getHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data?.members) {
          setMembers(data.data.members);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchWhoHere();

    if (!socket) return;
    socket.on('room:user_joined', () => {
      fetchWhoHere();
    });
    socket.on('room:user_left', () => {
      fetchWhoHere();
    });

    return () => {
      socket.off('room:user_joined');
      socket.off('room:user_left');
    };
  }, [roomId, socket]);

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-4 text-left">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--az-accent-rose)] mb-3">
        👥 Who's Here ({members.length})
      </h3>

      <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
        {members.map((m, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs py-1 hover:bg-white/[0.02] px-1 rounded">
            <div className="flex items-center gap-2">
              <img src={m.avatarUrl || '/placeholder.svg'} className="w-6 h-6 rounded-full object-cover" alt="" />
              <span className="text-gray-300 font-bold truncate max-w-[120px]">{m.displayName}</span>
              {m.badge && (
                <span className="text-[8px] bg-amber-500 text-black px-1 rounded">{m.badge}</span>
              )}
            </div>
            {m.role === 'admin' || m.role === 'moderator' ? (
              <span className="text-[8px] text-amber-500 font-bold uppercase">👑 Mod</span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_#0f0]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MiniPollSidebar: React.FC<{ roomId: string; socket: Socket | null; getHeaders: () => any; currentUser: any }> = ({ roomId, socket, getHeaders }) => {
  const [poll, setPoll] = useState<any | null>(null);

  useEffect(() => {
    const fetchMiniPoll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/polls/active`, {
          headers: getHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data?.polls && data.data.polls.length > 0) {
          setPoll(data.data.polls[0]);
        } else {
          setPoll(null);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchMiniPoll();

    if (!socket) return;
    socket.on('room:poll_created', (data: { poll: any }) => {
      if (data?.poll) setPoll(data.poll);
    });
    socket.on('room:poll_updated', (data: { pollId: string; options: any[] }) => {
      setPoll((prev: any) => (prev && prev._id === data.pollId ? { ...prev, options: data.options } : prev));
    });

    return () => {
      socket.off('room:poll_created');
      socket.off('room:poll_updated');
    };
  }, [roomId, socket]);

  if (!poll) return null;

  const total = poll.voterIds ? poll.voterIds.length : 0;

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-4 text-left">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--az-accent-rose)] mb-2">
        📊 Room Poll Active
      </h3>
      <p className="text-xs text-gray-300 font-serif italic mb-3">{poll.question}</p>
      <div className="space-y-1.5">
        {poll.options.slice(0, 3).map((o: any) => {
          const count = o.voteCount || 0;
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={o.id} className="text-[10px] text-gray-400 flex justify-between border-b border-white/5 pb-1">
              <span>{o.text}</span>
              <span className="font-mono font-bold text-rose-400">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LeaderboardSidebar: React.FC<{ roomId: string; getHeaders: () => any }> = ({ roomId, getHeaders }) => {
  const [board, setBoard] = useState<any[]>([]);

  useEffect(() => {
    const fetchBoard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/adult/rooms/${roomId}/leaderboard`, {
          headers: getHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data?.leaderboard) {
          setBoard(data.data.leaderboard);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchBoard();
  }, [roomId]);

  if (board.length === 0) return null;

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl p-4 text-left">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--az-accent-rose)] mb-3">
        🏆 Leaderboard (Session)
      </h3>
      <div className="space-y-2">
        {board.slice(0, 5).map((row, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/5 pb-1">
            <div className="flex items-center gap-2">
              <span className="font-bold font-mono text-gray-500 w-4">{idx + 1}st</span>
              <img src={row.avatarUrl || '/placeholder.svg'} className="w-5 h-5 rounded-full object-cover" alt="" />
              <span className="text-gray-300 truncate max-w-[100px]">{row.displayName}</span>
            </div>
            <span className="font-mono text-rose-500 text-[10px] font-bold">💎 {row.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NaughtyRooms;
