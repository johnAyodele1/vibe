import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

const WHEEL_COLORS = [
  '#c8102e', // Crimson
  '#e8496a', // Rose
  '#c9a84c', // Gold
  '#a78bfa', // Lavender
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#ec4899'  // Pink
];

interface WheelItem {
  id: string;
  label: string;
  creditCost: number;
  probability: number;
  color: string;
}

interface WheelStats {
  totalSpins: number;
  totalEarned: number;
  recentSpins: any[];
  breakdown: any[];
}

export const WheelPreview: React.FC<{ items: WheelItem[]; spinning?: boolean; landedIndex?: number | null }> = ({
  items,
  spinning = false,
  landedIndex = null
}) => {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const total = items.length;

  const slices = items.map((item, i) => {
    const startAngle = (i / total) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((i + 1) / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const midAngle = (startAngle + endAngle) / 2;
    const textRadius = radius * 0.65;
    const tx = cx + textRadius * Math.cos(midAngle);
    const ty = cy + textRadius * Math.sin(midAngle);
    const largeArc = total === 1 ? 1 : 0;

    return { item, startAngle, endAngle, x1, y1, x2, y2, tx, ty, largeArc };
  });

  return (
    <div className="relative flex justify-center items-center my-6">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`relative z-10 transition-transform ${spinning ? 'animate-wheel-spin' : ''}`}
        style={spinning ? {
          animation: 'wheelSpin 4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
          transformOrigin: 'center'
        } as React.CSSProperties : {}}
      >
        {slices.map(({ item, x1, y1, x2, y2, tx, ty, largeArc }, i) => (
          <g key={item.id || i}>
            <path
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              stroke="rgba(10,6,8,0.3)"
              strokeWidth={1.5}
            />
            <text
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={total > 6 ? 7 : 9}
              fontFamily="DM Sans"
              fontWeight="600"
            >
              {item.label && item.label.length > 10 ? item.label.slice(0, 9) + '…' : item.label || 'Empty'}
            </text>
            <text
              x={tx}
              y={ty + 11}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize={7}
              fontFamily="JetBrains Mono"
            >
              💎{item.creditCost}
            </text>
          </g>
        ))}
        {/* Center circle */}
        <circle cx={cx} cy={cy} r={16} fill="rgba(10,6,8,0.9)" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
        {/* Pointer at top */}
        <polygon
          points={`${cx - 8},4 ${cx + 8},4 ${cx},18`}
          fill="white"
        />
      </svg>
      {/* Dynamic Keyframes Animation Injection */}
      <style>{`
        @keyframes wheelSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(${landedIndex !== null ? (3600 - (landedIndex * (360 / total)) - (180 / total)) : 1080}deg); }
        }
      `}</style>
    </div>
  );
};

