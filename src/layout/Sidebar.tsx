import { useStore } from '../store/useStore';
import { THERAPY_AREAS, BENEFIT_TYPES } from '../engine/constants';
import chryselysLogo from '../assets/chryselys-logo.svg';

export function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const {
    productName, setProductName,
    therapyArea, setTherapyArea,
    benefitType, setBenefitType,
    nYears, setNYears,
    startYear, setStartYear,
    forecast,
    // Scenario
    scenarios, activeScenarioId, dirty, saveScenario,
  } = useStore();

  const years = forecast.map(f => f.year);
  const firstYear = years[0] ?? startYear;
  const lastYear = years[years.length - 1] ?? startYear + nYears - 1;

  const activeScenario = activeScenarioId ? scenarios[activeScenarioId] : null;

  const handleQuickSave = () => {
    if (activeScenario) {
      saveScenario(activeScenario.name, activeScenario.description, activeScenario.tags);
    }
  };

  if (collapsed) {
    return (
      <aside className="w-14 min-h-screen bg-[#004567] border-r border-[#004466] flex flex-col items-center py-4 shrink-0">
        <button onClick={onToggle} className="text-white hover:text-[#C98B27] mb-4" title="Expand sidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <img src={chryselysLogo} alt="Chryselys" className="h-9 w-auto" />
        {dirty && <span className="w-2 h-2 rounded-full bg-amber-400 mt-auto mb-2" title="Unsaved changes" />}
      </aside>
    );
  }

  return (
    <aside className="w-64 min-h-screen bg-[#004567] border-r border-[#004466] p-4 flex flex-col gap-4 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={chryselysLogo} alt="Chryselys" className="h-10 w-auto" />
          <div>
            <div className="text-base font-bold text-white leading-tight">AccessLens</div>
            <div className="text-[8px] text-[#C6B78A] tracking-wider">by Chryselys</div>
          </div>
        </div>
        <button onClick={onToggle} className="text-[#9296B2] hover:text-white" title="Collapse sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>
      <p className="text-xs text-[#9296B2] italic">Dynamic Multi-Year GTN Engine</p>
      <hr className="border-[#5C6082]" />

      <label className="text-xs font-semibold text-[#C6B78A] uppercase tracking-wider">Product Name</label>
      <input
        type="text"
        value={productName}
        onChange={e => setProductName(e.target.value)}
        className="px-2 py-1.5 border border-[#5C6082] rounded text-sm text-white font-semibold bg-[#004466] focus:border-[#C98B27] outline-none"
      />

      <label className="text-xs font-semibold text-[#C6B78A] uppercase tracking-wider">Therapy Area</label>
      <select
        value={therapyArea}
        onChange={e => setTherapyArea(e.target.value)}
        className="px-2 py-1.5 border border-[#5C6082] rounded text-sm bg-[#004466] text-white focus:border-[#C98B27] outline-none"
      >
        {THERAPY_AREAS.map(t => <option key={t}>{t}</option>)}
      </select>

      <label className="text-xs font-semibold text-[#C6B78A] uppercase tracking-wider">Benefit Type</label>
      <select
        value={benefitType}
        onChange={e => {
          if (confirm('Changing benefit type will reset channel allocations and rebate defaults. Continue?')) {
            setBenefitType(e.target.value as 'buy-and-bill' | 'pharmacy-benefit');
          }
        }}
        className="px-2 py-1.5 border border-[#5C6082] rounded text-sm bg-[#004466] text-white focus:border-[#C98B27] outline-none"
      >
        {BENEFIT_TYPES.map(bt => <option key={bt.id} value={bt.id}>{bt.label}</option>)}
      </select>
      <p className="text-[9px] text-[#9296B2] leading-tight">
        {BENEFIT_TYPES.find(bt => bt.id === benefitType)?.description}
      </p>

      <hr className="border-[#5C6082]" />
      <div className="text-sm font-bold text-[#C98B27]">Forecast Horizon</div>

      <label className="text-xs text-[#9296B2]">Forecast Years: <span className="text-white font-bold">{nYears}</span></label>
      <input
        type="range"
        min={1}
        max={10}
        value={nYears}
        onChange={e => setNYears(Number(e.target.value))}
      />

      <label className="text-xs text-[#9296B2]">Start Year</label>
      <input
        type="number"
        min={2024}
        max={2030}
        value={startYear}
        onChange={e => setStartYear(Number(e.target.value))}
        className="px-2 py-1 border border-[#5C6082] rounded text-sm bg-[#004466] text-white focus:border-[#C98B27] outline-none"
      />

      <hr className="border-[#5C6082]" />

      {/* Active Scenario Section */}
      <div className="text-sm font-bold text-[#C98B27]">Active Scenario</div>
      <div className="bg-[#004466] rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-semibold truncate flex-1">
            {activeScenario ? activeScenario.name : 'No scenario loaded'}
          </span>
          {activeScenario && (
            <span className="text-[10px] px-1.5 py-0.5 bg-[#5C6082] text-white rounded font-mono font-bold shrink-0">
              v{activeScenario.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Unsaved changes
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Saved
            </span>
          )}
        </div>
        {activeScenario && !activeScenario.locked && dirty && (
          <button onClick={handleQuickSave}
            className="w-full text-[10px] px-2 py-1 bg-[#C98B27] text-white rounded font-semibold hover:bg-[#b07a20] transition-colors">
            Save
          </button>
        )}
        {activeScenario?.locked && (
          <div className="text-[10px] text-amber-400 font-semibold">🔒 Locked</div>
        )}
      </div>

      <div className="mt-auto text-xs text-[#9296B2] font-mono">
        {firstYear}–{lastYear} · {nYears} years
      </div>
    </aside>
  );
}
