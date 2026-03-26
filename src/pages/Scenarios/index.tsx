import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useComputedData } from '../../engine/hooks';
import { expandToMonthly, computeASPSeries, computeGTN, annualRollup, fmtSales, fmtM, fmtPct, fmtU, fmtD } from '../../engine/compute';
import { SectionHeader } from '../../shared/SectionHeader';
import { Accordion } from '../../shared/Accordion';
import { DataTable } from '../../shared/DataTable';
import type { Scenario, ScenarioSnapshot } from '../../types';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COMPARE_COLORS = ['#5B9BD5', '#C98B27', '#4ade80', '#9296B2', '#f87171'];

// ── Helpers ──────────────────────────────────────────────────────────────

function computeScenarioResults(snap: ScenarioSnapshot) {
  const channelAllocByYear: Record<number, Record<string, number>> = {};
  for (const ca of snap.channelAllocations) channelAllocByYear[ca.year] = ca.allocations;

  const discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
  for (const d of snap.discounts) discountByYear[d.year] = { gpo: d.gpo, idn: d.idn, b340: d.b340, va: d.va };

  const rebateByYear: Record<number, { comPbm: number; comMed: number; mcrD: number; mcaid: number; manMcaid: number }> = {};
  for (const r of snap.rebates) rebateByYear[r.year] = { comPbm: r.comPbm, comMed: r.comMed, mcrD: r.mcrD, mcaid: r.mcaid, manMcaid: r.manMcaid };

  const otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number }> = {};
  for (const o of snap.otherRates) otherByYear[o.year] = { adminFee: o.adminFee, distFee: o.distFee, copay: o.copay, returns: o.returns };

  const monthly = expandToMonthly(snap.forecast);
  const aspData = computeASPSeries(monthly, channelAllocByYear, discountByYear);
  const gtnData = computeGTN(monthly, aspData, channelAllocByYear, discountByYear, rebateByYear, otherByYear);
  const annual = annualRollup(gtnData);

  return { annual, aspData };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Section 1: Active Scenario Bar ──────────────────────────────────────

