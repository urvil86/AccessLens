import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { expandToMonthly, computeASPSeries, computeGTN, annualRollup, fmtSales, fmtM, fmtPct } from '../../engine/compute';
import { MetricCard } from '../../shared/MetricCard';
import { SectionHeader } from '../../shared/SectionHeader';
import { PORTFOLIO_COLORS } from '../../engine/constants';
import type { Scenario, AnnualGTN } from '../../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart,
} from 'recharts';

function computeScenarioAnnual(sc: Scenario): AnnualGTN[] {
  const snap = sc.snapshot;
  const channelAllocByYear: Record<number, Record<string, number>> = {};
  for (const ca of snap.channelAllocations) channelAllocByYear[ca.year] = ca.allocations;
  const discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
  for (const d of snap.discounts) discountByYear[d.year] = { gpo: d.gpo, idn: d.idn, b340: d.b340, va: d.va };
  const rebateByYear: Record<number, { comPbm: number; comMed: number; mcrD: number; mcaid: number; manMcaid: number }> = {};
  for (const r of snap.rebates) rebateByYear[r.year] = { comPbm: r.comPbm, comMed: r.comMed, mcrD: r.mcrD, mcaid: r.mcaid, manMcaid: r.manMcaid };
  const otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number; specialtyPharmFee: number; papCost: number }> = {};
  for (const o of snap.otherRates) otherByYear[o.year] = { adminFee: o.adminFee, distFee: o.distFee, copay: o.copay, returns: o.returns, specialtyPharmFee: o.specialtyPharmFee ?? 0, papCost: o.papCost ?? 0 };
  const monthly = expandToMonthly(snap.forecast);
  const aspData = computeASPSeries(monthly, channelAllocByYear, discountByYear);
  const gtnData = computeGTN(monthly, aspData, channelAllocByYear, discountByYear, rebateByYear, otherByYear);
  return annualRollup(gtnData);
}

