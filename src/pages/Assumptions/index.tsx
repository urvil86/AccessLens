import { useState, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Accordion } from '../../shared/Accordion';
import { EditableGrid } from '../../shared/EditableGrid';
import { MONTH_PROFILES, CHANNELS, COLORS_MAIN } from '../../engine/constants';
import { fmtU, fmtD, fmtM } from '../../engine/compute';
import { useComputedData } from '../../engine/hooks';
import { generateTemplate, parseUpload, exportAssumptions, triggerDownload, type ParsedData } from '../../engine/excelIO';
import {
  ComposedChart, Bar, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Section 1: Volume & WAC ───────────────────────────────────────────────

function VolumeForecastSection() {
  const forecast = useStore(s => s.forecast);
  const updateForecastRow = useStore(s => s.updateForecastRow);
  const adoptionConfig = useStore(s => s.adoptionConfig);
  const setAdoptionConfig = useStore(s => s.setAdoptionConfig);
  const rp = useStore(s => s.referenceProduct);
  const { adoptionDetail, effectiveForecast } = useComputedData();
  const [showQuickFill, setShowQuickFill] = useState(false);
  const [wacEsc, setWacEsc] = useState(3);
  const [unitEsc, setUnitEsc] = useState(0);
  const [autoAMP, setAutoAMP] = useState(true);

  const columns = forecast.map(f => ({ key: String(f.year), label: String(f.year) }));
  const rows = [
    { key: 'units', label: 'Annual Units ⓘ', title: 'Total units projected for this year across all channels' },
    { key: 'wac', label: 'WAC $/Unit ⓘ', title: 'Wholesale Acquisition Cost — list price before any discounts or rebates' },
    { key: 'amp', label: 'AMP $/Unit ⓘ', title: 'Average Manufacturer Price — typically 80-90% of WAC. Used for 340B ceiling and Medicaid rebate calculations.' },
  ];

  const gridData = useMemo(() => {
    const d: Record<string, Record<string, number>> = { units: {}, wac: {}, amp: {} };
    for (const f of forecast) {
      d.units[String(f.year)] = f.annualUnits;
      d.wac[String(f.year)] = f.wacPerUnit;
      d.amp[String(f.year)] = f.ampPerUnit;
    }
    return d;
  }, [forecast]);

  const handleChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = forecast.findIndex(f => String(f.year) === colKey);
    if (idx < 0) return;
    if (rowKey === 'units') updateForecastRow(idx, { annualUnits: Math.round(value) });
    else if (rowKey === 'wac') {
      const updates: Partial<import('../../types').ForecastRow> = { wacPerUnit: value };
      if (autoAMP) updates.ampPerUnit = Math.round(value * 0.85 * 100) / 100;
      updateForecastRow(idx, updates);
    }
    else if (rowKey === 'amp') updateForecastRow(idx, { ampPerUnit: value });
  }, [forecast, updateForecastRow, autoAMP]);

  const handleProfileChange = useCallback((idx: number, profile: string) => {
    updateForecastRow(idx, { monthlyProfile: profile });
  }, [updateForecastRow]);

  const handleQuickFill = () => {
    if (forecast.length === 0) return;
    const baseUnits = forecast[0].annualUnits;
    const baseWac = forecast[0].wacPerUnit;
    for (let i = 1; i < forecast.length; i++) {
      const wac = Math.round(baseWac * Math.pow(1 + wacEsc / 100, i) * 100) / 100;
      updateForecastRow(i, {
        annualUnits: Math.round(baseUnits * Math.pow(1 + unitEsc / 100, i)),
        wacPerUnit: wac,
        ampPerUnit: Math.round(wac * 0.85 * 100) / 100,
      });
    }
    setShowQuickFill(false);
  };

  const chartData = forecast.map(f => ({
    year: f.year,
    units: f.annualUnits / 1000,
    gross: (f.annualUnits * f.wacPerUnit) / 1e6,
  }));

  const profileOptions = Object.keys(MONTH_PROFILES);

  const isAdoption = adoptionConfig.enabled && adoptionConfig.mode === 'adoption-curve';

  // Adoption chart data
  const adoptionChartData = useMemo(() => {
    if (!isAdoption || !effectiveForecast) return [];
    return effectiveForecast.map((f, i) => ({
      year: f.year,
      'Biosimilar Units': f.annualUnits,
      'RP Market': rp.totalMarketUnits[i] ?? 0,
      'Share %': rp.totalMarketUnits[i] > 0 ? (f.annualUnits / rp.totalMarketUnits[i]) * 100 : 0,
    }));
  }, [isAdoption, effectiveForecast, rp]);

  return (
    <div className="space-y-4">
      {/* Volume source toggle */}
      <div className="flex items-center gap-4 mb-2">
        <span className="text-xs font-semibold text-[#44546A]">Volume Source:</span>
        <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-0.5">
          <button onClick={() => setAdoptionConfig({ enabled: false, mode: 'manual' })}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${!isAdoption ? 'bg-[#004567] text-white shadow' : 'text-[#44546A] hover:bg-white'}`}>
            Manual Entry
          </button>
          <button onClick={() => setAdoptionConfig({ enabled: true, mode: 'adoption-curve' })}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${isAdoption ? 'bg-[#004567] text-white shadow' : 'text-[#44546A] hover:bg-white'}`}>
            Adoption Model
          </button>
        </div>
      </div>

      {/* Adoption model controls */}
      {isAdoption && (
        <div className="bg-[#FFF9EE] border border-[#C98B27] rounded-lg p-4 space-y-3">
          <div className="text-xs font-bold text-[#004567] mb-2">Adoption Parameters</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-[#44546A] block mb-1">Launch Month</label>
              <select value={adoptionConfig.launchMonth} onChange={e => setAdoptionConfig({ launchMonth: Number(e.target.value) })}
                className="w-full px-2 py-1 border border-[#EAECEC] rounded text-xs font-mono focus:ring-1 focus:ring-[#C98B27] outline-none">
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#44546A] block mb-1">Peak Market Share: {adoptionConfig.peakSharePct}%</label>
              <input type="range" min={5} max={80} value={adoptionConfig.peakSharePct} onChange={e => setAdoptionConfig({ peakSharePct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#44546A] block mb-1">Switch Rate/Month: {adoptionConfig.switchRatePctPerMonth}%</label>
              <input type="range" min={0.5} max={10} step={0.5} value={adoptionConfig.switchRatePctPerMonth} onChange={e => setAdoptionConfig({ switchRatePctPerMonth: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#44546A] block mb-1">New Patient Capture: {adoptionConfig.newPatientCapturePct}%</label>
              <input type="range" min={0} max={100} value={adoptionConfig.newPatientCapturePct} onChange={e => setAdoptionConfig({ newPatientCapturePct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#44546A] block mb-1">Interchangeable Uplift: {adoptionConfig.interchangeableUplift}x</label>
              <input type="range" min={1} max={5} step={0.5} value={adoptionConfig.interchangeableUplift} onChange={e => setAdoptionConfig({ interchangeableUplift: Number(e.target.value) })} />
              <span className="text-[9px] text-[#9296B2]">{rp.isInterchangeable ? '(Active — product is interchangeable)' : '(Inactive — not interchangeable)'}</span>
            </div>
          </div>

          {/* Adoption projection chart */}
          {adoptionChartData.length > 0 && (
            <div className="bg-white rounded-lg border border-[#EAECEC] p-3 mt-3">
              <div className="text-[10px] font-bold text-[#004567] mb-1">Projected Biosimilar Volume vs RP Market</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={adoptionChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#44546A' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#44546A' }} label={{ value: 'Units', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#9296B2' } }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#44546A' }} domain={[0, 100]} label={{ value: 'Share %', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#9296B2' } }} />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="RP Market" fill="#f87171" opacity={0.3} />
                  <Bar yAxisId="left" dataKey="Biosimilar Units" fill="#5B9BD5" opacity={0.7} />
                  <Line yAxisId="right" dataKey="Share %" stroke="#C98B27" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Computed volumes read-only table */}
          <div className="overflow-auto rounded-lg border border-[#EAECEC]">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-[#004567] text-white">
                <th className="px-3 py-1.5 text-left">Metric</th>
                {forecast.map(f => <th key={f.year} className="px-3 py-1.5 text-center">{f.year}</th>)}
              </tr></thead>
              <tbody>
                <tr className="bg-white">
                  <td className="px-3 py-1 font-semibold text-[#004567]">Computed Units</td>
                  {effectiveForecast.map((f, i) => <td key={i} className="px-3 py-1 text-center font-mono">{fmtU(f.annualUnits)}</td>)}
                </tr>
                <tr className="bg-[#EAECEC]/40">
                  <td className="px-3 py-1 font-semibold text-[#004567]">RP Market Share %</td>
                  {effectiveForecast.map((f, i) => {
                    const rpM = rp.totalMarketUnits[i] ?? 1;
                    return <td key={i} className="px-3 py-1 text-center font-mono">{rpM > 0 ? ((f.annualUnits / rpM) * 100).toFixed(1) : '0'}%</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual mode controls */}
      {!isAdoption && (<>
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => setShowQuickFill(!showQuickFill)}
          className="text-xs px-3 py-1.5 bg-[#C98B27] text-white rounded-md font-semibold hover:bg-[#b07a20] transition-colors"
        >
          Quick Fill →
        </button>
        {showQuickFill && (
          <div className="flex items-center gap-3 bg-[#FFF9EE] border border-[#C98B27] rounded-lg px-4 py-2">
            <label className="text-xs text-[#004567]">
              WAC escalation:
              <input
                type="number"
                value={wacEsc}
                onChange={e => setWacEsc(Number(e.target.value))}
                className="ml-1 w-14 px-1 py-0.5 border border-[#EAECEC] rounded text-center text-xs font-mono"
                step={0.5}
              />%
            </label>
            <label className="text-xs text-[#004567]">
              Unit escalation:
              <input
                type="number"
                value={unitEsc}
                onChange={e => setUnitEsc(Number(e.target.value))}
                className="ml-1 w-14 px-1 py-0.5 border border-[#EAECEC] rounded text-center text-xs font-mono"
                step={1}
              />%
            </label>
            <button
              onClick={handleQuickFill}
              className="text-xs px-3 py-1 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]"
            >
              Apply
            </button>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-[#44546A] cursor-pointer ml-auto">
          <input type="checkbox" checked={autoAMP} onChange={e => setAutoAMP(e.target.checked)} className="accent-[#004567]" />
          Auto-calculate AMP (85% of WAC)
        </label>
      </div>

      <EditableGrid
        columns={columns}
        rows={rows}
        data={gridData}
        onChange={handleChange}
        decimalPlaces={0}
        formatValue={(v) => {
          // Will be called for both rows; we differentiate by magnitude
          return v >= 100 ? fmtU(v) : fmtD(v);
        }}
      />

      {/* Monthly Profile row as dropdowns */}
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="bg-white">
              <td className="bg-[#F7F9FC] font-semibold text-[#004567] text-xs px-4 py-2 border-r border-[#EAECEC] whitespace-nowrap min-w-[180px]">
                Monthly Profile
              </td>
              {forecast.map((f, i) => (
                <td key={f.year} className="px-1 py-1 text-center border-r border-[#EAECEC] last:border-r-0 min-w-[90px]">
                  <select
                    value={f.monthlyProfile}
                    onChange={e => handleProfileChange(i, e.target.value)}
                    className="w-full px-1 py-1 text-xs font-mono text-[#44546A] bg-white border border-[#EAECEC] rounded focus:ring-2 focus:ring-[#C98B27] outline-none"
                  >
                    {profileOptions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      </>)}

      {/* Compact chart */}
      <div className="bg-white rounded-lg border border-[#EAECEC] p-3">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#44546A' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#44546A' }} label={{ value: 'Units (K)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9296B2' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#44546A' }} label={{ value: 'Gross $M', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#9296B2' } }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="units" name="Units (K)" fill="#5B9BD5" opacity={0.7} />
            <Line yAxisId="right" dataKey="gross" name="Gross $M" stroke="#C98B27" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Section 2: Channel Allocation ─────────────────────────────────────────

function ChannelAllocationSection() {
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);
  const setActiveChannels = useStore(s => s.setActiveChannels);
  const updateChannelAllocation = useStore(s => s.updateChannelAllocation);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const columns = forecast.map(f => ({ key: String(f.year), label: String(f.year) }));
  const rows = activeChannels.map(ch => ({ key: ch, label: ch }));

  const gridData = useMemo(() => {
    const d: Record<string, Record<string, number>> = {};
    for (const ch of activeChannels) {
      d[ch] = {};
      for (const ca of channelAllocations) {
        d[ch][String(ca.year)] = ca.allocations[ch] ?? 0;
      }
    }
    return d;
  }, [activeChannels, channelAllocations]);

  const handleChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = channelAllocations.findIndex(ca => String(ca.year) === colKey);
    if (idx >= 0) updateChannelAllocation(idx, rowKey, value);
  }, [channelAllocations, updateChannelAllocation]);

  const toggleChannel = (ch: string) => {
    if (activeChannels.includes(ch)) {
      if (activeChannels.length > 1) {
        setActiveChannels(activeChannels.filter(c => c !== ch));
      }
    } else {
      setActiveChannels([...activeChannels, ch]);
    }
  };

  // Stacked area chart data
  const areaData = forecast.map((f, fi) => {
    const entry: Record<string, number | string> = { year: f.year };
    for (const ch of activeChannels) {
      entry[ch] = channelAllocations[fi]?.allocations[ch] ?? 0;
    }
    return entry;
  });

  return (
    <div className="space-y-4">
      <EditableGrid
        columns={columns}
        rows={rows}
        data={gridData}
        onChange={handleChange}
        validation={{ type: 'sum-to-100' }}
        suffix="%"
        step={0.5}
        decimalPlaces={1}
      />

      {/* Compact stacked area chart */}
      <div className="bg-white rounded-lg border border-[#EAECEC] p-3">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={areaData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#44546A' }} />
            <YAxis tick={{ fontSize: 10, fill: '#44546A' }} domain={[0, 100]} label={{ value: 'Share %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9296B2' } }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            {activeChannels.map((ch, i) => (
              <Area
                key={ch}
                type="monotone"
                dataKey={ch}
                stackId="1"
                fill={COLORS_MAIN[i % COLORS_MAIN.length]}
                stroke={COLORS_MAIN[i % COLORS_MAIN.length]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Advanced: toggle channels */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-[#9296B2] hover:text-[#004567] flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Advanced: Toggle Channels
      </button>
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 p-3 bg-[#EAECEC]/30 rounded-lg">
          {CHANNELS.map(ch => (
            <label key={ch} className="flex items-center gap-2 text-xs text-[#004567] cursor-pointer">
              <input
                type="checkbox"
                checked={activeChannels.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="accent-[#004567] w-3.5 h-3.5"
              />
              {ch}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Contract Terms ─────────────────────────────────────────────

function ContractTermsSection() {
  const forecast = useStore(s => s.forecast);
  const discounts = useStore(s => s.discounts);
  const rebates = useStore(s => s.rebates);
  const otherRates = useStore(s => s.otherRates);
  const channelAllocations = useStore(s => s.channelAllocations);
  const updateDiscount = useStore(s => s.updateDiscount);
  const updateRebate = useStore(s => s.updateRebate);
  const updateOtherRate = useStore(s => s.updateOtherRate);
  const [subTab, setSubTab] = useState<'discounts' | 'rebates' | 'fees'>('discounts');

  const columns = forecast.map(f => ({ key: String(f.year), label: String(f.year) }));

  // ── Discounts grid
  const discountRows = [
    { key: 'gpo', label: 'GPO Disc %', title: 'Group Purchasing Organization contract discount off WAC' },
    { key: 'idn', label: 'IDN Disc %', title: 'Integrated Delivery Network contract discount off WAC' },
    { key: 'b340', label: '340B Disc %', title: 'Ceiling price for 340B covered entities per HRSA guidelines' },
    { key: 'va', label: 'VA FSS Disc %', title: 'Federal Supply Schedule discount for VA/DoD/Federal' },
  ];
  const discountData = useMemo(() => {
    const d: Record<string, Record<string, number>> = {};
    for (const r of discountRows) d[r.key] = {};
    for (const disc of discounts) {
      d.gpo[String(disc.year)] = disc.gpo;
      d.idn[String(disc.year)] = disc.idn;
      d.b340[String(disc.year)] = disc.b340;
      d.va[String(disc.year)] = disc.va;
    }
    return d;
  }, [discounts]);

  // ── Rebates grid
  const rebateRows = [
    { key: 'comPbm', label: 'Com PBM %', title: 'Post-sale rebate paid to Pharmacy Benefit Managers — typically the largest GTN component' },
    { key: 'comMed', label: 'Com Med %', title: 'Rebate on commercial medical benefit claims' },
    { key: 'mcrD', label: 'Mcr Part D %', title: 'Medicare Part D coverage gap and formulary rebates' },
    { key: 'mcaid', label: 'Medicaid FFS %', title: 'Statutory Medicaid rebate per Omnibus Budget Reconciliation Act' },
    { key: 'manMcaid', label: 'Managed Mcaid %', title: 'Supplemental rebate for Managed Care Organization Medicaid plans' },
  ];
  const rebateData = useMemo(() => {
    const d: Record<string, Record<string, number>> = {};
    for (const r of rebateRows) d[r.key] = {};
    for (const reb of rebates) {
      d.comPbm[String(reb.year)] = reb.comPbm;
      d.comMed[String(reb.year)] = reb.comMed;
      d.mcrD[String(reb.year)] = reb.mcrD;
      d.mcaid[String(reb.year)] = reb.mcaid;
      d.manMcaid[String(reb.year)] = reb.manMcaid;
    }
    return d;
  }, [rebates]);

  // ── Fees grid
  const feeRows = [
    { key: 'adminFee', label: 'Admin Fee %', title: 'GPO/wholesaler administrative service fees' },
    { key: 'distFee', label: 'Dist Fee %', title: 'Wholesaler/distributor service fees' },
    { key: 'copay', label: 'Copay Support %', title: 'Manufacturer copay assistance program costs' },
    { key: 'returns', label: 'Returns %', title: 'Product returns and credits as % of gross' },
    { key: 'specialtyPharmFee', label: 'Specialty Pharm %', title: 'Specialty pharmacy handling, data management, and patient services fees' },
    { key: 'papCost', label: 'PAP / Copay Assist %', title: 'Patient Assistance Program costs — copay cards, free goods, financial assistance' },
  ];
  const feeData = useMemo(() => {
    const d: Record<string, Record<string, number>> = {};
    for (const r of feeRows) d[r.key] = {};
    for (const o of otherRates) {
      d.adminFee[String(o.year)] = o.adminFee;
      d.distFee[String(o.year)] = o.distFee;
      d.copay[String(o.year)] = o.copay;
      d.returns[String(o.year)] = o.returns;
      d.specialtyPharmFee[String(o.year)] = o.specialtyPharmFee ?? 0;
      d.papCost[String(o.year)] = o.papCost ?? 0;
    }
    return d;
  }, [otherRates]);

  type DiscField = 'gpo' | 'idn' | 'b340' | 'va';
  type RebField = 'comPbm' | 'comMed' | 'mcrD' | 'mcaid' | 'manMcaid';
  type FeeField = 'adminFee' | 'distFee' | 'copay' | 'returns' | 'specialtyPharmFee' | 'papCost';

  const handleDiscChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = discounts.findIndex(d => String(d.year) === colKey);
    if (idx >= 0) updateDiscount(idx, rowKey as DiscField, value);
  }, [discounts, updateDiscount]);

  const handleRebChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = rebates.findIndex(r => String(r.year) === colKey);
    if (idx >= 0) updateRebate(idx, rowKey as RebField, value);
  }, [rebates, updateRebate]);

  const handleFeeChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = otherRates.findIndex(o => String(o.year) === colKey);
    if (idx >= 0) updateOtherRate(idx, rowKey as FeeField, value);
  }, [otherRates, updateOtherRate]);

  // ── Blended GTN preview
  const blendedData = useMemo(() => {
    return forecast.map((f, fi) => {
      const alloc = channelAllocations[fi]?.allocations ?? {};
      const reb = rebates[fi];
      const disc = discounts[fi];
      const oth = otherRates[fi];
      if (!reb || !disc || !oth) return { year: f.year, rebates: 0, chargebacks: 0, other: 0, total: 0 };

      const r = ((alloc['Commercial PBM'] ?? 0) * reb.comPbm
        + (alloc['Commercial Medical'] ?? 0) * reb.comMed
        + (alloc['Medicare Part D'] ?? 0) * reb.mcrD
        + (alloc['Medicaid FFS'] ?? 0) * reb.mcaid
        + (alloc['Managed Medicaid'] ?? 0) * reb.manMcaid) / 100;

      const c = ((alloc['GPO/IDN Non-340B'] ?? 0) * disc.idn
        + (alloc['GPO/IDN 340B'] ?? 0) * disc.b340
        + (alloc['VA/DoD/Federal'] ?? 0) * disc.va) / 100;

      const o = oth.adminFee + oth.distFee + oth.copay + oth.returns + (oth.specialtyPharmFee ?? 0) + (oth.papCost ?? 0);
      return { year: f.year, rebates: r, chargebacks: c, other: o, total: r + c + o };
    });
  }, [forecast, channelAllocations, rebates, discounts, otherRates]);

  const subTabs = [
    { key: 'discounts' as const, label: 'Discounts' },
    { key: 'rebates' as const, label: 'Rebates' },
    { key: 'fees' as const, label: 'Fees' },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-0.5 w-fit">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all
              ${subTab === t.key ? 'bg-[#004567] text-white shadow' : 'text-[#44546A] hover:bg-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid for selected sub-tab */}
      {subTab === 'discounts' && (
        <EditableGrid
          columns={columns}
          rows={discountRows}
          data={discountData}
          onChange={handleDiscChange}
          validation={{ type: 'range', min: 0, max: 99 }}
          suffix="%"
          step={0.5}
          decimalPlaces={1}
        />
      )}
      {subTab === 'rebates' && (
        <EditableGrid
          columns={columns}
          rows={rebateRows}
          data={rebateData}
          onChange={handleRebChange}
          validation={{ type: 'range', min: 0, max: 100 }}
          suffix="%"
          step={0.5}
          decimalPlaces={1}
        />
      )}
      {subTab === 'fees' && (
        <EditableGrid
          columns={columns}
          rows={feeRows}
          data={feeData}
          onChange={handleFeeChange}
          validation={{ type: 'range', min: 0, max: 20 }}
          suffix="%"
          step={0.1}
          decimalPlaces={1}
        />
      )}

      {/* Blended GTN preview */}
      <div className="bg-white rounded-lg border border-[#EAECEC] p-3">
        <div className="text-xs font-bold text-[#004567] mb-2">Blended GTN % Preview</div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={blendedData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#44546A' }} />
            <YAxis tick={{ fontSize: 10, fill: '#44546A' }} label={{ value: 'GTN %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9296B2' } }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="rebates" name="Rebates" stackId="gtn" fill="#f87171" opacity={0.8} />
            <Bar dataKey="chargebacks" name="Chargebacks" stackId="gtn" fill="#C6B78A" opacity={0.8} />
            <Bar dataKey="other" name="Fees/Other" stackId="gtn" fill="#C98B27" opacity={0.8} />
            <Line dataKey="total" name="Total GTN %" stroke="#004567" strokeWidth={2.5} dot={{ r: 4, fill: '#004567' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Section 0: Reference Product ──────────────────────────────────────────

function ReferenceProductSection() {
  const forecast = useStore(s => s.forecast);
  const rp = useStore(s => s.referenceProduct);
  const setRP = useStore(s => s.setReferenceProduct);

  const columns = forecast.map(f => ({ key: String(f.year), label: String(f.year) }));
  const rows = [
    { key: 'rpWac', label: 'RP WAC $/Unit', title: 'Reference product WAC — the branded originator price' },
    { key: 'marketUnits', label: 'Total Market Units', title: 'Total market size (reference + all biosimilars combined)' },
  ];

  const gridData = useMemo(() => {
    const d: Record<string, Record<string, number>> = { rpWac: {}, marketUnits: {} };
    for (let i = 0; i < forecast.length; i++) {
      const yr = String(forecast[i].year);
      d.rpWac[yr] = rp.wacPerUnit[i] ?? 3000;
      d.marketUnits[yr] = rp.totalMarketUnits[i] ?? 200000;
    }
    return d;
  }, [forecast, rp]);

  const handleChange = useCallback((rowKey: string, colKey: string, value: number) => {
    const idx = forecast.findIndex(f => String(f.year) === colKey);
    if (idx < 0) return;
    if (rowKey === 'rpWac') {
      const wacs = [...rp.wacPerUnit]; wacs[idx] = value;
      setRP({ wacPerUnit: wacs });
    } else if (rowKey === 'marketUnits') {
      const units = [...rp.totalMarketUnits]; units[idx] = Math.round(value);
      setRP({ totalMarketUnits: units });
    }
  }, [forecast, rp, setRP]);

  // Computed discount to RP
  const discounts = forecast.map((f, i) => {
    const rpW = rp.wacPerUnit[i] ?? 1;
    return rpW > 0 ? ((1 - f.wacPerUnit / rpW) * 100) : 0;
  });

  const chartData = forecast.map((f, i) => ({
    year: f.year,
    'Biosimilar WAC': f.wacPerUnit,
    'RP WAC': rp.wacPerUnit[i] ?? 0,
    'Discount %': Math.round(discounts[i] * 10) / 10,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs font-semibold text-[#44546A] block mb-1">Reference Product Name</label>
          <input type="text" value={rp.name} onChange={e => setRP({ name: e.target.value })}
            className="w-full px-2 py-1.5 border border-[#EAECEC] rounded text-sm text-[#004567] font-semibold focus:ring-1 focus:ring-[#C98B27] outline-none" />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-[#004567] cursor-pointer">
            <input type="checkbox" checked={rp.isInterchangeable} onChange={e => setRP({ isInterchangeable: e.target.checked })}
              className="accent-[#004567] w-4 h-4" />
            <span className="font-semibold">Interchangeable Designation</span>
            <span className="text-[9px] text-[#9296B2]" title="Interchangeable = automatic pharmacy substitution allowed. Dramatically increases PBM uptake.">ⓘ</span>
          </label>
          {rp.isInterchangeable && (
            <div className="mt-2 text-xs bg-green-50 border border-green-200 rounded-lg p-2 text-green-700">
              <strong>Interchangeable active:</strong> Pharmacy-level substitution allowed without prescriber intervention.
              This increases PBM channel uptake, boosts adoption switch rate by {useStore.getState().adoptionConfig.interchangeableUplift}x,
              and improves formulary positioning.
            </div>
          )}
          {!rp.isInterchangeable && (
            <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-700">
              <strong>Not interchangeable:</strong> Requires prescriber authorization for substitution.
              Lower PBM auto-substitution, slower adoption curve.
            </div>
          )}
        </div>
      </div>

      <EditableGrid columns={columns} rows={rows} data={gridData} onChange={handleChange} decimalPlaces={0}
        formatValue={(v) => v >= 10000 ? fmtU(v) : fmtD(v)} />

      {/* Computed discount row */}
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="bg-[#FFF9EE]">
              <td className="bg-[#FFF9EE] font-semibold text-[#C98B27] text-xs px-4 py-2 border-r border-[#EAECEC] whitespace-nowrap min-w-[180px]">
                Discount to RP %
              </td>
              {discounts.map((d, i) => (
                <td key={i} className="px-1 py-2 text-center font-mono text-xs font-bold text-[#004567] border-r border-[#EAECEC] last:border-r-0 min-w-[90px]">
                  {d.toFixed(1)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* RP vs Biosimilar WAC chart */}
      <div className="bg-white rounded-lg border border-[#EAECEC] p-3">
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#44546A' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#44546A' }} label={{ value: '$/Unit', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9296B2' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#44546A' }} label={{ value: 'Discount %', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#9296B2' } }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" dataKey="RP WAC" stroke="#f87171" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
            <Line yAxisId="left" dataKey="Biosimilar WAC" stroke="#5B9BD5" strokeWidth={2} dot={{ r: 3 }} />
            <Bar yAxisId="right" dataKey="Discount %" fill="#C98B27" opacity={0.4} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Section 4: IRA Config ─────────────────────────────────────────────────

function IRAConfigSection() {
  const iraConfig = useStore(s => s.iraConfig);
  const setIRAConfig = useStore(s => s.setIRAConfig);

  return (
    <div className="space-y-4">
      <div className="bg-[#FFF9EE] border-l-4 border-[#C98B27] rounded-lg px-4 py-3 text-sm text-[#004567] leading-relaxed">
        <strong>Inflation Reduction Act:</strong> If your drug's ASP exceeds the inflation-adjusted baseline,
        you owe CMS the excess on every Medicare Part B unit. This primarily affects Buy &amp; Bill products.
      </div>

      <label className="flex items-center gap-2 text-sm text-[#004567] font-semibold cursor-pointer">
        <input type="checkbox" checked={iraConfig.enabled} onChange={e => setIRAConfig({ enabled: e.target.checked })}
          className="accent-[#004567] w-4 h-4" />
        Enable IRA Inflation Rebate Modeling
      </label>

      {iraConfig.enabled && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#44546A] block mb-1">Baseline ASP ($/unit)</label>
            <input type="number" value={iraConfig.baselineASP || ''} placeholder="Auto from Year 1"
              onChange={e => setIRAConfig({ baselineASP: Number(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 border border-[#EAECEC] rounded text-sm font-mono text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
            <p className="text-[9px] text-[#9296B2] mt-1">Leave blank to auto-populate from Year 1 computed ASP</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#44546A] block mb-1">Baseline Year</label>
            <input type="number" value={iraConfig.baselineYear}
              onChange={e => setIRAConfig({ baselineYear: Number(e.target.value) })}
              className="w-full px-2 py-1.5 border border-[#EAECEC] rounded text-sm font-mono text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#44546A] block mb-1">Annual CPI-U (%)</label>
            <input type="number" value={iraConfig.annualCPIU} step={0.1}
              onChange={e => setIRAConfig({ annualCPIU: Number(e.target.value) })}
              className="w-full px-2 py-1.5 border border-[#EAECEC] rounded text-sm font-mono text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Model Health Strip ────────────────────────────────────────────────────

function ModelHealthStrip() {
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);
  const rebates = useStore(s => s.rebates);

  const badges = useMemo(() => {
    const items: { color: 'green' | 'red' | 'amber'; text: string }[] = [];

    // Channel sum validation
    let allSumsOk = true;
    for (const ca of channelAllocations) {
      const sum = activeChannels.reduce((s, ch) => s + (ca.allocations[ch] ?? 0), 0);
      if (Math.abs(sum - 100) >= 0.6) {
        allSumsOk = false;
        items.push({ color: 'red', text: `Year ${ca.year} channels sum to ${sum.toFixed(1)}%` });
      }
    }
    if (allSumsOk) items.push({ color: 'green', text: 'All channel allocations sum to 100%' });

    // Volume check
    let allVolOk = true;
    for (const f of forecast) {
      if (f.annualUnits <= 0) {
        allVolOk = false;
        items.push({ color: 'red', text: `Year ${f.year} has zero volume` });
      }
    }
    if (allVolOk) items.push({ color: 'green', text: 'All years have volume > 0' });

    // High rebate check
    for (const reb of rebates) {
      if (reb.comPbm > 80) items.push({ color: 'amber', text: `Com PBM rebate ${reb.comPbm}% in ${reb.year} — verify` });
      if (reb.manMcaid > 80) items.push({ color: 'amber', text: `Managed Mcaid rebate ${reb.manMcaid}% in ${reb.year} — verify` });
      if (reb.mcrD > 80) items.push({ color: 'amber', text: `Mcr Part D rebate ${reb.mcrD}% in ${reb.year} — verify` });
    }

    return items;
  }, [forecast, channelAllocations, activeChannels, rebates]);

  const badgeStyles = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className="flex flex-wrap gap-2 p-4 bg-white rounded-xl border border-[#EAECEC]">
      <span className="text-xs font-bold text-[#004567] self-center mr-2">Model Health</span>
      {badges.map((b, i) => (
        <span key={i} className={`text-xs px-3 py-1 rounded-full border font-medium ${badgeStyles[b.color]}`}>
          {b.color === 'green' ? '✓' : b.color === 'red' ? '✕' : '⚠'} {b.text}
        </span>
      ))}
    </div>
  );
}

// ─── Upload Preview Modal ──────────────────────────────────────────────────

function UploadPreviewModal({
  parsed, errors, onApply, onCancel,
}: {
  parsed: ParsedData; errors: string[];
  onApply: () => void; onCancel: () => void;
}) {
  const previewRows = (data: Record<string, unknown>[], max = 5) =>
    data.slice(0, max).map(row => Object.values(row).map(v => String(v ?? '')));

  const hasErrors = errors.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold text-[#004567] mb-4">Upload Preview</h3>

        {/* Validation status */}
        <div className={`rounded-lg p-3 mb-4 text-sm ${hasErrors ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {hasErrors ? (
            <div>
              <div className="font-bold text-red-700 mb-1">Validation Issues ({errors.length})</div>
              <ul className="list-disc pl-5 text-red-600 text-xs space-y-0.5">
                {errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {errors.length > 10 && <li>...and {errors.length - 10} more</li>}
              </ul>
            </div>
          ) : (
            <div className="text-green-700 font-semibold">✓ All validations passed</div>
          )}
        </div>

        {/* Sheet previews */}
        {[
          { label: 'Volumes', data: parsed.forecast, fields: ['year', 'annualUnits', 'wacPerUnit', 'monthlyProfile'] },
          { label: 'Discounts', data: parsed.discounts, fields: ['year', 'gpo', 'idn', 'b340', 'va'] },
          { label: 'Rebates', data: parsed.rebates, fields: ['year', 'comPbm', 'comMed', 'mcrD', 'mcaid', 'manMcaid'] },
        ].map(sheet => (
          <div key={sheet.label} className="mb-3">
            <div className="text-xs font-bold text-[#004567] mb-1">{sheet.label} ({sheet.data.length} rows)</div>
            {sheet.data.length > 0 && (
              <div className="overflow-auto rounded border border-[#EAECEC]">
                <table className="text-[10px] w-full">
                  <thead><tr className="bg-[#004567] text-white">{sheet.fields.map(f => <th key={f} className="px-2 py-1">{f}</th>)}</tr></thead>
                  <tbody>
                    {previewRows(sheet.data as unknown as Record<string, unknown>[]).map((row, ri) => (
                      <tr key={ri} className={ri % 2 ? 'bg-[#EAECEC]/40' : ''}>
                        {row.map((cell, ci) => <td key={ci} className="px-2 py-0.5 font-mono">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-[#EAECEC] rounded-lg text-sm font-semibold text-[#44546A] hover:bg-[#EAECEC]">
            Cancel
          </button>
          <button onClick={onApply}
            className="px-4 py-2 bg-[#004567] text-white rounded-lg text-sm font-semibold hover:bg-[#004466] disabled:opacity-50"
            disabled={hasErrors && parsed.forecast.length === 0}>
            Apply to Model
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Assumptions Page ─────────────────────────────────────────────────

export function AssumptionsPage() {
  const store = useStore();
  const { forecast, channelAllocations, discounts, rebates, otherRates, activeChannels,
    scenarios, activeScenarioId, duplicateScenario, loadScenario, setActiveTab } = store;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResult, setUploadResult] = useState<{ parsed: ParsedData; errors: string[] } | null>(null);

  const activeScenario = activeScenarioId ? scenarios[activeScenarioId] : null;
  const isLocked = activeScenario?.locked ?? false;

  // Guardrail warnings
  const warnings = useMemo(() => {
    const w: { type: 'red' | 'amber'; text: string }[] = [];
    for (const f of forecast) {
      if (f.annualUnits <= 0) w.push({ type: 'red', text: `Year ${f.year}: Zero volume will cause division errors in ASP calculation` });
    }
    for (let i = 1; i < forecast.length; i++) {
      const drop = (forecast[i - 1].wacPerUnit - forecast[i].wacPerUnit) / forecast[i - 1].wacPerUnit;
      if (drop > 0.1) w.push({ type: 'amber', text: `Year ${forecast[i].year}: WAC decreases ${(drop * 100).toFixed(1)}% YoY — intentional?` });
    }
    for (const reb of rebates) {
      if (reb.comPbm > 80) w.push({ type: 'amber', text: `Year ${reb.year}: Com PBM rebate ${reb.comPbm}% is unusually high — verify` });
      if (reb.manMcaid > 80) w.push({ type: 'amber', text: `Year ${reb.year}: Managed Mcaid rebate ${reb.manMcaid}% is unusually high — verify` });
    }
    return w;
  }, [forecast, rebates]);

  const volumeSummary = useMemo(() => {
    if (forecast.length === 0) return '';
    const first = forecast[0];
    const last = forecast[forecast.length - 1];
    return `${forecast.length} years, ${fmtU(first.annualUnits)}–${fmtU(last.annualUnits)} units, ${fmtD(first.wacPerUnit)}–${fmtD(last.wacPerUnit)} WAC`;
  }, [forecast]);

  const channelSummary = `${activeChannels.length} channels active`;
  const contractSummary = 'Discounts, rebates & fees by year';

  const handleDownloadTemplate = () => {
    const data = generateTemplate(forecast, channelAllocations, discounts, rebates, otherRates, activeChannels, store.referenceProduct);
    triggerDownload(data, 'AccessLens_Template.xlsx');
  };

  const handleExportCurrent = () => {
    const data = exportAssumptions(forecast, channelAllocations, discounts, rebates, otherRates, activeChannels, store.referenceProduct);
    triggerDownload(data, `AccessLens_Assumptions_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await parseUpload(file);
    setUploadResult(result);
    // Reset input so the same file can be re-uploaded
    e.target.value = '';
  };

  const handleApplyUpload = () => {
    if (!uploadResult) return;
    const { data } = uploadResult;
    if (data.forecast.length > 0) store.setForecast(data.forecast);
    if (data.channelAllocations.length > 0) store.setChannelAllocations(data.channelAllocations);
    if (data.discounts.length > 0) store.setDiscounts(data.discounts);
    if (data.rebates.length > 0) store.setRebates(data.rebates);
    if (data.otherRates.length > 0) store.setOtherRates(data.otherRates);
    if (data.forecast.length > 0) {
      store.setNYears(data.forecast.length);
      store.setStartYear(data.forecast[0].year);
    }
    setUploadResult(null);
  };

  return (
    <div className="space-y-4">
      {/* Locked scenario banner */}
      {isLocked && activeScenario && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <span className="text-amber-600 font-bold text-sm">🔒 Scenario "{activeScenario.name} v{activeScenario.version}" is locked.</span>
          <button onClick={() => {
            const newId = duplicateScenario(activeScenario.id, `${activeScenario.name} (edit)`);
            if (newId) loadScenario(newId);
          }}
            className="text-xs px-3 py-1 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]">
            Duplicate & Edit
          </button>
        </div>
      )}

      {/* Guardrail warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 ${w.type === 'red' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              <span>{w.type === 'red' ? '✕' : '⚠'}</span> {w.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#004567]">Model Assumptions</h2>

        {/* Excel Toolbar */}
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-[#C98B27] text-white rounded-md text-xs font-semibold hover:bg-[#b07a20] flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload from Excel
          </button>
          <button onClick={handleDownloadTemplate}
            className="px-3 py-1.5 border border-[#EAECEC] rounded-md text-xs font-semibold text-[#004567] hover:bg-[#EAECEC] flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Template
          </button>
          <button onClick={handleExportCurrent}
            className="px-3 py-1.5 border border-[#EAECEC] rounded-md text-xs font-semibold text-[#004567] hover:bg-[#EAECEC] flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export Current
          </button>
        </div>
      </div>

      {/* Upload Preview Modal */}
      {uploadResult && (
        <UploadPreviewModal
          parsed={uploadResult.parsed}
          errors={uploadResult.errors}
          onApply={handleApplyUpload}
          onCancel={() => setUploadResult(null)}
        />
      )}

      <Accordion title="Reference Product & Competitive Positioning" summary={`${store.referenceProduct.name}${store.referenceProduct.isInterchangeable ? ' (Interchangeable)' : ''}`}>
        <ReferenceProductSection />
      </Accordion>

      <Accordion title="Volume & WAC Forecast" summary={volumeSummary} defaultOpen={true}>
        <VolumeForecastSection />
      </Accordion>

      <Accordion title="Channel Allocation" summary={channelSummary}>
        <ChannelAllocationSection />
      </Accordion>

      <Accordion title="Contract Terms" summary={contractSummary}>
        <ContractTermsSection />
      </Accordion>

      <Accordion title="Formulary Positioning" summary={store.formularyTierOverride === 'auto' ? 'Auto (from PBM rebate depth)' : store.formularyTierOverride}>
        <div className="space-y-3">
          <div className="bg-[#FFF9EE] border-l-4 border-[#C98B27] rounded-lg px-4 py-3 text-sm text-[#004567]">
            Set the expected formulary tier for your biosimilar. "Auto" derives it from PBM rebate depth.
            Override to model specific payer decisions.
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs font-semibold text-[#44546A]">Formulary Tier:</label>
            <select value={store.formularyTierOverride} onChange={e => store.setFormularyTierOverride(e.target.value as 'auto' | 'preferred' | 'non-preferred' | 'non-formulary')}
              className="px-3 py-1.5 border border-[#EAECEC] rounded text-sm font-semibold text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none">
              <option value="auto">Auto (based on PBM rebate depth)</option>
              <option value="preferred">Preferred (Tier 1/2)</option>
              <option value="non-preferred">Non-Preferred (Tier 3)</option>
              <option value="non-formulary">Non-Formulary</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {(['preferred', 'non-preferred', 'non-formulary'] as const).map(tier => {
              const active = store.formularyTierOverride === tier || (store.formularyTierOverride === 'auto' && (
                (tier === 'preferred' && (store.rebates[0]?.comPbm ?? 0) > 25) ||
                (tier === 'non-preferred' && (store.rebates[0]?.comPbm ?? 0) >= 15 && (store.rebates[0]?.comPbm ?? 0) <= 25) ||
                (tier === 'non-formulary' && (store.rebates[0]?.comPbm ?? 0) < 15)
              ));
              const colors = { preferred: 'border-green-300 bg-green-50 text-green-700', 'non-preferred': 'border-amber-300 bg-amber-50 text-amber-700', 'non-formulary': 'border-red-300 bg-red-50 text-red-700' };
              const descs = { preferred: 'Automatic substitution, highest volume share', 'non-preferred': 'Requires prior auth or step therapy', 'non-formulary': 'Not covered, minimal volume' };
              return (
                <div key={tier} className={`rounded-lg p-3 border-2 text-center ${active ? colors[tier] : 'border-[#EAECEC] text-[#9296B2]'}`}>
                  <div className="text-xs font-bold capitalize">{tier.replace('-', ' ')}</div>
                  <div className="text-[9px] mt-1">{descs[tier]}</div>
                  {active && <div className="text-[10px] font-bold mt-1">← Current</div>}
                </div>
              );
            })}
          </div>
        </div>
      </Accordion>

      <Accordion title="IRA / Inflation Rebate Settings" summary={store.iraConfig.enabled ? `CPI-U ${store.iraConfig.annualCPIU}% — active` : 'Disabled'}>
        <IRAConfigSection />
      </Accordion>

      <ModelHealthStrip />
    </div>
  );
}
