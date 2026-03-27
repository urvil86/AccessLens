import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useComputedData } from '../../engine/hooks';
import { fmtSales, fmtM, fmtPct, fmtU, fmtD } from '../../engine/compute';
import { MetricCard } from '../../shared/MetricCard';
import { Accordion } from '../../shared/Accordion';
import { DataTable } from '../../shared/DataTable';
import { COLORS_MAIN } from '../../engine/constants';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const PIE_COLORS = ['#5B9BD5', '#C98B27', '#004567', '#9296B2', '#5C6082', '#C6B78A', '#44546A', '#4ade80', '#f87171', '#E8E1CE'];

export function DashboardTab() {
  const { annualData, aspData, forecastYears } = useComputedData();
  const idnList = useStore(s => s.idnList);
  const rebates = useStore(s => s.rebates);
  const productName = useStore(s => s.productName);
  const therapyArea = useStore(s => s.therapyArea);
  const benefitType = useStore(s => s.benefitType);
  const setActiveTab = useStore(s => s.setActiveTab);
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);
  const rp = useStore(s => s.referenceProduct);

  const [chartView, setChartView] = useState<'waterfall' | 'trend' | 'channel'>('waterfall');
  const [pieYear, setPieYear] = useState(0); // index into forecastYears

  // ── KPI computations ──
  const totalGross = annualData.reduce((s, d) => s + d.grossSales, 0);
  const totalNet = annualData.reduce((s, d) => s + d.netSales, 0);
  const avgGtn = annualData.length > 0 ? annualData.reduce((s, d) => s + d.gtnPct, 0) / annualData.length : 0;
  const peakYear = annualData.length > 0
    ? annualData.reduce((best, d) => (d.netSales > best.netSales ? d : best), annualData[0])
    : null;

  // Avg discount to RP
  const avgRPDiscount = useMemo(() => {
    if (forecast.length === 0) return 0;
    const discounts = forecast.map((f, i) => {
      const rpW = rp.wacPerUnit[i] ?? 1;
      return rpW > 0 ? (1 - f.wacPerUnit / rpW) * 100 : 0;
    });
    return discounts.reduce((s, d) => s + d, 0) / discounts.length;
  }, [forecast, rp]);

  const isBnB = benefitType === 'buy-and-bill';

  // B&B: Avg provider spread (ASP+6% minus avg IDN acquisition)
  const avgProviderSpread = useMemo(() => {
    if (!isBnB || aspData.length === 0 || idnList.length === 0) return 0;
    const avgASP6 = aspData.reduce((s, a) => s + a.aspPlus6, 0) / aspData.length;
    const avgIdnAcq = idnList.reduce((s, idn) => {
      const avgWac = forecast.reduce((ws, f) => ws + f.wacPerUnit, 0) / (forecast.length || 1);
      return s + avgWac * (1 - idn.discount / 100) * (idn.volumePct / 100);
    }, 0);
    return avgASP6 - avgIdnAcq;
  }, [isBnB, aspData, idnList, forecast]);

  // Pharmacy: Avg rebate depth for formulary position
  const avgPBMRebate = useMemo(() => {
    if (isBnB || rebates.length === 0) return 0;
    return rebates.reduce((s, r) => s + r.comPbm, 0) / rebates.length;
  }, [isBnB, rebates]);

  const formularyPosition = avgPBMRebate > 25 ? 'Preferred' : avgPBMRebate >= 15 ? 'Non-Preferred' : 'Non-Formulary';
  const formularyColor = avgPBMRebate > 25 ? 'border-green-300' : avgPBMRebate >= 15 ? 'border-amber-300' : 'border-red-300';

  // Avg net price per unit
  const avgNetPrice = useMemo(() => {
    const totalUnits = annualData.reduce((s, d) => s + d.units, 0);
    return totalUnits > 0 ? totalNet / totalUnits : 0;
  }, [annualData, totalNet]);

  // Delta vs prior year for peak year
  const deltas = useMemo(() => {
    if (annualData.length < 2) return { gross: null, net: null, gtn: null };
    const last = annualData[annualData.length - 1];
    const prev = annualData[annualData.length - 2];
    const pctChange = (curr: number, prior: number) => prior !== 0 ? ((curr - prior) / Math.abs(prior)) * 100 : 0;
    return {
      gross: { value: `${pctChange(last.grossSales, prev.grossSales) >= 0 ? '+' : ''}${pctChange(last.grossSales, prev.grossSales).toFixed(1)}% vs ${prev.year}`, positive: last.grossSales >= prev.grossSales },
      net: { value: `${pctChange(last.netSales, prev.netSales) >= 0 ? '+' : ''}${pctChange(last.netSales, prev.netSales).toFixed(1)}% vs ${prev.year}`, positive: last.netSales >= prev.netSales },
      gtn: { value: `${(last.gtnPct - prev.gtnPct) >= 0 ? '+' : ''}${(last.gtnPct - prev.gtnPct).toFixed(1)}pp vs ${prev.year}`, positive: last.gtnPct <= prev.gtnPct },
    };
  }, [annualData]);

  // ── Chart data ──

  // Waterfall
  // Waterfall data: each item has [bottom, top] range for the bar
  const waterfallData = useMemo(() => {
    const totReb = annualData.reduce((s, d) => s + d.totalRebates, 0);
    const totCB = annualData.reduce((s, d) => s + d.totalChargebacks, 0);
    const totOth = annualData.reduce((s, d) => s + d.totalOther, 0);
    const g = totalGross / 1e6;
    const r = totReb / 1e6;
    const c = totCB / 1e6;
    const o = totOth / 1e6;
    const n = totalNet / 1e6;
    // Each bar defined as [bottom, top] range
    return [
      { label: 'Gross Sales', range: [0, g] as [number, number], fill: '#5B9BD5', displayLabel: `$${g.toFixed(1)}M` },
      { label: '(-) Rebates', range: [g - r, g] as [number, number], fill: '#f87171', displayLabel: `-$${r.toFixed(1)}M` },
      { label: '(-) Chargebacks', range: [g - r - c, g - r] as [number, number], fill: '#C6B78A', displayLabel: `-$${c.toFixed(1)}M` },
      { label: '(-) Fees/Other', range: [g - r - c - o, g - r - c] as [number, number], fill: '#C98B27', displayLabel: `-$${o.toFixed(1)}M` },
      { label: 'Net Sales', range: [0, n] as [number, number], fill: '#4ade80', displayLabel: `$${n.toFixed(1)}M` },
    ];
  }, [annualData, totalGross, totalNet]);

  // Annual trend
  const trendData = useMemo(() =>
    annualData.map((d, i) => ({
      year: d.year,
      gross: d.grossSales / 1e6,
      net: d.netSales / 1e6,
      gtnPct: d.gtnPct,
      wac: forecast[i]?.wacPerUnit ?? 0,
      rpWac: rp.wacPerUnit[i] ?? 0,
    })),
    [annualData, forecast, rp]);

  // Channel pie
  const pieData = useMemo(() => {
    const ca = channelAllocations[pieYear];
    if (!ca) return [];
    return activeChannels.map(ch => ({ name: ch, value: ca.allocations[ch] ?? 0 })).filter(d => d.value > 0);
  }, [channelAllocations, pieYear, activeChannels]);

  // Summary table
  const summaryHeaders = ['Metric', ...annualData.map(d => String(d.year))];
  const summaryRows: string[][] = [
    ['Units', ...annualData.map(d => fmtU(d.units))],
    ['WAC/Unit', ...forecast.map(f => fmtD(f.wacPerUnit))],
    ['Gross Sales ($M)', ...annualData.map(d => fmtM(d.grossSales))],
    ['Rebates ($M)', ...annualData.map(d => fmtM(d.totalRebates))],
    ['Chargebacks ($M)', ...annualData.map(d => fmtM(d.totalChargebacks))],
    ['Fees/Other ($M)', ...annualData.map(d => fmtM(d.totalOther))],
    ['Total Deductions', ...annualData.map(d => fmtM(d.totalDeductions))],
    ['Net Sales ($M)', ...annualData.map(d => fmtM(d.netSales))],
    ['GTN%', ...annualData.map(d => fmtPct(d.gtnPct))],
    ['Net $/Unit', ...annualData.map(d => fmtD(d.netPrice))],
    ['Net % of WAC', ...annualData.map(d => fmtPct(d.netPct))],
  ];

  const views = [
    { key: 'waterfall' as const, label: 'P&L Waterfall' },
    { key: 'trend' as const, label: 'Annual Trend' },
    { key: 'channel' as const, label: 'Channel Mix' },
  ];

  const firstYear = forecastYears[0] ?? 2025;
  const lastYear = forecastYears[forecastYears.length - 1] ?? 2031;

  // Onboarding: show welcome if no meaningful data
  const hasData = annualData.length > 0 && totalGross > 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-[#EAECEC] shadow-lg p-8 max-w-lg text-center">
          <div className="text-4xl mb-4">⚕️</div>
          <h2 className="text-xl font-bold text-[#004567] mb-2">Welcome to AccessLens!</h2>
          <p className="text-sm text-[#44546A] mb-6 leading-relaxed">
            Build your multi-year Gross-to-Net forecast in 4 steps:
          </p>
          <div className="text-left space-y-3 mb-6">
            {[
              { step: 1, text: 'Set your product details in the sidebar' },
              { step: 2, text: 'Enter assumptions (volumes, channels, contracts)' },
              { step: 3, text: 'View auto-computed results' },
              { step: 4, text: 'Save and compare scenarios' },
            ].map(s => (
              <div key={s.step} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-[#C98B27] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {s.step}
                </span>
                <span className="text-sm text-[#44546A]">{s.text}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setActiveTab('assumptions')}
            className="px-6 py-2.5 bg-[#004567] text-white rounded-lg font-semibold hover:bg-[#004466] transition-colors">
            Get Started → Assumptions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── SECTION 1: KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Total Gross Sales" value={fmtSales(totalGross)} delta={deltas.gross ?? undefined} />
        <MetricCard label="Total Net Sales" value={fmtSales(totalNet)} delta={deltas.net ?? undefined} />
        <MetricCard label="Avg GTN %" value={fmtPct(avgGtn)} delta={deltas.gtn ?? undefined} />
        {isBnB ? (
          <MetricCard
            label="Avg Provider Spread"
            value={fmtD(avgProviderSpread)}
            className={avgProviderSpread > 0 ? 'border-green-300' : 'border-red-300'}
          />
        ) : (
          <MetricCard label="Avg Net $/Unit" value={fmtD(avgNetPrice)} />
        )}
        <MetricCard
          label="Avg Discount to RP"
          value={fmtPct(avgRPDiscount)}
          className={avgRPDiscount >= 15 ? 'border-green-300' : avgRPDiscount >= 10 ? 'border-amber-300' : 'border-red-300'}
        />
      </div>

      {/* Benefit-type indicator */}
      {isBnB ? (
        <div className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-semibold ${avgProviderSpread > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {avgProviderSpread > 0 ? '✓ Provider margin positive' : '⚠ Provider margin negative — ASP below acquisition'}
        </div>
      ) : (
        <div className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-semibold ${formularyColor.replace('border-', 'bg-').replace('300', '50')} ${formularyColor.replace('border-', 'text-').replace('300', '700')} border ${formularyColor}`}>
          Formulary Position: {formularyPosition} (avg PBM rebate {avgPBMRebate.toFixed(1)}%)
        </div>
      )}

      {/* Context badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-3 py-1 bg-[#004567] text-white rounded-full font-semibold">{productName}</span>
        <span className="text-xs px-3 py-1 bg-[#EAECEC] text-[#004567] rounded-full font-medium">{therapyArea}</span>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold ${isBnB ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {isBnB ? '💉 Buy & Bill' : '💊 Pharmacy Benefit'}
        </span>
        <span className="text-xs px-3 py-1 bg-[#EAECEC] text-[#004567] rounded-full font-mono">{firstYear}–{lastYear} · {forecastYears.length}yr</span>
      </div>

      {/* ── SECTION 2: Primary Visualization ── */}
      <div className="bg-white rounded-xl border border-[#EAECEC] p-4">
        {/* View toggle */}
        <div className="flex gap-1 bg-[#EAECEC] rounded-lg p-0.5 w-fit mb-4">
          {views.map(v => (
            <button key={v.key} onClick={() => setChartView(v.key)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all
                ${chartView === v.key ? 'bg-[#C98B27] text-white shadow' : 'text-[#44546A] hover:bg-white'}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* View A: Waterfall */}
        {chartView === 'waterfall' && (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={waterfallData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip
                formatter={(v: unknown, name: string) => {
                  if (name === 'range') {
                    const arr = v as [number, number];
                    const diff = Math.abs(arr[1] - arr[0]);
                    return [`$${diff.toFixed(1)}M`, 'Amount'];
                  }
                  return [String(v), name];
                }}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="range"
                label={{
                  position: 'top', fontSize: 11, fontWeight: 700, fill: '#004567',
                  formatter: (_: unknown, item: unknown) => {
                    const entry = item as { payload?: { displayLabel?: string } };
                    return entry?.payload?.displayLabel ?? '';
                  }
                }}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* View B: Annual Trend */}
        {chartView === 'trend' && (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tickFormatter={(v: number) => `$${v.toFixed(0)}M`} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="gross" name="Gross $M" fill="#5B9BD5" opacity={0.7} />
              <Bar yAxisId="left" dataKey="net" name="Net $M" fill="#4ade80" opacity={0.85} />
              <Line yAxisId="right" type="monotone" dataKey="gtnPct" name="GTN %" stroke="#f87171" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* View C: Channel Mix */}
        {chartView === 'channel' && (
          <div>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={80} outerRadius={140}
                  dataKey="value"
                  label={({ name, value }: { name: string; value: number }) => value >= 5 ? `${name}: ${value.toFixed(1)}%` : ''}
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${Number(v).toFixed(1)}%`]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                  className="fill-[#004567] text-2xl font-bold font-mono">
                  {forecastYears[pieYear] ?? ''}
                </text>
              </PieChart>
            </ResponsiveContainer>
            {/* Year slider */}
            <div className="flex items-center gap-3 px-4 mt-2">
              <span className="text-xs text-[#9296B2] font-mono">{firstYear}</span>
              <input
                type="range"
                min={0} max={forecastYears.length - 1}
                value={pieYear}
                onChange={e => setPieYear(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-[#9296B2] font-mono">{lastYear}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 3: Detail Table ── */}
      <Accordion title="View Full Summary Table" summary={`${annualData.length} years · ${summaryRows.length} metrics`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[#9296B2]">All values computed from current assumptions</span>
          <button disabled className="px-3 py-1.5 bg-[#EAECEC] text-[#9296B2] rounded-md text-xs font-semibold cursor-not-allowed">
            Download as Excel (Coming Soon)
          </button>
        </div>
        <DataTable headers={summaryHeaders} rows={summaryRows} />
      </Accordion>
    </div>
  );
}