export const WheelEditor: React.FC = () => {
  const token = localStorage.getItem('adultAccessToken') || '';
  const [items, setItems] = useState<WheelItem[]>([
    { id: '1', label: 'Blow a Kiss 💋', creditCost: 50, probability: 5, color: WHEEL_COLORS[0] },
    { id: '2', label: 'Dance Show 💃', creditCost: 100, probability: 3, color: WHEEL_COLORS[1] },
    { id: '3', label: 'Private Tease 🤫', creditCost: 250, probability: 1, color: WHEEL_COLORS[2] }
  ]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<WheelStats | null>(null);

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  const fetchWheel = async () => {
    try {
      setLoading(true);
      // Fetch wheel config
      const wheelRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me/wheel`, { headers: getHeaders() });
      const wheelData = await wheelRes.json();
      if (wheelData.success && wheelData.data) {
        setIsActive(wheelData.data.isActive);
        if (wheelData.data.items && wheelData.data.items.length >= 2) {
          setItems(wheelData.data.items);
        }
      }
    } catch (err) {
      console.error('Failed to load wheel:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/wheel/stats`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load wheel stats:', err);
    }
  };

  useEffect(() => {
    fetchWheel();
    fetchStats();
  }, []);

  const addItem = () => {
    if (items.length >= 8) {
      toast.info('Maximum 8 items on the wheel');
      return;
    }
    const newIdx = items.length;
    setItems(prev => [...prev, {
      id: `${Date.now()}`,
      label: '',
      creditCost: 50,
      probability: 1,
      color: WHEEL_COLORS[newIdx % WHEEL_COLORS.length]
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 2) {
      toast.info('Minimum 2 items required');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSave = async () => {
    if (items.some(i => !i.label.trim())) {
      toast.error('All items must have a description label');
      return;
    }
    if (items.some(i => i.creditCost < 5)) {
      toast.error('Each item must cost at least 5 credits');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/providers/me/wheel`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ isActive, items })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success('Spin wheel configured successfully!');
        fetchWheel();
        fetchStats();
      } else {
        toast.error(data.error || 'Failed to save wheel configuration');
      }
    } catch (err) {
      toast.error('Network error saving wheel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-xl font-serif italic text-white">Interactive Spin Wheel</h3>
          <p className="text-xs text-[var(--az-text-secondary)]">Let viewers pay to spin for interactions during stream. You keep 85% of earnings.</p>
        </div>
        <div className="flex items-center gap-3 bg-[var(--az-bg-tertiary)] px-4 py-2 rounded-xl border border-[var(--az-border)] shrink-0 self-start sm:self-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--az-text-secondary)]">Active Status</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--az-accent-rose)] cursor-pointer"
            checked={isActive}
            onChange={() => setIsActive(!isActive)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-t border-[var(--az-border)]/30 pt-6">
        {/* SVG Wheel Preview */}
        <div className="flex flex-col items-center justify-center bg-[var(--az-bg-tertiary)]/30 rounded-2xl p-4 border border-[var(--az-border)]/20">
          <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--az-text-secondary)] uppercase">Live Render Preview</span>
          <WheelPreview items={items} />
          <p className="text-[10px] text-[var(--az-text-muted)] text-center font-mono">
            Ranges from: 💎 {Math.min(...items.map(i => i.creditCost || 5))} to 💎 {Math.max(...items.map(i => i.creditCost || 5))}
          </p>
        </div>

        {/* Configurations Items list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Slices Editor</span>
            <button
              onClick={addItem}
              disabled={items.length >= 8}
              className="px-3 py-1 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-accent-rose)] hover:text-white text-[var(--az-text-secondary)] text-[10px] font-bold uppercase tracking-widest rounded-lg border border-[var(--az-border)] transition-colors"
            >
              + Add slice ({items.length}/8)
            </button>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center gap-2 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl p-3">
                {/* Color block */}
                <div
                  className="w-5 h-5 rounded-md shrink-0 border border-black/20"
                  style={{ backgroundColor: item.color }}
                  title="Slice color"
                />

                {/* Description label input */}
                <input
                  type="text"
                  placeholder="Performer action..."
                  maxLength={40}
                  className="flex-1 min-w-0 bg-transparent text-sm text-white font-medium outline-none border-b border-transparent focus:border-[var(--az-accent-rose)]/50 pb-0.5"
                  value={item.label}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx].label = e.target.value;
                    setItems(next);
                  }}
                />

                {/* Cost input */}
                <div className="flex items-center gap-1 bg-[#130d10] px-2 py-1 rounded-lg border border-[var(--az-border)] shrink-0">
                  <span className="text-yellow-500 text-xs select-none">💎</span>
                  <input
                    type="number"
                    min={5}
                    placeholder="50"
                    className="w-12 bg-transparent text-xs text-white font-mono outline-none text-right font-bold"
                    value={item.creditCost}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].creditCost = parseInt(e.target.value) || 0;
                      setItems(next);
                    }}
                  />
                </div>

                {/* Probability select */}
                <select
                  title="Probability weight"
                  className="bg-[#130d10] border border-[var(--az-border)] rounded-lg px-2 py-1 text-[10px] text-white outline-none shrink-0"
                  value={item.probability}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx].probability = parseInt(e.target.value) || 1;
                    setItems(next);
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(w => (
                    <option key={w} value={w}>Wt {w}</option>
                  ))}
                </select>

                {/* Remove button */}
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={items.length <= 2}
                  className="w-6 h-6 rounded-md hover:bg-red-500/20 text-red-500 flex items-center justify-center text-sm font-bold transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full h-11 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : 'Save Wheel Configurations'}
          </button>
        </div>
      </div>

      {/* Analytics stats section */}
      {stats && (
        <div className="border-t border-[var(--az-border)]/30 pt-6 space-y-4">
          <h4 className="text-sm font-serif italic text-white uppercase tracking-wider">Wheel Revenue Analytics</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-[var(--az-text-secondary)] uppercase tracking-wider block">Total Spins</span>
              <span className="text-2xl font-mono font-bold text-white mt-1 block">{stats.totalSpins}</span>
            </div>
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-[var(--az-text-secondary)] uppercase tracking-wider block">Total Earned</span>
              <span className="text-2xl font-mono font-bold text-yellow-500 mt-1 block">💎 {stats.totalEarned}</span>
            </div>
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-[var(--az-text-secondary)] uppercase tracking-wider block">Cash Value equivalent</span>
              <span className="text-2xl font-mono font-bold text-green-500 mt-1 block">${(stats.totalEarned * 0.0075).toFixed(2)}</span>
            </div>
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-[var(--az-text-secondary)] uppercase tracking-wider block">Average per spin</span>
              <span className="text-2xl font-mono font-bold text-white mt-1 block">
                💎 {stats.totalSpins > 0 ? Math.round(stats.totalEarned / stats.totalSpins) : 0}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Slice breakdown */}
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider block mb-3">Item Breakdown</span>
              <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                {stats.breakdown.length === 0 ? (
                  <p className="text-xs text-[var(--az-text-muted)] italic">No slice spins logged yet.</p>
                ) : stats.breakdown.map((item, i) => (
                  <div key={item._id || i} className="flex justify-between items-center text-xs font-medium border-b border-[var(--az-border)]/20 pb-1.5">
                    <span className="text-[var(--az-text-secondary)]">{item.label}</span>
                    <span className="font-mono text-white text-right shrink-0">
                      {item.count} spins · <span className="text-yellow-500">💎 {item.earned}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Spins */}
            <div className="bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider block mb-3">Recent Activity Logs</span>
              <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                {stats.recentSpins.length === 0 ? (
                  <p className="text-xs text-[var(--az-text-muted)] italic">No recent spins recorded.</p>
                ) : stats.recentSpins.map((spin, i) => (
                  <div key={spin._id || i} className="flex justify-between items-center text-[10px] font-medium border-b border-[var(--az-border)]/20 pb-1.5">
                    <div>
                      <span className="text-white block font-bold">{spin.spinnerName}</span>
                      <span className="text-[var(--az-text-muted)] block font-mono">{new Date(spin.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <span className="text-[var(--az-accent-rose)] font-serif italic text-right shrink-0">
                      Landed on "{spin.itemLabel}" (💎 {spin.creditsPaid})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