export function PortfolioDashboard() {
  const scenarios = useStore(s => s.scenarios);
  const setViewMode = useStore(s => s.setViewMode);
  const setActiveTab = useStore(s => s.setActiveTab);
  const loadScenario = useStore(s => s.loadScenario);

  const [metricMode, setMetricMode] = useState<'net' | 'gross'>('net');
  const [filterTherapy, setFilterTherapy] = useState<string[]>([]);
  const [filterBenefit, setFilterBenefit] = useState<string[]>([]);

  // Compute results for each scenario
  const scenarioResults = useMemo(() => {
    return Object.values(scenarios).map(sc => {
      try {
        const annual = computeScenarioAnnual(sc);
        return { scenario: sc, annual, hasResults: annual.length > 0 };
      } catch {
        return { scenario: sc, annual: [] as AnnualGTN[], hasResults: false };
      }
    });
  }, [scenarios]);

  // Apply filters
  const filtered = useMemo(() => {
    return scenarioResults.filter(sr => {
      if (filterTherapy.length > 0 && !filterTherapy.includes(sr.scenario.snapshot.therapyArea)) return false;
      if (filterBenefit.length > 0 && !filterBenefit.includes(sr.scenario.snapshot.benefitType)) return false;
      return true;
    });
  }, [scenarioResults, filterTherapy, filterBenefit]);

  const withResults = filtered.filter(sr => sr.hasResults);

  // Unique filter values
  const allTherapies = [...new Set(scenarioResults.map(sr => sr.scenario.snapshot.therapyArea))];
  const allBenefits = [...new Set(scenarioResults.map(sr => sr.scenario.snapshot.benefitType))];

  if (withResults.length < 2) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="bg-white rounded-2xl border border-[#EAECEC] shadow-lg p-8 max-w-lg text-center">
          <h2 className="text-xl font-bold text-[#004567] mb-2">Build your portfolio</h2>
          <p className="text-sm text-[#44546A] mb-6 leading-relaxed">
            Run the GTN engine for at least two scenarios to see portfolio-level analysis.
            Each scenario represents one product or asset.
          </p>
          <p className="text-xs text-[#9296B2] mb-4">
            Currently: {scenarioResults.length} scenario(s), {withResults.length} with results
          </p>
          <button onClick={() => setViewMode('brand')}
            className="px-6 py-2.5 bg-[#004567] text-white rounded-lg font-semibold hover:bg-[#004466]">
            Go to Brand View
          </button>
        </div>
      </div>
    );
  }

  // KPIs
  const totalGross = withResults.reduce((s, sr) => s + sr.annual.reduce((a, d) => a + d.grossSales, 0), 0);
  const totalNet = withResults.reduce((s, sr) => s + sr.annual.reduce((a, d) => a + d.netSales, 0), 0);
  const blendedGTN = totalGross > 0 ? ((totalGross - totalNet) / totalGross) * 100 : 0;
  const bestAsset = withResults.reduce((best, sr) => {
    const net = sr.annual.reduce((a, d) => a + d.netSales, 0);
    return net > (best?.net ?? 0) ? { name: sr.scenario.name, net } : best;
  }, null as { name: string; net: number } | null);

  // All years across scenarios
  const allYears = [...new Set(withResults.flatMap(sr => sr.annual.map(a => a.year)))].sort();

  // Revenue chart data
  const revenueData = allYears.map(yr => {
    const entry: Record<string, number | string> = { year: yr };
    for (const sr of withResults) {
      const yrData = sr.annual.find(a => a.year === yr);
      entry[sr.scenario.name] = metricMode === 'net'
        ? (yrData?.netSales ?? 0) / 1e6
        : (yrData?.grossSales ?? 0) / 1e6;
    }
    // Blended GTN%
    const yrGross = withResults.reduce((s, sr) => s + (sr.annual.find(a => a.year === yr)?.grossSales ?? 0), 0);
    const yrNet = withResults.reduce((s, sr) => s + (sr.annual.find(a => a.year === yr)?.netSales ?? 0), 0);
    entry['Blended GTN%'] = yrGross > 0 ? ((yrGross - yrNet) / yrGross) * 100 : 0;
    return entry;
  });

  // GTN trend data
  const gtnTrendData = allYears.map(yr => {
    const entry: Record<string, number | string> = { year: yr };
    for (const sr of withResults) {
      const yrData = sr.annual.find(a => a.year === yr);
      entry[sr.scenario.name] = yrData?.gtnPct ?? 0;
    }
    const yrGross = withResults.reduce((s, sr) => s + (sr.annual.find(a => a.year === yr)?.grossSales ?? 0), 0);
    const yrNet = withResults.reduce((s, sr) => s + (sr.annual.find(a => a.year === yr)?.netSales ?? 0), 0);
    entry['Portfolio Blended'] = yrGross > 0 ? ((yrGross - yrNet) / yrGross) * 100 : 0;
    return entry;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 p-3 bg-white rounded-lg border border-[#EAECEC]">
        <span className="text-xs font-bold text-[#004567]">Filters:</span>
        <div>
          <label className="text-[10px] text-[#44546A] block">Therapy Area</label>
          <select multiple value={filterTherapy} onChange={e => setFilterTherapy(Array.from(e.target.selectedOptions, o => o.value))}
            className="text-xs border border-[#EAECEC] rounded px-2 py-1 min-w-[120px]">
            {allTherapies.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#44546A] block">Benefit Type</label>
          <select multiple value={filterBenefit} onChange={e => setFilterBenefit(Array.from(e.target.selectedOptions, o => o.value))}
            className="text-xs border border-[#EAECEC] rounded px-2 py-1 min-w-[120px]">
            {allBenefits.map(b => <option key={b} value={b}>{b === 'buy-and-bill' ? 'Medical' : 'Pharmacy'}</option>)}
          </select>
        </div>
        {(filterTherapy.length > 0 || filterBenefit.length > 0) && (
          <button onClick={() => { setFilterTherapy([]); setFilterBenefit([]); }}
            className="text-[10px] text-[#C98B27] underline">Clear filters</button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Portfolio Gross Sales" value={fmtSales(totalGross)} />
        <MetricCard label="Portfolio Net Sales" value={fmtSales(totalNet)} />
        <MetricCard label="Blended GTN%" value={fmtPct(blendedGTN)} />
        <MetricCard label="Products" value={String(withResults.length)} />
        <MetricCard label="Best Asset" value={bestAsset?.name ?? '—'} />
      </div>

      {/* Revenue by Product */}
      <SectionHeader>Revenue by Product</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-0.5 w-fit mb-3">
          {(['net', 'gross'] as const).map(m => (
            <button key={m} onClick={() => setMetricMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${metricMode === m ? 'bg-[#004567] text-white shadow' : 'text-[#44546A]'}`}>
              {m === 'net' ? 'Net Sales' : 'Gross Sales'}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {withResults.map((sr, i) => (
              <Bar key={sr.scenario.id} yAxisId="left" dataKey={sr.scenario.name} stackId="rev"
                fill={PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]} />
            ))}
            <Line yAxisId="right" dataKey="Blended GTN%" stroke="#004567" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Blended GTN Trend */}
      <SectionHeader>Blended GTN% Trend</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={gtnTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${Number(v).toFixed(1)}%`]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {withResults.map((sr, i) => (
              <Line key={sr.scenario.id} dataKey={sr.scenario.name}
                stroke={PORTFOLIO_COLORS[i % PORTFOLIO_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
            <Line dataKey="Portfolio Blended" stroke="#004567" strokeWidth={3} strokeDasharray="8 4" dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table */}
      <SectionHeader>Portfolio Summary</SectionHeader>
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#004567] text-white">
              {['Product', 'Therapy', 'Benefit Type', 'Gross ($M)', 'Net ($M)', 'GTN%', 'Peak Year', 'Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((sr, i) => {
              const totGross = sr.annual.reduce((s, a) => s + a.grossSales, 0);
              const totNet = sr.annual.reduce((s, a) => s + a.netSales, 0);
              const avgGtn = sr.annual.length > 0 ? sr.annual.reduce((s, a) => s + a.gtnPct, 0) / sr.annual.length : 0;
              const peakYr = sr.annual.length > 0 ? sr.annual.reduce((b, a) => a.netSales > b.netSales ? a : b, sr.annual[0]).year : '—';
              const bt = sr.scenario.snapshot.benefitType;
              return (
                <tr key={sr.scenario.id} className={i % 2 ? 'bg-[#EAECEC]/40' : 'bg-white'}>
                  <td className="px-3 py-2">
                    <button onClick={() => { loadScenario(sr.scenario.id); setViewMode('brand'); setActiveTab('dashboard'); }}
                      className="font-semibold text-[#004567] hover:text-[#C98B27] underline">{sr.scenario.name}</button>
                  </td>
                  <td className="px-3 py-2 text-[#44546A]">{sr.scenario.snapshot.therapyArea}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${bt === 'buy-and-bill' ? 'bg-[#1D6FA4] text-white' : 'bg-[#2B5797] text-white'}`}>
                      {bt === 'buy-and-bill' ? 'Medical' : 'Pharmacy'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{sr.hasResults ? fmtM(totGross) : '—'}</td>
                  <td className="px-3 py-2 font-mono">{sr.hasResults ? fmtM(totNet) : '—'}</td>
                  <td className="px-3 py-2 font-mono">{sr.hasResults ? fmtPct(avgGtn) : '—'}</td>
                  <td className="px-3 py-2 font-mono">{sr.hasResults ? String(peakYr) : '—'}</td>
                  <td className="px-3 py-2">
                    {sr.hasResults
                      ? <span className="text-green-600 font-bold">✓</span>
                      : <span className="text-[#9296B2]">Not run</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
