import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { TabId } from '../types';
import { LayoutDashboard, Settings2, BarChart3, GitBranch } from 'lucide-react';

const NAV_ITEMS: { id: TabId; label: string; icon: typeof LayoutDashboard; step: number }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, step: 1 },
  { id: 'assumptions', label: 'Assumptions', icon: Settings2, step: 2 },
  { id: 'results', label: 'Results', icon: BarChart3, step: 3 },
  { id: 'scenarios', label: 'Scenarios & Sensitivity', icon: GitBranch, step: 4 },
];

export function TabBar() {
  const activeTab = useStore(s => s.activeTab);
  const setActiveTab = useStore(s => s.setActiveTab);
  const dirty = useStore(s => s.dirty);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);

  // Check if channel allocations are valid
  const channelsValid = useMemo(() => {
    for (const ca of channelAllocations) {
      const sum = activeChannels.reduce((s, ch) => s + (ca.allocations[ch] ?? 0), 0);
      if (Math.abs(sum - 100) >= 0.6) return false;
    }
    return true;
  }, [channelAllocations, activeChannels]);

  return (
    <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-1 mb-4 overflow-x-auto">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const disabled = item.id === 'results' && !channelsValid;
        return (
          <button
            key={item.id}
            onClick={() => !disabled && setActiveTab(item.id)}
            title={disabled ? 'Fix channel allocations first — each year must sum to 100%' : undefined}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium whitespace-nowrap transition-all
              ${disabled
                ? 'text-[#9296B2] cursor-not-allowed opacity-60'
                : isActive
                  ? 'bg-[#004567] text-white shadow-md border-b-2 border-[#C98B27]'
                  : 'text-[#44546A] hover:bg-white hover:text-[#004567]'
              }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
              ${isActive ? 'bg-[#C98B27] text-white' : 'bg-[#9296B2]/30 text-[#44546A]'}`}>
              {item.step}
            </span>
            <Icon size={15} />
            <span>{item.label}</span>
            {item.id === 'scenarios' && dirty && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
            )}
          </button>
        );
      })}
    </div>
  );
}
