import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { CHANNEL_COLOR_MAP } from '../../engine/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

export function ChannelMixTrendChart() {
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);
  const [hiddenChannels, setHiddenChannels] = useState<Set<string>>(new Set());

  const toggleChannel = (ch: string) => {
    setHiddenChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  const visibleChannels = activeChannels.filter(ch => !hiddenChannels.has(ch));

  // Check if all years have identical allocations
  const allYearsSame = useMemo(() => {
    if (channelAllocations.length <= 1) return true;
    const first = JSON.stringify(channelAllocations[0]?.allocations);
    return channelAllocations.every(ca => JSON.stringify(ca.allocations) === first);
  }, [channelAllocations]);

  const chartData = useMemo(() => {
    return forecast.map((f, i) => {
      const ca = channelAllocations[i];
      const entry: Record<string, number | string> = { year: f.year };
      for (const ch of activeChannels) {
        entry[ch] = ca?.allocations[ch] ?? 0;
      }
      return entry;
    });
  }, [forecast, channelAllocations, activeChannels]);

  if (channelAllocations.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-[#EAECEC]/30 rounded-lg">
        <span className="text-sm text-[#9296B2]">Complete Steps 1 & 2 to unlock this chart</span>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload) return null;
    const sorted = [...payload].filter(p => p.value > 0).sort((a, b) => b.value - a.value);
    return (
      <div className="bg-white border border-[#EAECEC] rounded-lg shadow-lg p-3 max-w-[220px]">
        <div className="font-bold text-xs text-[#004567] mb-2">{label}</div>
        {sorted.map(item => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-[10px] py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[#44546A]">{item.name}</span>
            </div>
            <span className="font-mono font-bold text-[#004567]">{Number(item.value).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          {visibleChannels.map(ch => (
            <Bar key={ch} dataKey={ch} stackId="mix" fill={CHANNEL_COLOR_MAP[ch] ?? '#9B9B9B'} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Clickable legend */}
      <div className="flex flex-wrap gap-2 mt-3 justify-center">
        {activeChannels.map(ch => {
          const hidden = hiddenChannels.has(ch);
          return (
            <button key={ch} onClick={() => toggleChannel(ch)}
              className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border transition-all
                ${hidden ? 'border-[#EAECEC] text-[#9296B2] opacity-50' : 'border-transparent text-[#44546A]'}`}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hidden ? '#EAECEC' : (CHANNEL_COLOR_MAP[ch] ?? '#9B9B9B') }} />
              {ch}
            </button>
          );
        })}
      </div>

      {allYearsSame && (
        <p className="text-[10px] text-[#9296B2] text-center mt-2 italic">
          All years use the same channel mix. Switch to the Assumptions page to model channel evolution by year.
        </p>
      )}
    </div>
  );
}
