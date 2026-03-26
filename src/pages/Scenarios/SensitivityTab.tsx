import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useComputedData } from '../../engine/hooks';
import { fmtD, fmtPct, fmtM, fmtSales } from '../../engine/compute';
import { SectionHeader } from '../../shared/SectionHeader';
import { DataTable } from '../../shared/DataTable';
import {
  runTornado, runTwoWay, runStressTest, runRescueSimulator, runRebateStressTest,
  type TargetMetric, type BaseAssumptions, type StressParams, type RescueParams, type RebateStressParams,
} from '../../engine/sensitivity';
import type { BenefitType } from '../../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = '%' }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-xs font-medium text-[#44546A] w-48 shrink-0">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="flex-1" />
      <span className="text-xs font-mono w-14 text-right text-[#004567] font-bold">{value}{suffix}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A — Tornado Diagram
// ═══════════════════════════════════════════════════════════════════════════

function TornadoSection() {
  const store = useStore();
  const benefitType = store.benefitType;
  const { forecastYears } = useComputedData();
  const [metric, setMetric] = useState<TargetMetric>('netSales');
  const [variation, setVariation] = useState(10);
  const [targetYear, setTargetYear] = useState<number | undefined>(undefined);
  const [results, setResults] = useState<ReturnType<typeof runTornado> | null>(null);
  const [running, setRunning] = useState(false);

  const baseAssumptions: BaseAssumptions = useMemo(() => ({
    forecast: store.forecast,
    channelAllocations: store.channelAllocations,
    discounts: store.discounts,
    rebates: store.rebates,
    otherRates: store.otherRates,
    idnList: store.idnList,
    activeChannels: store.activeChannels,
    referenceProduct: store.referenceProduct,
    iraConfig: store.iraConfig,
  }), [store.forecast, store.channelAllocations, store.discounts, store.rebates, store.otherRates, store.idnList, store.activeChannels, store.referenceProduct, store.iraConfig]);

  const handleRun = () => {
    setRunning(true);
    // Use setTimeout to allow UI to show spinner
    setTimeout(() => {
      const r = runTornado(baseAssumptions, metric, variation, targetYear, benefitType);
      setResults(r.slice(0, 15));
      setRunning(false);
    }, 10);
  };

  const formatVal = (v: number) => {
    switch (metric) {
      case 'netSales': return fmtSales(v);
      case 'gtnPct': return fmtPct(v);
      case 'asp': case 'netPricePerUnit': return fmtD(v);
    }
  };

  const chartData = results?.map(r => ({
    name: r.inputName,
    low: r.lowValue - r.baseValue,
    high: r.highValue - r.baseValue,
    range: [r.lowValue - r.baseValue, r.highValue - r.baseValue],
  })) ?? [];

  return (
    <div className="space-y-4">
      <SectionHeader>Tornado Diagram (One-Way Sensitivity)</SectionHeader>
      <div className="flex flex-wrap items-end gap-4 p-4 bg-white rounded-xl border border-[#EAECEC]">
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Target Metric</label>
          <select value={metric} onChange={e => setMetric(e.target.value as TargetMetric)}
            className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#C98B27] outline-none">
            <option value="netSales">Net Sales</option>
            <option value="gtnPct">GTN %</option>
            <option value="asp">ASP</option>
            <option value="netPricePerUnit">Net Price/Unit</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Variation ±{variation}%</label>
          <input type="range" min={1} max={30} value={variation} onChange={e => setVariation(Number(e.target.value))} className="w-32" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Target Year</label>
          <select value={targetYear ?? ''} onChange={e => setTargetYear(e.target.value ? Number(e.target.value) : undefined)}
            className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#C98B27] outline-none">
            <option value="">All Years Combined</option>
            {forecastYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={handleRun} disabled={running}
          className="px-4 py-1.5 bg-[#004567] text-white rounded-md text-sm font-semibold hover:bg-[#004466] disabled:opacity-50">
          {running ? 'Running...' : 'Run Analysis'}
        </button>
      </div>

      {results && (
        <>
          <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
            <ResponsiveContainer width="100%" height={Math.max(300, results.length * 28 + 60)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 140, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <ReferenceLine x={0} stroke="#004567" strokeWidth={2} />
                <Bar dataKey="low" name="Low Impact" stackId="range">
                  {chartData.map((_, i) => <Cell key={i} fill={chartData[i].low < 0 ? '#f87171' : '#5B9BD5'} />)}
                </Bar>
                <Bar dataKey="high" name="High Impact" stackId="range">
                  {chartData.map((_, i) => <Cell key={i} fill={chartData[i].high > 0 ? '#5B9BD5' : '#f87171'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable
            headers={['Input Variable', 'Low (-' + variation + '%)', 'Base', 'High (+' + variation + '%)', 'Impact']}
            rows={results.map(r => [r.inputName, formatVal(r.lowValue), formatVal(r.baseValue), formatVal(r.highValue), formatVal(r.impact)])}
          />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// B — Two-Way Sensitivity
// ═══════════════════════════════════════════════════════════════════════════

function getVariableOptions(bt: BenefitType): string[] {
  const common = ['WAC per Unit', 'AMP per Unit', 'Forecast Volume', 'Admin Fee', 'Dist Fee', 'Returns'];
  const bnbOnly = ['GPO Discount', 'IDN Discount', '340B Discount', 'VA FSS Discount',
    'Medicare Part B Mix', 'GPO/IDN Non-340B Mix'];
  const pbxOnly = ['Com PBM Rebate', 'Com Med Rebate', 'Mcr Part D Rebate',
    'Managed Mcaid Rebate', 'Medicaid FFS Rebate',
    'Specialty Pharm Fee', 'PAP / Copay Assist',
    'Commercial PBM Mix', 'Medicare Part D Mix'];
  return bt === 'buy-and-bill' ? [...common, ...bnbOnly] : [...common, ...pbxOnly];
}

function TwoWaySection() {
  const store = useStore();
  const isBnB = store.benefitType === 'buy-and-bill';
  const varOptions = getVariableOptions(store.benefitType);
  const [var1Name, setVar1Name] = useState(isBnB ? 'GPO Discount' : 'Com PBM Rebate');
  const [var2Name, setVar2Name] = useState('Forecast Volume');
  const [metric, setMetric] = useState<TargetMetric>('netSales');
  const [range, setRange] = useState(15);
  const [steps, setSteps] = useState(5);
  const [result, setResult] = useState<ReturnType<typeof runTwoWay> | null>(null);
  const [running, setRunning] = useState(false);

  const baseAssumptions: BaseAssumptions = useMemo(() => ({
    forecast: store.forecast, channelAllocations: store.channelAllocations,
    discounts: store.discounts, rebates: store.rebates, otherRates: store.otherRates,
    idnList: store.idnList, activeChannels: store.activeChannels,
    referenceProduct: store.referenceProduct, iraConfig: store.iraConfig,
  }), [store.forecast, store.channelAllocations, store.discounts, store.rebates, store.otherRates, store.idnList, store.activeChannels, store.referenceProduct, store.iraConfig]);

  const handleGenerate = () => {
    setRunning(true);
    setTimeout(() => {
      const r = runTwoWay(baseAssumptions,
        { name: var1Name, key: var1Name, min: -range, max: range, steps },
        { name: var2Name, key: var2Name, min: -range, max: range, steps },
        metric);
      setResult(r);
      setRunning(false);
    }, 10);
  };

  const formatVal = (v: number) => {
    switch (metric) {
      case 'netSales': return fmtM(v);
      case 'gtnPct': return fmtPct(v);
      case 'asp': case 'netPricePerUnit': return fmtD(v);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader>Two-Way Sensitivity Heat Map</SectionHeader>
      <div className="flex flex-wrap items-end gap-4 p-4 bg-white rounded-xl border border-[#EAECEC]">
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Variable 1 (rows)</label>
          <select value={var1Name} onChange={e => setVar1Name(e.target.value)}
            className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#C98B27] outline-none">
            {varOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Variable 2 (columns)</label>
          <select value={var2Name} onChange={e => setVar2Name(e.target.value)}
            className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#C98B27] outline-none">
            {varOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Target Metric</label>
          <select value={metric} onChange={e => setMetric(e.target.value as TargetMetric)}
            className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#C98B27] outline-none">
            <option value="netSales">Net Sales</option>
            <option value="gtnPct">GTN %</option>
            <option value="asp">ASP</option>
            <option value="netPricePerUnit">Net Price/Unit</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Range ±{range}%</label>
          <input type="range" min={5} max={30} value={range} onChange={e => setRange(Number(e.target.value))} className="w-24" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Steps: {steps}</label>
          <input type="range" min={3} max={8} value={steps} onChange={e => setSteps(Number(e.target.value))} className="w-20" />
        </div>
        <button onClick={handleGenerate} disabled={running}
          className="px-4 py-1.5 bg-[#004567] text-white rounded-md text-sm font-semibold hover:bg-[#004466] disabled:opacity-50">
          {running ? 'Computing...' : 'Generate Heat Map'}
        </button>
      </div>

      {result && result.values.length > 0 && (
        <div className="overflow-auto rounded-lg border border-[#EAECEC]">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="bg-[#004567] text-white px-3 py-2 text-left font-mono">
                  {var1Name} ↓ / {var2Name} →
                </th>
                {result.colLabels.map((c, ci) => (
                  <th key={ci} className="bg-[#004567] text-white px-3 py-2 text-center font-mono">{c > 0 ? '+' : ''}{c.toFixed(0)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.values.map((row, ri) => {
                const allVals = result.values.flat();
                const minVal = Math.min(...allVals);
                const maxVal = Math.max(...allVals);
                const midVal = (minVal + maxVal) / 2;
                return (
                  <tr key={ri}>
                    <td className="bg-[#F7F9FC] font-semibold text-[#004567] px-3 py-1.5 border border-[#EAECEC] font-mono">
                      {result.rowLabels[ri] > 0 ? '+' : ''}{result.rowLabels[ri].toFixed(0)}%
                    </td>
                    {row.map((val, ci) => {
                      const ratio = maxVal !== minVal ? (val - minVal) / (maxVal - minVal) : 0.5;
                      const r = val < midVal ? Math.round(220 + (1 - ratio * 2) * 35) : Math.round(220 - (ratio - 0.5) * 2 * 100);
                      const g = val > midVal ? Math.round(220 + (ratio * 2 - 1) * 35) : Math.round(220 - (0.5 - ratio) * 2 * 100);
                      const bg = `rgb(${Math.max(150, Math.min(255, r))}, ${Math.max(150, Math.min(255, g))}, ${Math.max(150, Math.min(220, 200))})`;
                      return (
                        <td key={ci} className="px-3 py-1.5 text-center font-mono border border-[#EAECEC]"
                          style={{ backgroundColor: bg }}>
                          {formatVal(val)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// C — ASP Stress Test
// ═══════════════════════════════════════════════════════════════════════════

function StressTestSection() {
  const { aspData, monthly, forecastYears, channelAllocByYear, discountByYear } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const idnList = useStore(s => s.idnList);

  const [gpoDisc, setGpoDisc] = useState(30);
  const [idnDisc, setIdnDisc] = useState(35);
  const [b340Mix, setB340Mix] = useState(15);
  const [gpoMix, setGpoMix] = useState(15);
  const [pbmMix, setPbmMix] = useState(35);
  const [wacPct, setWacPct] = useState(100);
  const [idnRef, setIdnRef] = useState(0);

  const idnFloor = useMemo(() => {
    const idn = idnList[idnRef];
    if (!idn) return 0;
    return (forecast[0]?.wacPerUnit ?? 1500) * (1 - idn.discount / 100);
  }, [idnList, idnRef, forecast]);

  const params: StressParams = { gpoDisc, idnDisc, b340Mix, gpoMix, pbmMix, wacPct };

  const stressedASP = useMemo(() =>
    runStressTest(monthly, forecastYears, channelAllocByYear, discountByYear, params),
    [monthly, forecastYears, channelAllocByYear, discountByYear, gpoDisc, idnDisc, b340Mix, gpoMix, pbmMix, wacPct]);

  const chartData = useMemo(() =>
    aspData.map((base, i) => ({
      period: base.period,
      'Baseline ASP': base.rollingASP6M,
      'Stress ASP': stressedASP[i]?.rollingASP6M ?? 0,
    })),
    [aspData, stressedASP]);

  const liveRisk = useMemo(() => {
    const last = stressedASP[stressedASP.length - 1];
    const baseLast = aspData[aspData.length - 1];
    if (!last || !baseLast) return null;
    return {
      stressASP: last.rollingASP6M, baseASP: baseLast.rollingASP6M,
      safe: last.rollingASP6M > idnFloor,
      margin: last.aspPlus6 - idnFloor,
    };
  }, [stressedASP, aspData, idnFloor]);

  const scorecard = useMemo(() =>
    forecastYears.map(yr => {
      const base = aspData.filter(r => r.year === yr);
      const stress = stressedASP.filter(r => r.year === yr);
      const avgBase = base.reduce((s, r) => s + r.rollingASP6M, 0) / (base.length || 1);
      const avgStress = stress.reduce((s, r) => s + r.rollingASP6M, 0) / (stress.length || 1);
      return { year: yr, baseASP: avgBase, stressASP: avgStress, safe: avgStress > idnFloor };
    }),
    [forecastYears, aspData, stressedASP, idnFloor]);

  return (
    <div className="space-y-4">
      <SectionHeader>ASP Risk Stress Test</SectionHeader>
      <div className="border-2 border-red-300 rounded-xl p-4 bg-red-50/30">
        <p className="text-xs text-[#44546A] mb-3">
          Stress ASP downward to identify the tipping point where it falls below the IDN acquisition floor.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
          {/* Left: sliders + readout */}
          <div className="space-y-3">
            <div className="mb-3">
              <label className="text-xs font-semibold text-[#44546A] block mb-1">Reference IDN (floor)</label>
              <select value={idnRef} onChange={e => setIdnRef(Number(e.target.value))}
                className="w-full border border-[#EAECEC] rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-[#C98B27] outline-none">
                {idnList.map((idn, i) => <option key={i} value={i}>{idn.name}</option>)}
              </select>
            </div>
            <SliderRow label="GPO Discount %" value={gpoDisc} onChange={setGpoDisc} min={0} max={70} step={0.5} />
            <SliderRow label="IDN Discount %" value={idnDisc} onChange={setIdnDisc} min={0} max={70} step={0.5} />
            <SliderRow label="340B Channel Mix %" value={b340Mix} onChange={setB340Mix} min={0} max={40} />
            <SliderRow label="GPO/IDN Non-340B Mix %" value={gpoMix} onChange={setGpoMix} min={0} max={50} />
            <SliderRow label="Commercial PBM Mix %" value={pbmMix} onChange={setPbmMix} min={0} max={60} />
            <SliderRow label="WAC as % of current" value={wacPct} onChange={setWacPct} min={50} max={110} />

            {/* Live risk readout */}
            {liveRisk && (
              <div className={`rounded-lg p-3 border-2 ${liveRisk.safe ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
                <div className={`text-sm font-bold mb-2 ${liveRisk.safe ? 'text-green-700' : 'text-red-700'}`}>
                  {liveRisk.safe ? '🟢 SAFE' : '🔴 IN RISK'}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-[#9296B2]">Stress ASP:</span> <span className="font-mono font-bold text-[#004567]">{fmtD(liveRisk.stressASP)}</span></div>
                  <div><span className="text-[#9296B2]">Vs Baseline:</span> <span className={`font-mono font-bold ${liveRisk.stressASP < liveRisk.baseASP ? 'text-red-600' : 'text-green-600'}`}>{fmtD(liveRisk.stressASP - liveRisk.baseASP)}</span></div>
                  <div><span className="text-[#9296B2]">IDN Floor:</span> <span className="font-mono font-bold text-[#004567]">{fmtD(idnFloor)}</span></div>
                  <div><span className="text-[#9296B2]">Margin:</span> <span className={`font-mono font-bold ${liveRisk.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtD(liveRisk.margin)}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Right: chart */}
          <div className="bg-white rounded-xl border border-[#EAECEC] p-3">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="period" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={60} interval={Math.floor(chartData.length / 12)} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtD(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={idnFloor} stroke="#f87171" strokeDasharray="5 3" strokeWidth={2} label={{ value: `Floor: ${fmtD(idnFloor)}`, position: 'right', fontSize: 9, fill: '#f87171' }} />
                <Line dataKey="Baseline ASP" stroke="#4ade80" strokeWidth={2} dot={false} />
                <Line dataKey="Stress ASP" stroke="#f87171" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Scorecard */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {scorecard.map(s => (
            <div key={s.year} className={`rounded-lg px-3 py-2 text-center border ${s.safe ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="font-bold text-xs text-[#004567]">{s.year}</div>
              <div className={`text-lg ${s.safe ? 'text-green-600' : 'text-red-600'}`}>{s.safe ? '🟢' : '🔴'}</div>
              <div className="text-[10px] font-mono text-[#44546A]">ASP: {fmtD(s.stressASP)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// D — Rescue Simulator
// ═══════════════════════════════════════════════════════════════════════════

function RescueSection() {
  const { aspData, monthly, forecastYears, channelAllocByYear, discountByYear } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const idnList = useStore(s => s.idnList);

  const [gpoDisc, setGpoDisc] = useState(12);
  const [idnDisc, setIdnDisc] = useState(18);
  const [pbmMix, setPbmMix] = useState(20);
  const [mcrBMix, setMcrBMix] = useState(20);
  const [gpoMix, setGpoMix] = useState(5);
  const [idnRef, setIdnRef] = useState(0);

  const idnFloor = useMemo(() => {
    const idn = idnList[idnRef];
    if (!idn) return 0;
    return (forecast[0]?.wacPerUnit ?? 1500) * (1 - idn.discount / 100);
  }, [idnList, idnRef, forecast]);

  const params: RescueParams = { gpoDisc, idnDisc, pbmMix, mcrBMix, gpoMix };

  const rescuedASP = useMemo(() =>
    runRescueSimulator(monthly, forecastYears, channelAllocByYear, discountByYear, params),
    [monthly, forecastYears, channelAllocByYear, discountByYear, gpoDisc, idnDisc, pbmMix, mcrBMix, gpoMix]);

  const chartData = useMemo(() =>
    aspData.map((base, i) => ({
      period: base.period,
      'Baseline ASP': base.rollingASP6M,
      'Rescue ASP': rescuedASP[i]?.rollingASP6M ?? 0,
    })),
    [aspData, rescuedASP]);

  const scorecard = useMemo(() =>
    forecastYears.map(yr => {
      const base = aspData.filter(r => r.year === yr);
      const rescue = rescuedASP.filter(r => r.year === yr);
      const avgBase = base.reduce((s, r) => s + r.rollingASP6M, 0) / (base.length || 1);
      const avgRescue = rescue.reduce((s, r) => s + r.rollingASP6M, 0) / (rescue.length || 1);
      return { year: yr, baseASP: avgBase, rescueASP: avgRescue, safe: avgRescue > idnFloor };
    }),
    [forecastYears, aspData, rescuedASP, idnFloor]);

  return (
    <div className="space-y-4">
      <SectionHeader>ASP Rescue Simulator</SectionHeader>
      <div className="border-2 border-green-300 rounded-xl p-4 bg-green-50/30">
        <p className="text-xs text-[#44546A] mb-3">
          Adjust contract terms to find the combination that lifts ASP above the IDN acquisition floor.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
          <div className="space-y-3">
            <div className="mb-3">
              <label className="text-xs font-semibold text-[#44546A] block mb-1">Track IDN (floor)</label>
              <select value={idnRef} onChange={e => setIdnRef(Number(e.target.value))}
                className="w-full border border-[#EAECEC] rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-[#C98B27] outline-none">
                {idnList.map((idn, i) => <option key={i} value={i}>{idn.name}</option>)}
              </select>
            </div>
            <SliderRow label="GPO Discount %" value={gpoDisc} onChange={setGpoDisc} min={0} max={50} step={0.5} />
            <SliderRow label="IDN Discount %" value={idnDisc} onChange={setIdnDisc} min={0} max={60} step={0.5} />
            <SliderRow label="Commercial PBM Mix %" value={pbmMix} onChange={setPbmMix} min={0} max={60} />
            <SliderRow label="Medicare Part B Mix %" value={mcrBMix} onChange={setMcrBMix} min={0} max={40} />
            <SliderRow label="GPO/IDN Non-340B Mix %" value={gpoMix} onChange={setGpoMix} min={0} max={40} />
          </div>

          <div className="bg-white rounded-xl border border-[#EAECEC] p-3">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="period" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={60} interval={Math.floor(chartData.length / 12)} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtD(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={idnFloor} stroke="#f87171" strokeDasharray="5 3" strokeWidth={2} label={{ value: `Floor: ${fmtD(idnFloor)}`, position: 'right', fontSize: 9, fill: '#f87171' }} />
                <Line dataKey="Baseline ASP" stroke="#9296B2" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="Rescue ASP" stroke="#4ade80" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {scorecard.map(s => (
            <div key={s.year} className={`rounded-lg px-3 py-2 text-center border ${s.safe ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="font-bold text-xs text-[#004567]">{s.year}</div>
              <div className={`text-lg ${s.safe ? '✅' : '🚩'}`}>{s.safe ? '✅' : '🚩'}</div>
              <div className="text-[10px] font-mono text-[#44546A]">ASP: {fmtD(s.rescueASP)}</div>
              <div className={`text-[10px] font-mono ${s.rescueASP > s.baseASP ? 'text-green-600' : 'text-red-600'}`}>
                Δ {fmtD(s.rescueASP - s.baseASP)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// E — Rebate & Formulary Stress Test (Pharmacy Benefit)
// ═══════════════════════════════════════════════════════════════════════════

function RebateStressSection() {
  const store = useStore();
  const { annualData, forecastYears } = useComputedData();
  const [pbmRebate, setPbmRebate] = useState(25);
  const [partDRebate, setPartDRebate] = useState(22);
  const [manMcaidRebate, setManMcaidRebate] = useState(32);
  const [specPharmFee, setSpecPharmFee] = useState(2.5);
  const [papCost, setPapCost] = useState(6);
  const [pbmMix, setPbmMix] = useState(40);

  const baseAssumptions: BaseAssumptions = useMemo(() => ({
    forecast: store.forecast, channelAllocations: store.channelAllocations,
    discounts: store.discounts, rebates: store.rebates, otherRates: store.otherRates,
    idnList: store.idnList, activeChannels: store.activeChannels,
    referenceProduct: store.referenceProduct, iraConfig: store.iraConfig,
  }), [store.forecast, store.channelAllocations, store.discounts, store.rebates, store.otherRates, store.idnList, store.activeChannels, store.referenceProduct, store.iraConfig]);

  const params: RebateStressParams = { pbmRebate, partDRebate, manMcaidRebate, specPharmFee, papCost, pbmMix };

  const stressResult = useMemo(() => runRebateStressTest(baseAssumptions, params),
    [baseAssumptions, pbmRebate, partDRebate, manMcaidRebate, specPharmFee, papCost, pbmMix]);

  const formularyStatus = pbmRebate > 25 ? 'PREFERRED' : pbmRebate >= 15 ? 'NON-PREFERRED' : 'NON-FORMULARY';
  const formularyColor = pbmRebate > 25 ? 'border-green-400 bg-green-50 text-green-700' : pbmRebate >= 15 ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-red-400 bg-red-50 text-red-700';

  const chartData = forecastYears.map((yr, i) => {
    const base = annualData[i];
    const stress = stressResult.annual[i];
    return {
      year: yr,
      'Base Net $/Unit': base ? (base.units > 0 ? base.netSales / base.units : 0) : 0,
      'Stress Net $/Unit': stress ? (stress.units > 0 ? stress.netSales / stress.units : 0) : 0,
      'Base GTN %': base?.gtnPct ?? 0,
      'Stress GTN %': stress?.gtnPct ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <SectionHeader>Rebate &amp; Formulary Stress Test</SectionHeader>
      <div className="border-2 border-amber-300 rounded-xl p-4 bg-amber-50/20">
        <p className="text-xs text-[#44546A] mb-3">
          Stress rebate rates and fee assumptions to see their impact on net price and formulary positioning.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
          <div className="space-y-3">
            <SliderRow label="PBM Rebate %" value={pbmRebate} onChange={setPbmRebate} min={0} max={60} step={0.5} />
            <SliderRow label="Part D Rebate %" value={partDRebate} onChange={setPartDRebate} min={0} max={50} step={0.5} />
            <SliderRow label="Managed Mcaid Rebate %" value={manMcaidRebate} onChange={setManMcaidRebate} min={0} max={55} step={0.5} />
            <SliderRow label="Specialty Pharm Fee %" value={specPharmFee} onChange={setSpecPharmFee} min={0} max={8} step={0.1} />
            <SliderRow label="PAP/Copay Cost %" value={papCost} onChange={setPapCost} min={0} max={15} step={0.5} />
            <SliderRow label="PBM Channel Mix %" value={pbmMix} onChange={setPbmMix} min={10} max={80} />

            <div className={`rounded-lg p-3 border-2 text-center ${formularyColor}`}>
              <div className="text-xs font-bold mb-1">Formulary Risk</div>
              <div className="text-lg font-bold">{formularyStatus}</div>
              <div className="text-[10px]">PBM Rebate: {pbmRebate}%</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#EAECEC] p-3">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtD(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="Base Net $/Unit" stroke="#9296B2" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="Stress Net $/Unit" stroke="#C98B27" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {forecastYears.map((yr, i) => {
            const base = annualData[i];
            const stress = stressResult.annual[i];
            const baseGtn = base?.gtnPct ?? 0;
            const stressGtn = stress?.gtnPct ?? 0;
            return (
              <div key={yr} className="rounded-lg px-3 py-2 text-center border border-[#EAECEC] bg-white">
                <div className="font-bold text-xs text-[#004567]">{yr}</div>
                <div className="text-[10px] font-mono text-[#9296B2]">Base: {baseGtn.toFixed(1)}%</div>
                <div className={`text-[10px] font-mono font-bold ${stressGtn > baseGtn ? 'text-red-600' : 'text-green-600'}`}>
                  Stress: {stressGtn.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// F — Net Price Recovery Simulator (Pharmacy Benefit)
// ═══════════════════════════════════════════════════════════════════════════

function NetPriceRecoverySection() {
  const store = useStore();
  const { annualData, forecastYears } = useComputedData();
  const [targetPbm, setTargetPbm] = useState(18);
  const [targetPartD, setTargetPartD] = useState(15);
  const [reduceSpec, setReduceSpec] = useState(1.0);
  const [reducePap, setReducePap] = useState(2.5);
  const [shiftPbmMix, setShiftPbmMix] = useState(30);

  const baseAssumptions: BaseAssumptions = useMemo(() => ({
    forecast: store.forecast, channelAllocations: store.channelAllocations,
    discounts: store.discounts, rebates: store.rebates, otherRates: store.otherRates,
    idnList: store.idnList, activeChannels: store.activeChannels,
    referenceProduct: store.referenceProduct, iraConfig: store.iraConfig,
  }), [store.forecast, store.channelAllocations, store.discounts, store.rebates, store.otherRates, store.idnList, store.activeChannels, store.referenceProduct, store.iraConfig]);

  const rescueResult = useMemo(() => runRebateStressTest(baseAssumptions, {
    pbmRebate: targetPbm, partDRebate: targetPartD, manMcaidRebate: store.rebates[0]?.manMcaid ?? 30,
    specPharmFee: reduceSpec, papCost: reducePap, pbmMix: shiftPbmMix,
  }), [baseAssumptions, targetPbm, targetPartD, reduceSpec, reducePap, shiftPbmMix, store.rebates]);

  const chartData = forecastYears.map((yr, i) => {
    const base = annualData[i];
    const rescue = rescueResult.annual[i];
    return {
      year: yr,
      'Baseline Net $/Unit': base ? (base.units > 0 ? base.netSales / base.units : 0) : 0,
      'Rescue Net $/Unit': rescue ? (rescue.units > 0 ? rescue.netSales / rescue.units : 0) : 0,
    };
  });

  return (
    <div className="space-y-4">
      <SectionHeader>Net Price Recovery Simulator</SectionHeader>
      <div className="border-2 border-green-300 rounded-xl p-4 bg-green-50/20">
        <p className="text-xs text-[#44546A] mb-3">
          Adjust rebate and fee targets to find the combination that improves net price per unit.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
          <div className="space-y-3">
            <SliderRow label="Target PBM Rebate %" value={targetPbm} onChange={setTargetPbm} min={0} max={50} step={0.5} />
            <SliderRow label="Target Part D Rebate %" value={targetPartD} onChange={setTargetPartD} min={0} max={40} step={0.5} />
            <SliderRow label="Reduce Specialty Fee to %" value={reduceSpec} onChange={setReduceSpec} min={0} max={5} step={0.1} />
            <SliderRow label="Reduce PAP Cost to %" value={reducePap} onChange={setReducePap} min={0} max={10} step={0.5} />
            <SliderRow label="Shift PBM Mix to %" value={shiftPbmMix} onChange={setShiftPbmMix} min={10} max={60} />
          </div>

          <div className="bg-white rounded-xl border border-[#EAECEC] p-3">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtD(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="Baseline Net $/Unit" stroke="#9296B2" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line dataKey="Rescue Net $/Unit" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {forecastYears.map((yr, i) => {
            const base = annualData[i];
            const rescue = rescueResult.annual[i];
            const baseNet = base && base.units > 0 ? base.netSales / base.units : 0;
            const rescueNet = rescue && rescue.units > 0 ? rescue.netSales / rescue.units : 0;
            const delta = rescueNet - baseNet;
            return (
              <div key={yr} className="rounded-lg px-3 py-2 text-center border border-[#EAECEC] bg-white">
                <div className="font-bold text-xs text-[#004567]">{yr}</div>
                <div className="text-[10px] font-mono text-[#9296B2]">Base: {fmtD(baseNet)}</div>
                <div className="text-[10px] font-mono font-bold text-[#004567]">Rescue: {fmtD(rescueNet)}</div>
                <div className={`text-[10px] font-mono font-bold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Δ {fmtD(delta)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Export
// ═══════════════════════════════════════════════════════════════════════════

export function SensitivityTab() {
  const benefitType = useStore(s => s.benefitType);
  const isBnB = benefitType === 'buy-and-bill';

  return (
    <div className="space-y-6">
      <TornadoSection />
      <TwoWaySection />
      {isBnB ? <StressTestSection /> : <RebateStressSection />}
      {isBnB ? <RescueSection /> : <NetPriceRecoverySection />}
    </div>
  );
}