function ActiveScenarioBar() {
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const scenarios = useStore(s => s.scenarios);
  const dirty = useStore(s => s.dirty);
  const saveScenario = useStore(s => s.saveScenario);
  const lockScenario = useStore(s => s.lockScenario);
  const unlockScenario = useStore(s => s.unlockScenario);

  const active = activeScenarioId ? scenarios[activeScenarioId] : null;
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveTags, setSaveTags] = useState('');

  const handleSave = () => {
    if (active) {
      saveScenario(active.name, active.description, active.tags);
    }
  };

  const handleSaveAs = () => {
    if (!saveName.trim()) return;
    const tags = saveTags.split(',').map(t => t.trim()).filter(Boolean);
    saveScenario(saveName.trim(), saveDesc.trim(), tags);
    setShowSaveAs(false);
    setSaveName(''); setSaveDesc(''); setSaveTags('');
  };

  return (
    <div className="bg-white rounded-xl border border-[#EAECEC] p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-bold text-[#004567] text-sm truncate">
            {active ? active.name : 'Unsaved'}
          </span>
          {active && (
            <span className="text-[10px] px-2 py-0.5 bg-[#EAECEC] text-[#44546A] rounded font-mono font-bold">
              v{active.version}
            </span>
          )}
          {active?.locked && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">🔒 Locked</span>
          )}
          {dirty && (
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
          )}
        </div>

        <div className="flex gap-2">
          {active && !active.locked && (
            <button onClick={handleSave} disabled={!dirty}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors
                ${dirty ? 'bg-[#004567] text-white hover:bg-[#004466]' : 'bg-[#EAECEC] text-[#9296B2] cursor-not-allowed'}`}>
              Save
            </button>
          )}
          <button onClick={() => setShowSaveAs(!showSaveAs)}
            className="text-xs px-3 py-1.5 bg-[#C98B27] text-white rounded-md font-semibold hover:bg-[#b07a20]">
            Save As New
          </button>
          {active && (
            <button onClick={() => active.locked ? unlockScenario(active.id) : lockScenario(active.id)}
              className="text-xs px-3 py-1.5 border border-[#EAECEC] rounded-md font-semibold text-[#44546A] hover:bg-[#EAECEC]">
              {active.locked ? '🔓 Unlock' : '🔒 Lock'}
            </button>
          )}
        </div>
      </div>

      {showSaveAs && (
        <div className="mt-3 p-3 bg-[#FFF9EE] border border-[#C98B27] rounded-lg space-y-2">
          <input type="text" placeholder="Scenario name" value={saveName} onChange={e => setSaveName(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#EAECEC] rounded text-sm text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          <input type="text" placeholder="Description (optional)" value={saveDesc} onChange={e => setSaveDesc(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#EAECEC] rounded text-sm text-[#44546A] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          <input type="text" placeholder="Tags (comma-separated)" value={saveTags} onChange={e => setSaveTags(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#EAECEC] rounded text-sm text-[#44546A] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          <div className="flex gap-2">
            <button onClick={handleSaveAs} className="text-xs px-4 py-1.5 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]">Save</button>
            <button onClick={() => setShowSaveAs(false)} className="text-xs px-4 py-1.5 border border-[#EAECEC] rounded font-semibold text-[#44546A]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section 2: My Scenarios ─────────────────────────────────────────────

function ScenarioList({ compareSet, toggleCompare }: { compareSet: Set<string>; toggleCompare: (id: string) => void }) {
  const scenarios = useStore(s => s.scenarios);
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const loadScenario = useStore(s => s.loadScenario);
  const deleteScenario = useStore(s => s.deleteScenario);
  const duplicateScenario = useStore(s => s.duplicateScenario);

  const sorted = useMemo(() =>
    Object.values(scenarios).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    [scenarios]);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-[#9296B2] text-sm">
        No saved scenarios yet. Use "Save As New" above to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map(sc => {
        const isActive = sc.id === activeScenarioId;
        return (
          <div key={sc.id}
            className={`rounded-xl border p-4 bg-white transition-all
              ${isActive ? 'border-[#C98B27] border-l-4 shadow-md' : 'border-[#EAECEC] hover:border-[#9296B2]'}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-[#004567] truncate">{sc.name}</div>
                {sc.description && <div className="text-xs text-[#9296B2] mt-0.5 line-clamp-2">{sc.description}</div>}
              </div>
              <label className="shrink-0 ml-2 cursor-pointer" title="Select for comparison">
                <input type="checkbox" checked={compareSet.has(sc.id)} onChange={() => toggleCompare(sc.id)}
                  className="accent-[#C98B27] w-4 h-4" />
              </label>
            </div>

            {/* Tags */}
            {sc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {sc.tags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-[#FFF9EE] text-[#C98B27] border border-[#C98B27]/30 rounded-full font-medium">{t}</span>
                ))}
              </div>
            )}

            {/* Meta */}
            <div className="flex items-center gap-3 text-[10px] text-[#9296B2] mb-3">
              <span className="font-mono font-bold">v{sc.version}</span>
              <span>{timeAgo(sc.lastModified)}</span>
              {sc.locked && <span className="text-amber-600 font-bold">🔒</span>}
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <button onClick={() => loadScenario(sc.id)}
                className="text-[10px] px-2.5 py-1 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]">Load</button>
              <button onClick={() => duplicateScenario(sc.id, `${sc.name} (copy)`)}
                className="text-[10px] px-2.5 py-1 border border-[#EAECEC] rounded font-semibold text-[#44546A] hover:bg-[#EAECEC]">Duplicate</button>
              {confirmDelete === sc.id ? (
                <>
                  <button onClick={() => { deleteScenario(sc.id); setConfirmDelete(null); }}
                    className="text-[10px] px-2.5 py-1 bg-red-500 text-white rounded font-bold">Confirm</button>
                  <button onClick={() => setConfirmDelete(null)}
                    className="text-[10px] px-2.5 py-1 border border-[#EAECEC] rounded font-semibold text-[#44546A]">Cancel</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(sc.id)}
                  className="text-[10px] px-2.5 py-1 border border-red-200 rounded font-semibold text-red-500 hover:bg-red-50">Delete</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section 3: Compare Scenarios ────────────────────────────────────────

function CompareView({ ids }: { ids: string[] }) {
  const scenarios = useStore(s => s.scenarios);

  const compareData = useMemo(() => {
    return ids.map(id => {
      const sc = scenarios[id];
      if (!sc) return null;
      const { annual } = computeScenarioResults(sc.snapshot);
      return { scenario: sc, annual };
    }).filter(Boolean) as { scenario: Scenario; annual: ReturnType<typeof annualRollup> }[];
  }, [ids, scenarios]);

  if (compareData.length < 2) {
    return <div className="text-sm text-[#9296B2] py-4">Select at least 2 scenarios to compare.</div>;
  }

  // Delta table — collect all years from first scenario
  const years = compareData[0].annual.map(a => a.year);
  const metrics = ['Total Units', 'Gross Sales', 'Net Sales', 'IRA Rebate', 'Net After IRA', 'GTN %', 'Net $/Unit'];

  const getMetric = (annual: ReturnType<typeof annualRollup>, metric: string) => {
    const totalUnits = annual.reduce((s, a) => s + a.units, 0);
    const totalGross = annual.reduce((s, a) => s + a.grossSales, 0);
    const totalNet = annual.reduce((s, a) => s + a.netSales, 0);
    const totalIRA = annual.reduce((s, a) => s + (a.iraRebate ?? 0), 0);
    const totalNetAfterIRA = annual.reduce((s, a) => s + (a.netSalesAfterIRA ?? a.netSales), 0);
    const avgGtn = annual.length > 0 ? annual.reduce((s, a) => s + a.gtnPct, 0) / annual.length : 0;
    const avgNetPrice = totalUnits > 0 ? totalNet / totalUnits : 0;
    switch (metric) {
      case 'Total Units': return totalUnits;
      case 'Gross Sales': return totalGross;
      case 'Net Sales': return totalNet;
      case 'IRA Rebate': return totalIRA;
      case 'Net After IRA': return totalNetAfterIRA;
      case 'GTN %': return avgGtn;
      case 'Net $/Unit': return avgNetPrice;
      default: return 0;
    }
  };

  const formatMetric = (metric: string, v: number) => {
    switch (metric) {
      case 'Total Units': return fmtU(v);
      case 'Gross Sales': case 'Net Sales': case 'IRA Rebate': case 'Net After IRA': return fmtSales(v);
      case 'GTN %': return fmtPct(v);
      case 'Net $/Unit': return fmtD(v);
      default: return String(v);
    }
  };

  // Delta table headers/rows
  const deltaHeaders = ['Metric', ...compareData.map(c => c.scenario.name)];
  const deltaRows = metrics.map(metric => {
    const values = compareData.map(c => getMetric(c.annual, metric));
    const baseVal = values[0];
    return [
      metric,
      ...values.map((v, i) => {
        const formatted = formatMetric(metric, v);
        if (i === 0) return formatted;
        const pctDiff = baseVal !== 0 ? Math.abs((v - baseVal) / baseVal) * 100 : 0;
        return pctDiff > 5 ? `⚠ ${formatted}` : formatted;
      }),
    ];
  });

  // Net Sales overlay chart
  const overlayData = years.map(yr => {
    const entry: Record<string, number | string> = { year: yr };
    for (const c of compareData) {
      const yrData = c.annual.find(a => a.year === yr);
      entry[c.scenario.name] = (yrData?.netSales ?? 0) / 1e6;
    }
    return entry;
  });

  return (
    <div className="space-y-4">
      <SectionHeader>Scenario Comparison — Delta Table</SectionHeader>
      <DataTable headers={deltaHeaders} rows={deltaRows} />

      <SectionHeader>Net Sales Over Time — Scenario Overlay</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={overlayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`$${Number(v).toFixed(2)}M`]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {compareData.map((c, i) => (
              <Line key={c.scenario.id} type="monotone" dataKey={c.scenario.name}
                stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth={2.5} dot={{ r: 4 }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Side-by-side waterfall for exactly 2 */}
      {compareData.length === 2 && (
        <>
          <SectionHeader>Side-by-Side GTN Waterfall</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            {compareData.map((c, i) => {
              const totGross = c.annual.reduce((s, a) => s + a.grossSales, 0);
              const totReb = c.annual.reduce((s, a) => s + a.totalRebates, 0);
              const totCB = c.annual.reduce((s, a) => s + a.totalChargebacks, 0);
              const totOth = c.annual.reduce((s, a) => s + a.totalOther, 0);
              const totNet = c.annual.reduce((s, a) => s + a.netSales, 0);
              const wfData = [
                { label: 'Gross', value: totGross / 1e6 },
                { label: 'Rebates', value: -totReb / 1e6 },
                { label: 'CB', value: -totCB / 1e6 },
                { label: 'Fees', value: -totOth / 1e6 },
                { label: 'Net', value: totNet / 1e6 },
              ];
              return (
                <div key={i} className="bg-white rounded-xl border border-[#EAECEC] p-3">
                  <div className="text-xs font-bold text-[#004567] mb-2">{c.scenario.name}</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={wfData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`$${Math.abs(Number(v)).toFixed(1)}M`]} />
                      <Bar dataKey="value" fill={COMPARE_COLORS[i]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Section 4: Version History ───────────────────────────────────────────

function VersionHistory() {
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const scenarios = useStore(s => s.scenarios);
  const loadScenario = useStore(s => s.loadScenario);
  const active = activeScenarioId ? scenarios[activeScenarioId] : null;

  if (!active || active.history.length === 0) {
    return <div className="text-sm text-[#9296B2] py-2">No version history available.</div>;
  }

  return (
    <div className="space-y-2">
      {[...active.history].reverse().map(entry => (
        <div key={entry.version} className="flex items-center gap-4 p-3 bg-white border border-[#EAECEC] rounded-lg">
          <div className="w-10 h-10 rounded-full bg-[#004567] text-white flex items-center justify-center text-xs font-bold shrink-0">
            v{entry.version}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#004567]">{entry.changesSummary}</div>
            <div className="text-[10px] text-[#9296B2]">{new Date(entry.savedAt).toLocaleString()}</div>
          </div>
          {entry.version === active.version ? (
            <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded font-bold">Current</span>
          ) : (
            <button onClick={() => loadScenario(active.id)}
              className="text-[10px] px-3 py-1 border border-[#EAECEC] rounded font-semibold text-[#44546A] hover:bg-[#EAECEC]">
              Restore
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Scenario Manager Content ────────────────────────────────────────────

function ScenarioManagerContent() {
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <ActiveScenarioBar />

      <SectionHeader>My Scenarios</SectionHeader>
      <ScenarioList compareSet={compareIds} toggleCompare={toggleCompare} />

      {compareIds.size >= 2 && (
        <div className="flex items-center gap-3 p-3 bg-[#FFF9EE] border border-[#C98B27] rounded-lg">
          <span className="text-xs font-semibold text-[#004567]">{compareIds.size} scenarios selected</span>
          <button onClick={() => setShowCompare(!showCompare)}
            className="text-xs px-4 py-1.5 bg-[#C98B27] text-white rounded-md font-semibold hover:bg-[#b07a20]">
            {showCompare ? 'Hide Comparison' : 'Compare Selected'}
          </button>
        </div>
      )}

      {showCompare && compareIds.size >= 2 && (
        <CompareView ids={Array.from(compareIds)} />
      )}

      <Accordion title="Version History" summary="Saved versions of the active scenario">
        <VersionHistory />
      </Accordion>
    </div>
  );
}

// ── Main Scenarios Page ─────────────────────────────────────────────────

import { SensitivityTab } from './SensitivityTab';

export function ScenariosPage() {
  const [innerTab, setInnerTab] = useState<'manager' | 'sensitivity'>('manager');

  const tabs = [
    { key: 'manager' as const, label: 'Scenario Manager' },
    { key: 'sensitivity' as const, label: 'Sensitivity Analysis' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-[#004567]">Scenarios & Sensitivity</h2>

      <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setInnerTab(t.key)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition-all
              ${innerTab === t.key ? 'bg-[#004567] text-white shadow-md' : 'text-[#44546A] hover:bg-white hover:text-[#004567]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {innerTab === 'manager' && <ScenarioManagerContent />}
      {innerTab === 'sensitivity' && <SensitivityTab />}
    </div>
  );
}
