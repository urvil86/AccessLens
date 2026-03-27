import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useComputedData } from '../../engine/hooks';
import { fmtSales, fmtM, fmtPct, fmtU, fmtD } from '../../engine/compute';
import { MetricCard } from '../../shared/MetricCard';
import { SectionHeader } from '../../shared/SectionHeader';
import { DataTable } from '../../shared/DataTable';
import { InfoBox } from '../../shared/InfoBox';
import { Accordion } from '../../shared/Accordion';
import { NumberInput } from '../../shared/NumberInput';
import { COLORS_MAIN, CHANNELS, ASP_ELIGIBLE, MONTHS } from '../../engine/constants';
import { exportResults, triggerDownload } from '../../engine/excelIO';
import {
  ComposedChart, BarChart, Bar, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

const IDN_LINE_COLORS = ['#e11d48', '#7c3aed', '#0891b2', '#ca8a04', '#16a34a', '#db2777', '#6366f1', '#14b8a6'];

// ═══════════════════════════════════════════════════════════════════════════
// TAB A — GTN Summary
// ═══════════════════════════════════════════════════════════════════════════

function GTNSummaryTab() {
  const { gtnData, annualData, aspData, forecastYears } = useComputedData();
  const productName = useStore(s => s.productName);
  const scenarios = useStore(s => s.scenarios);
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const [selectedYear, setSelectedYear] = useState<number>(forecastYears[0] ?? 2025);

  const totalGross = annualData.reduce((s, d) => s + d.grossSales, 0);
  const totalNet = annualData.reduce((s, d) => s + d.netSales, 0);
  const totalDed = annualData.reduce((s, d) => s + d.totalDeductions, 0);
  const avgGtn = annualData.length > 0 ? annualData.reduce((s, d) => s + d.gtnPct, 0) / annualData.length : 0;
  const peakNetYear = annualData.length > 0
    ? annualData.reduce((best, d) => (d.netSales > best.netSales ? d : best), annualData[0]).year
    : '—';

  // Proper waterfall: each bar shows its segment with an invisible base
  const totalGrossAll = annualData.reduce((s, d) => s + d.grossSales, 0);
  const totalReb = annualData.reduce((s, d) => s + d.totalRebates, 0);
  const totalCB = annualData.reduce((s, d) => s + d.totalChargebacks, 0);
  const totalFees = annualData.reduce((s, d) => s + d.totalOther, 0);
  const totalIRA = annualData.reduce((s, d) => s + (d.iraRebate ?? 0), 0);
  const totalNetAll = annualData.reduce((s, d) => s + (d.netSalesAfterIRA ?? d.netSales), 0);

  const g = totalGrossAll / 1e6;
  const r = totalReb / 1e6;
  const c = totalCB / 1e6;
  const f = totalFees / 1e6;
  const ira = totalIRA / 1e6;
  const n = totalNetAll / 1e6;
  const wfSteps = [
    { label: 'Gross Sales', base: 0, segment: g, fill: '#5B9BD5', displayLabel: `$${g.toFixed(1)}M` },
    { label: '(-) Rebates', base: g - r, segment: r, fill: '#f87171', displayLabel: `-$${r.toFixed(1)}M` },
    { label: '(-) Chargebacks', base: g - r - c, segment: c, fill: '#C6B78A', displayLabel: `-$${c.toFixed(1)}M` },
    { label: '(-) Fees/Other', base: g - r - c - f, segment: f, fill: '#C98B27', displayLabel: `-$${f.toFixed(1)}M` },
    ...(ira > 0.01 ? [{ label: '(-) IRA Rebate', base: g - r - c - f - ira, segment: ira, fill: '#9333ea', displayLabel: `-$${ira.toFixed(1)}M` }] : []),
    { label: 'Net Sales', base: 0, segment: n, fill: '#4ade80', displayLabel: `$${n.toFixed(1)}M` },
  ];

  const trendData = annualData.map(d => ({ year: d.year, gtnPct: d.gtnPct, netPrice: d.netPrice }));

  const mixData = annualData.map(d => {
    const total = d.totalDeductions || 1;
    return {
      year: d.year,
      rebatesPct: (d.totalRebates / total) * 100,
      chargebacksPct: (d.totalChargebacks / total) * 100,
      feesPct: (d.totalOther / total) * 100,
    };
  });

  const summaryHeaders = ['Metric', ...annualData.map(d => String(d.year))];
  const summaryRows: string[][] = [
    ['Units', ...annualData.map(d => fmtU(d.units))],
    ['Gross Sales ($M)', ...annualData.map(d => fmtM(d.grossSales))],
    ['Rebates ($M)', ...annualData.map(d => fmtM(d.totalRebates))],
    ['Chargebacks ($M)', ...annualData.map(d => fmtM(d.totalChargebacks))],
    ['Fees/Other ($M)', ...annualData.map(d => fmtM(d.totalOther))],
    ['Total Deductions', ...annualData.map(d => fmtM(d.totalDeductions))],
    ['Net Sales ($M)', ...annualData.map(d => fmtM(d.netSales))],
    ['IRA Rebate ($M)', ...annualData.map(d => fmtM(d.iraRebate))],
    ['Net After IRA ($M)', ...annualData.map(d => fmtM(d.netSalesAfterIRA))],
    ['GTN%', ...annualData.map(d => fmtPct(d.gtnPct))],
    ['Net $/Unit', ...annualData.map(d => fmtD(d.netPrice))],
    ['Net % of WAC', ...annualData.map(d => fmtPct(d.netPct))],
  ];

  const monthlyData = gtnData
    .filter(d => d.year === selectedYear)
    .map((d, i) => ({ month: MONTHS[i] ?? `M${i + 1}`, grossSales: d.grossSales, netSales: d.netSales, gtnPct: d.gtnPct }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Total Gross Sales" value={fmtSales(totalGross)} />
        <MetricCard label="Total Net Sales" value={fmtSales(totalNet)} />
        <MetricCard label="Total Deductions" value={fmtSales(totalDed)} />
        <MetricCard label="Avg GTN%" value={fmtPct(avgGtn)} />
        <MetricCard label="Peak Net Sales Year" value={String(peakNetYear)} />
      </div>

      {/* Waterfall */}
      <SectionHeader>Annual GTN Waterfall</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={wfSteps} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: number, name: string) => {
                if (name === 'base') return [null, null];
                return [`$${Number(v).toFixed(1)}M`, name === 'segment' ? 'Amount' : name];
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="base" stackId="wf" fillOpacity={0} stroke="none" />
            <Bar dataKey="segment" stackId="wf"
              label={{ position: 'insideTop', fontSize: 10, fill: '#fff', fontWeight: 700,
                formatter: (_: number, item: unknown) => {
                  const entry = item as { payload?: { displayLabel?: string } };
                  return entry?.payload?.displayLabel ?? '';
                }
              }}>
              {wfSteps.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Side-by-side charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <SectionHeader>GTN % &amp; Net Price Trend</SectionHeader>
          <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="gtnPct" name="GTN %" fill="#5B9BD5" opacity={0.7} />
                <Line yAxisId="right" type="monotone" dataKey="netPrice" name="Net $/Unit" stroke="#4ade80" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionHeader>Deduction Mix by Year</SectionHeader>
          <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mixData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}%`, name]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="rebatesPct" name="Rebates %" stackId="mix" fill="#f87171" />
                <Bar dataKey="chargebacksPct" name="Chargebacks %" stackId="mix" fill="#C6B78A" />
                <Bar dataKey="feesPct" name="Fees/Other %" stackId="mix" fill="#C98B27" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary table */}
      <SectionHeader>Annual GTN Summary Table</SectionHeader>
      <DataTable headers={summaryHeaders} rows={summaryRows} />

      {/* Monthly detail */}
      <SectionHeader>Monthly GTN Detail</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-semibold text-[#44546A]">Select Year:</label>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-[#EAECEC] rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004567]">
            {forecastYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => fmtM(v)} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="grossSales" name="Gross Sales" fill="#5B9BD5" />
            <Bar yAxisId="left" dataKey="netSales" name="Net Sales" fill="#4ade80" />
            <Line yAxisId="right" type="monotone" dataKey="gtnPct" name="GTN %" stroke="#f87171" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <button onClick={() => {
          const scenarioName = activeScenarioId && scenarios[activeScenarioId] ? scenarios[activeScenarioId].name : 'Unsaved';
          const data = exportResults(annualData, aspData, gtnData, { productName, scenarioName });
          triggerDownload(data, `AccessLens_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }}
          className="px-4 py-2 bg-[#004567] text-white rounded-lg text-sm font-semibold hover:bg-[#004466] flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Results as Excel
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB B — ASP Analysis
// ═══════════════════════════════════════════════════════════════════════════

function ASPAnalysisTab() {
  const { aspData, forecastYears } = useComputedData();
  const [selectedYear, setSelectedYear] = useState<number>(forecastYears[0] ?? 2025);

  const aspChartData = useMemo(() =>
    aspData.map(r => ({ period: r.period, wac: r.wac, monthlyASP: r.monthlyASP, rollingASP6M: r.rollingASP6M, aspPlus6: r.aspPlus6 })),
    [aspData]);

  const annualASPSummary = useMemo(() => {
    const byYear = new Map<number, { wacs: number[]; asps: number[]; asp6s: number[] }>();
    for (const r of aspData) {
      if (!byYear.has(r.year)) byYear.set(r.year, { wacs: [], asps: [], asp6s: [] });
      const b = byYear.get(r.year)!;
      b.wacs.push(r.wac); b.asps.push(r.rollingASP6M); b.asp6s.push(r.aspPlus6);
    }
    const result: { year: number; avgWAC: number; avg6MASP: number; avgASP6: number; aspWacPct: number }[] = [];
    for (const [year, v] of byYear) {
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const aw = avg(v.wacs); const aa = avg(v.asps);
      result.push({ year, avgWAC: aw, avg6MASP: aa, avgASP6: avg(v.asp6s), aspWacPct: aw > 0 ? (aa / aw) * 100 : 0 });
    }
    return result.sort((a, b) => a.year - b.year);
  }, [aspData]);

  const annualBarData = annualASPSummary.map(r => ({ year: String(r.year), 'Avg WAC': r.avgWAC, 'Avg 6M ASP': r.avg6MASP, 'Avg ASP+6%': r.avgASP6 }));

  const aspTableHeaders = ['Metric', ...annualASPSummary.map(r => String(r.year))];
  const aspTableRows: string[][] = [
    ['Avg WAC', ...annualASPSummary.map(r => fmtD(r.avgWAC))],
    ['6M Avg ASP', ...annualASPSummary.map(r => fmtD(r.avg6MASP))],
    ['ASP+6%', ...annualASPSummary.map(r => fmtD(r.avgASP6))],
    ['ASP/WAC %', ...annualASPSummary.map(r => fmtPct(r.aspWacPct))],
  ];

  const monthlyDetail = useMemo(() => aspData.filter(r => r.year === selectedYear), [aspData, selectedYear]);
  const monthlyHeaders = ['Metric', ...monthlyDetail.map(r => r.month)];
  const monthlyRows: string[][] = [
    ['Monthly ASP', ...monthlyDetail.map(r => fmtD(r.monthlyASP))],
    ['6M Rolling ASP', ...monthlyDetail.map(r => fmtD(r.rollingASP6M))],
    ['ASP+6%', ...monthlyDetail.map(r => fmtD(r.aspPlus6))],
    ['WAC', ...monthlyDetail.map(r => fmtD(r.wac))],
    ['Eligible Units', ...monthlyDetail.map(r => fmtU(r.eligibleUnits))],
    ['Total Units', ...monthlyDetail.map(r => fmtU(r.totalUnits))],
    ['ASP/WAC %', ...monthlyDetail.map(r => fmtPct(r.wac > 0 ? (r.rollingASP6M / r.wac) * 100 : 0))],
  ];

  const eligibleHeaders = ['Channel', 'ASP Eligible', 'Reason'];
  const eligibleRows = CHANNELS.map(ch => [
    ch,
    ASP_ELIGIBLE[ch] ? '✓ Yes' : '✕ No',
    ASP_ELIGIBLE[ch] ? 'Included in ASP numerator/denominator' : 'Excluded (statutory/federal pricing)',
  ]);

  return (
    <div className="space-y-6">
      {/* Rolling ASP chart */}
      <SectionHeader>Rolling 6-Month ASP vs WAC</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={aspChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="period" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} interval={Math.max(0, Math.floor(aspChartData.length / 14))} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, name: string) => [fmtD(v), name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="wac" name="WAC" stroke="#C98B27" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            <Line dataKey="monthlyASP" name="Monthly ASP (raw)" stroke="#9296B2" strokeWidth={1} strokeDasharray="3 3" dot={false} />
            <Line dataKey="rollingASP6M" name="6M Rolling ASP" stroke="#4ade80" strokeWidth={2.5} dot={false} />
            <Line dataKey="aspPlus6" name="ASP+6% (Medicare)" stroke="#5B9BD5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Annual summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <SectionHeader>Annual ASP Summary</SectionHeader>
          <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={annualBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [fmtD(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Avg WAC" fill="#C98B27" opacity={0.7} />
                <Bar dataKey="Avg 6M ASP" fill="#4ade80" opacity={0.8} />
                <Bar dataKey="Avg ASP+6%" fill="#5B9BD5" opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionHeader>Annual Price Comparison</SectionHeader>
          <div className="mt-3">
            <DataTable headers={aspTableHeaders} rows={aspTableRows} />
          </div>
        </div>
      </div>

      {/* Monthly detail */}
      <SectionHeader>Monthly ASP Detail</SectionHeader>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm font-semibold text-[#44546A]">Year:</label>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-[#EAECEC] rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004567]">
          {forecastYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <DataTable headers={monthlyHeaders} rows={monthlyRows} />

      {/* Methodology */}
      <Accordion title="ASP Calculation Methodology" summary="CMS 42 CFR § 414.804 — non-exempt channel weighted average">
        <div className="space-y-4">
          <InfoBox>
            <strong>ASP = Σ(Net Sales Price × Units) / Σ(Units)</strong> across all non-exempt purchasers,
            computed quarterly over a 6-month rolling window. Medicare reimburses at ASP + 6%
            (effectively ASP + 3.8% post-sequestration). ASP is reported with ~2 quarter lag.
          </InfoBox>
          <DataTable headers={eligibleHeaders} rows={eligibleRows} />
        </div>
      </Accordion>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB C — Buy & Bill / IDN Analysis
// ═══════════════════════════════════════════════════════════════════════════

function BuyBillAnalysisTab() {
  const idnList = useStore(s => s.idnList);
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const addIDN = useStore(s => s.addIDN);
  const removeIDN = useStore(s => s.removeIDN);
  const updateIDN = useStore(s => s.updateIDN);
  const { aspData, forecastYears } = useComputedData();

  // Annual ASP averages
  const annualASP = useMemo(() => {
    const byYear = new Map<number, { wac: number; asp: number; aspPlus6: number; count: number }>();
    for (const row of aspData) {
      const e = byYear.get(row.year) ?? { wac: 0, asp: 0, aspPlus6: 0, count: 0 };
      e.wac += row.wac; e.asp += row.rollingASP6M; e.aspPlus6 += row.aspPlus6; e.count += 1;
      byYear.set(row.year, e);
    }
    return Array.from(byYear.entries()).map(([year, v]) => ({
      year, wac: v.wac / v.count, asp: v.asp / v.count, aspPlus6: v.aspPlus6 / v.count,
    })).sort((a, b) => a.year - b.year);
  }, [aspData]);

  const yr1 = annualASP[0];
  const yr1WAC = yr1?.wac ?? 0;
  const yr1ASP = yr1?.asp ?? 0;
  const yr1ASP6 = yr1?.aspPlus6 ?? 0;

  // Per-IDN per-year data
  const idnYearData = useMemo(() => {
    const result: { idn: string; year: number; wac: number; asp: number; aspPlus6: number; acquisition: number; spread: number; flagged: boolean; units: number; revenue: number }[] = [];
    for (const idn of idnList) {
      for (let yi = 0; yi < annualASP.length; yi++) {
        const a = annualASP[yi];
        const acq = a.wac * (1 - idn.discount / 100);
        const spread = a.aspPlus6 - acq;
        const flagged = a.asp < acq;
        const ca = channelAllocations[yi]?.allocations ?? {};
        const bbPct = ((ca['Medicare Part B'] ?? 16) + (ca['Commercial Medical'] ?? 18)) / 100;
        const units = (forecast[yi]?.annualUnits ?? 0) * bbPct * (idn.volumePct / 100);
        result.push({ idn: idn.name, year: a.year, wac: a.wac, asp: a.asp, aspPlus6: a.aspPlus6, acquisition: acq, spread, flagged, units, revenue: units * acq });
      }
    }
    return result;
  }, [idnList, annualASP, channelAllocations, forecast]);

  // Portfolio summary table
  const portHeaders = ['IDN Name', 'Type', 'Disc %', 'B&B Vol %', 'Acq. Price', 'ASP+6%', 'Spread', 'Status'];
  const portRows = idnList.map(idn => {
    const acq = yr1WAC * (1 - idn.discount / 100);
    const spread = yr1ASP6 - acq;
    const flagged = yr1ASP < acq;
    return [
      idn.name, idn.is340b ? '340B' : 'GPO/IDN', `${idn.discount.toFixed(1)}%`, `${idn.volumePct.toFixed(1)}%`,
      fmtD(acq), fmtD(yr1ASP6), fmtD(spread), flagged ? '⚠ ASP<ACQ' : '✓ Profitable',
    ];
  });

  // Comparison chart data
  const comparisonData = annualASP.map(a => {
    const entry: Record<string, number | string> = { year: a.year, WAC: a.wac, ASP: a.asp, 'ASP+6%': a.aspPlus6 };
    for (const idn of idnList) {
      entry[idn.name] = a.wac * (1 - idn.discount / 100);
    }
    return entry;
  });

  // Volume sum
  const volSum = idnList.reduce((s, i) => s + i.volumePct, 0);

  return (
    <div className="space-y-6">
      <InfoBox>
        <strong>Buy &amp; Bill mechanics:</strong> Provider purchases drug at IDN/GPO contract price,
        administers to patient, then bills Medicare at <strong>ASP + 6%</strong>.
        Provider margin = ASP+6% − Acquisition. A flag fires when ASP falls below acquisition cost.
      </InfoBox>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="IDNs Configured" value={String(idnList.length)} />
        <MetricCard label="Year 1 ASP" value={fmtD(yr1ASP)} />
        <MetricCard label="Medicare Reimb (ASP+6%)" value={fmtD(yr1ASP6)} />
        <MetricCard label="Year 1 WAC" value={fmtD(yr1WAC)} />
      </div>

      {/* IDN Portfolio Cards */}
      <SectionHeader>IDN Portfolio</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {idnList.map((idn, i) => {
          const acq = yr1WAC * (1 - idn.discount / 100);
          const spread = yr1ASP6 - acq;
          const flagged = yr1ASP < acq;
          const bbPct = ((channelAllocations[0]?.allocations['Medicare Part B'] ?? 16) + (channelAllocations[0]?.allocations['Commercial Medical'] ?? 18)) / 100;
          const units = (forecast[0]?.annualUnits ?? 0) * bbPct * (idn.volumePct / 100);
          const rev = units * acq;
          return (
            <div key={i} className={`rounded-xl p-4 border-l-4 bg-white border border-[#EAECEC] ${flagged ? 'border-l-red-500' : 'border-l-green-500'}`}>
              <div className="font-bold text-xs text-[#004567] mb-1">{idn.name}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${idn.is340b ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {idn.is340b ? '340B' : 'GPO/IDN'}
              </span>
              <div className="grid grid-cols-2 gap-1 mt-3 text-[10px]">
                <div className="bg-[#EAECEC]/50 rounded p-1.5">
                  <div className="text-[#9296B2] uppercase">Disc</div>
                  <div className="font-mono font-bold text-[#004567]">{idn.discount}%</div>
                </div>
                <div className="bg-[#EAECEC]/50 rounded p-1.5">
                  <div className="text-[#9296B2] uppercase">Vol</div>
                  <div className="font-mono font-bold text-[#004567]">{idn.volumePct}%</div>
                </div>
                <div className="bg-[#EAECEC]/50 rounded p-1.5">
                  <div className="text-[#9296B2] uppercase">Acq</div>
                  <div className="font-mono font-bold text-[#004567]">{fmtD(acq)}</div>
                </div>
                <div className="bg-[#EAECEC]/50 rounded p-1.5">
                  <div className="text-[#9296B2] uppercase">Spread</div>
                  <div className={`font-mono font-bold ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtD(spread)}</div>
                </div>
              </div>
              <div className="bg-[#EAECEC]/50 rounded p-1.5 mt-1 text-[10px]">
                <div className="text-[#9296B2] uppercase">Est. Mfr Rev (Y1)</div>
                <div className="font-mono font-bold text-[#004567]">{fmtM(rev)}</div>
              </div>
              <div className={`mt-2 text-center text-[10px] font-bold py-1 rounded ${flagged ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {flagged ? '⚠ ASP < ACQ' : '✓ Profitable'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Portfolio table */}
      <SectionHeader>Portfolio Summary</SectionHeader>
      <DataTable headers={portHeaders} rows={portRows} />

      {/* Edit IDNs */}
      <Accordion title="Edit IDN Allocations" summary={`${idnList.length} IDNs, volume sum ${volSum.toFixed(1)}%`}>
        <div className="space-y-3">
          <div className="flex gap-2 mb-3">
            <button onClick={addIDN} className="text-xs px-3 py-1.5 bg-[#004567] text-white rounded-md font-semibold hover:bg-[#004466]">+ Add IDN</button>
            {idnList.length > 1 && (
              <button onClick={() => removeIDN(idnList.length - 1)} className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-md font-semibold hover:bg-red-100 border border-red-200">Remove Last</button>
            )}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#004567] text-white text-xs">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">IDN Name</th>
                  <th className="px-2 py-2 text-center">Discount %</th>
                  <th className="px-2 py-2 text-center">Volume %</th>
                  <th className="px-2 py-2 text-center">340B</th>
                </tr>
              </thead>
              <tbody>
                {idnList.map((idn, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#EAECEC]/40'}>
                    <td className="px-2 py-1.5 font-bold text-[#004567] text-xs">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={idn.name} onChange={e => updateIDN(i, { name: e.target.value })}
                        className="w-full px-2 py-1 border border-[#EAECEC] rounded text-xs text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
                    </td>
                    <td className="px-2 py-1.5 w-24"><NumberInput value={idn.discount} onChange={v => updateIDN(i, { discount: v })} min={0} max={99} step={0.5} /></td>
                    <td className="px-2 py-1.5 w-24"><NumberInput value={idn.volumePct} onChange={v => updateIDN(i, { volumePct: v })} min={0} max={100} step={1} /></td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={idn.is340b} onChange={e => updateIDN(i, { is340b: e.target.checked })} className="accent-[#004567]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`text-xs font-mono font-bold ${Math.abs(volSum - 100) < 1 ? 'text-green-600' : 'text-red-500'}`}>
            Volume sum: {volSum.toFixed(1)}% {Math.abs(volSum - 100) < 1 ? '✓' : '— should be 100%'}
          </div>
        </div>
      </Accordion>

      {/* Comparison chart */}
      <SectionHeader>WAC / ASP / Acquisition Price Comparison</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [fmtD(v)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="WAC" stroke="#C98B27" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
            <Line dataKey="ASP" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 5 }} />
            <Line dataKey="ASP+6%" stroke="#5B9BD5" strokeWidth={2} dot={{ r: 4 }} />
            {idnList.map((idn, i) => (
              <Line key={idn.name} dataKey={idn.name} stroke={IDN_LINE_COLORS[i % IDN_LINE_COLORS.length]}
                strokeWidth={1.5} strokeDasharray={idn.is340b ? '5 3' : undefined} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Spread heatmap */}
      <SectionHeader>Provider Spread Heatmap (ASP+6% − Acquisition)</SectionHeader>
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#004567] text-white">
              <th className="px-3 py-2 text-left font-semibold">IDN</th>
              {forecastYears.map(y => <th key={y} className="px-3 py-2 text-center font-semibold">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {idnList.map((idn, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#EAECEC]/40'}>
                <td className="px-3 py-1.5 font-semibold text-[#004567] whitespace-nowrap">{idn.name.split('(')[0].trim()}</td>
                {forecastYears.map(yr => {
                  const row = idnYearData.find(r => r.idn === idn.name && r.year === yr);
                  const spread = row?.spread ?? 0;
                  const bg = spread >= 100 ? 'bg-green-100 text-green-700' : spread >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600';
                  return <td key={yr} className={`px-3 py-1.5 text-center font-mono font-bold ${bg}`}>{fmtD(spread)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ASP vs Acquisition flags */}
      <SectionHeader>ASP vs Acquisition Flags — Per IDN Per Year</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {idnList.map((idn, i) => {
          const idnRows = idnYearData.filter(r => r.idn === idn.name);
          const anyFlag = idnRows.some(r => r.flagged);
          return (
            <div key={i} className={`rounded-xl border p-3 ${anyFlag ? 'border-red-300 bg-red-50/30' : 'border-green-300 bg-green-50/30'}`}>
              <div className={`font-bold text-xs mb-2 ${anyFlag ? 'text-red-600' : 'text-green-600'}`}>{idn.name}</div>
              <div className="text-[10px] text-[#9296B2] mb-2">{idn.is340b ? '340B' : 'GPO'} · {idn.discount}% off WAC</div>
              {idnRows.map(r => (
                <div key={r.year} className="flex items-center justify-between text-[10px] py-0.5 border-b border-[#EAECEC] last:border-0">
                  <span className="font-mono text-[#44546A]">{r.year}</span>
                  <span className="font-mono">{fmtD(r.asp)} / {fmtD(r.acquisition)}</span>
                  <span className={`font-bold ${r.flagged ? 'text-red-500' : 'text-green-500'}`}>{r.flagged ? '⚠' : '✓'}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB D — Payer / PBM Analysis (Pharmacy Benefit only)
// ═══════════════════════════════════════════════════════════════════════════

function PayerPBMTab() {
  const { annualData, aspData, forecastYears } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const rebates = useStore(s => s.rebates);
  const rp = useStore(s => s.referenceProduct);

  // PBM rebate trend
  const rebateTrend = rebates.map(r => ({ year: r.year, 'PBM Rebate %': r.comPbm, 'Part D Rebate %': r.mcrD }));

  // Effective net price at pharmacy: WAC minus all rebates and fees per unit
  const netPriceData = annualData.map((d, i) => {
    const netPerUnit = d.units > 0 ? d.netSalesAfterIRA / d.units : 0;
    const rpWac = rp.wacPerUnit[i] ?? 0;
    return {
      year: d.year,
      'Biosimilar Net $/Unit': netPerUnit,
      'RP WAC $/Unit': rpWac,
      'Biosimilar WAC': forecast[i]?.wacPerUnit ?? 0,
    };
  });

  // Formulary position by year
  const formularyOverride = useStore(s => s.formularyTierOverride);
  const formularyByYear = rebates.map(r => {
    const autoTier = r.comPbm > 25 ? 'Preferred' : r.comPbm >= 15 ? 'Non-Preferred' : 'Non-Formulary';
    const tier = formularyOverride === 'auto' ? autoTier : (formularyOverride.charAt(0).toUpperCase() + formularyOverride.slice(1)).replace('-', '-');
    const displayTier = formularyOverride === 'auto' ? autoTier
      : formularyOverride === 'preferred' ? 'Preferred'
      : formularyOverride === 'non-preferred' ? 'Non-Preferred' : 'Non-Formulary';
    return { year: r.year, tier: displayTier, rebate: r.comPbm };
  });

  return (
    <div className="space-y-6">
      <SectionHeader>Formulary Position Analysis</SectionHeader>
      <div className="flex gap-3 flex-wrap">
        {formularyByYear.map(f => (
          <div key={f.year} className={`rounded-lg px-4 py-3 text-center border ${f.tier === 'Preferred' ? 'border-green-300 bg-green-50' : f.tier === 'Non-Preferred' ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'}`}>
            <div className="font-bold text-xs text-[#004567]">{f.year}</div>
            <div className={`text-sm font-bold mt-1 ${f.tier === 'Preferred' ? 'text-green-700' : f.tier === 'Non-Preferred' ? 'text-amber-700' : 'text-red-700'}`}>{f.tier}</div>
            <div className="text-[10px] font-mono text-[#9296B2] mt-0.5">{f.rebate.toFixed(1)}% rebate</div>
          </div>
        ))}
      </div>

      <SectionHeader>PBM Rebate Trend</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rebateTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${Number(v).toFixed(1)}%`]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="PBM Rebate %" stroke="#5B9BD5" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line dataKey="Part D Rebate %" stroke="#C98B27" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SectionHeader>Effective Net Price: Biosimilar vs Reference Product</SectionHeader>
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={netPriceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [fmtD(v)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="RP WAC $/Unit" stroke="#f87171" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 4 }} />
            <Line dataKey="Biosimilar WAC" stroke="#9296B2" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
            <Line dataKey="Biosimilar Net $/Unit" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SectionHeader>Payer Value Proposition</SectionHeader>
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full text-xs">
          <thead><tr className="bg-[#004567] text-white">
            <th className="px-3 py-2 text-left">Metric</th>
            {forecastYears.map(y => <th key={y} className="px-3 py-2 text-center">{y}</th>)}
          </tr></thead>
          <tbody>
            <tr className="bg-white">
              <td className="px-3 py-1.5 font-semibold text-[#004567]">Biosimilar WAC</td>
              {forecast.map((f, i) => <td key={i} className="px-3 py-1.5 text-center font-mono">{fmtD(f.wacPerUnit)}</td>)}
            </tr>
            <tr className="bg-[#EAECEC]/40">
              <td className="px-3 py-1.5 font-semibold text-[#004567]">RP WAC</td>
              {forecastYears.map((_, i) => <td key={i} className="px-3 py-1.5 text-center font-mono">{fmtD(rp.wacPerUnit[i] ?? 0)}</td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-3 py-1.5 font-semibold text-[#004567]">WAC Savings vs RP</td>
              {forecast.map((f, i) => {
                const saving = (rp.wacPerUnit[i] ?? 0) - f.wacPerUnit;
                return <td key={i} className={`px-3 py-1.5 text-center font-mono font-bold ${saving > 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtD(saving)}</td>;
              })}
            </tr>
            <tr className="bg-[#EAECEC]/40">
              <td className="px-3 py-1.5 font-semibold text-[#004567]">Effective Net $/Unit</td>
              {annualData.map((d, i) => <td key={i} className="px-3 py-1.5 text-center font-mono">{fmtD(d.units > 0 ? d.netSalesAfterIRA / d.units : 0)}</td>)}
            </tr>
            <tr className="bg-white">
              <td className="px-3 py-1.5 font-semibold text-[#004567]">PBM Rebate %</td>
              {rebates.map((r, i) => <td key={i} className="px-3 py-1.5 text-center font-mono">{r.comPbm.toFixed(1)}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — Results Page
// ═══════════════════════════════════════════════════════════════════════════

export function ResultsPage() {
  const benefitType = useStore(s => s.benefitType);
  const isBnB = benefitType === 'buy-and-bill';
  const saveScenario = useStore(s => s.saveScenario);
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const scenarios = useStore(s => s.scenarios);
  const dirty = useStore(s => s.dirty);
  const setActiveTab = useStore(s => s.setActiveTab);

  const [innerTab, setInnerTab] = useState<'gtn' | 'asp' | 'buybill' | 'payer'>('gtn');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveToast, setSaveToast] = useState(false);

  const { annualData } = useComputedData();
  const lastUpdated = useRef(new Date());

  useEffect(() => {
    lastUpdated.current = new Date();
  }, [annualData]);

  const active = activeScenarioId ? scenarios[activeScenarioId] : null;
  const scenarioCount = Object.keys(scenarios).length;

  const handleQuickSave = () => {
    if (active) {
      saveScenario(active.name, active.description, active.tags);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 3000);
    }
  };

  const handleSaveAs = () => {
    if (!saveName.trim()) return;
    saveScenario(saveName.trim(), saveDesc.trim(), []);
    setShowSaveAs(false);
    setSaveName(''); setSaveDesc('');
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const tabs = isBnB
    ? [
        { key: 'gtn' as const, label: 'GTN Summary' },
        { key: 'asp' as const, label: 'ASP Analysis' },
        { key: 'buybill' as const, label: 'Provider Economics' },
      ]
    : [
        { key: 'gtn' as const, label: 'GTN Summary' },
        { key: 'asp' as const, label: 'ASP Analysis' },
        { key: 'payer' as const, label: 'Payer / PBM Analysis' },
      ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[#004567]">Model Results</h2>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${isBnB ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {isBnB ? '💉 Buy & Bill' : '💊 Pharmacy Benefit'}
          </span>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-mono">
          ✓ Results current as of {lastUpdated.current.toLocaleTimeString()}
        </span>
      </div>

      {/* Save Scenario bar */}
      <div className="flex items-center gap-3 p-3 bg-[#F7F9FC] rounded-lg border border-[#EAECEC]">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-semibold text-[#004567]">
            {active ? `${active.name} (v${active.version})` : 'Unsaved'}
          </span>
          {dirty && <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />}
        </div>
        {active && !active.locked && dirty && (
          <button onClick={handleQuickSave}
            className="text-xs px-3 py-1.5 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]">
            Save
          </button>
        )}
        <button onClick={() => setShowSaveAs(!showSaveAs)}
          className="text-xs px-3 py-1.5 bg-[#C98B27] text-white rounded font-semibold hover:bg-[#b07a20]">
          Save As New Scenario
        </button>
      </div>

      {showSaveAs && (
        <div className="p-3 bg-[#FFF9EE] border border-[#C98B27] rounded-lg space-y-2">
          <input type="text" placeholder="Scenario name" value={saveName} onChange={e => setSaveName(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#EAECEC] rounded text-sm text-[#004567] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          <input type="text" placeholder="Description (optional)" value={saveDesc} onChange={e => setSaveDesc(e.target.value)}
            className="w-full px-3 py-1.5 border border-[#EAECEC] rounded text-sm text-[#44546A] focus:ring-1 focus:ring-[#C98B27] outline-none" />
          <div className="flex gap-2">
            <button onClick={handleSaveAs} className="text-xs px-4 py-1.5 bg-[#004567] text-white rounded font-semibold hover:bg-[#004466]">Save</button>
            <button onClick={() => setShowSaveAs(false)} className="text-xs px-4 py-1.5 border border-[#EAECEC] rounded font-semibold text-[#44546A]">Cancel</button>
          </div>
        </div>
      )}

      {saveToast && (
        <div className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded">
          ✓ Scenario saved successfully
        </div>
      )}

      {scenarioCount >= 2 && (
        <button onClick={() => setActiveTab('scenarios')}
          className="text-xs text-[#C98B27] underline hover:text-[#b07a20]">
          Compare with other scenarios ({scenarioCount} saved)
        </button>
      )}

      <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setInnerTab(t.key)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition-all
              ${innerTab === t.key ? 'bg-[#004567] text-white shadow-md' : 'text-[#44546A] hover:bg-white hover:text-[#004567]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {innerTab === 'gtn' && <GTNSummaryTab />}
      {innerTab === 'asp' && <ASPAnalysisTab />}
      {innerTab === 'buybill' && <BuyBillAnalysisTab />}
      {innerTab === 'payer' && <PayerPBMTab />}
    </div>
  );
}
