import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useComputedData } from '../../engine/hooks';
import { fmtM, fmtD, fmtPct, fmtU } from '../../engine/compute';
import { SectionHeader } from '../../shared/SectionHeader';
import { MetricCard } from '../../shared/MetricCard';
import { Accordion } from '../../shared/Accordion';
import { CHANNELS } from '../../engine/constants';
import type { Customer } from '../../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';

// ── Computed customer data ────────────────────────────────────────────────

function useCustomerMetrics(customer: Customer, year: number) {
  const { annualData, forecastYears } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);

  return useMemo(() => {
    const yrIdx = forecastYears.indexOf(year);
    if (yrIdx < 0) return null;
    const annual = annualData[yrIdx];
    const fc = forecast[yrIdx];
    const ca = channelAllocations[yrIdx];
    if (!annual || !fc || !ca) return null;

    const channelPct = (ca.allocations[customer.channelType] ?? 0) / 100;
    const volPct = customer.volumePctOfChannel / 100;
    const units = annual.units * channelPct * volPct;
    const grossSales = units * fc.wacPerUnit;

    const isDiscount = customer.channelType.includes('GPO') || customer.channelType.includes('340B');
    let netRevenue: number, rebateDollars: number, gtnPct: number;

    if (isDiscount && customer.idnDiscount !== undefined) {
      const acqPrice = fc.wacPerUnit * (1 - customer.idnDiscount / 100);
      netRevenue = units * acqPrice;
      rebateDollars = units * (fc.wacPerUnit - acqPrice);
      gtnPct = customer.idnDiscount;
    } else {
      netRevenue = grossSales * (1 - customer.contractedRebatePct / 100);
      rebateDollars = grossSales * (customer.contractedRebatePct / 100);
      gtnPct = customer.contractedRebatePct;
    }

    return { units, grossSales, netRevenue, rebateDollars, gtnPct };
  }, [customer, year, annualData, forecast, channelAllocations, forecastYears]);
}

// ── Customer Table ────────────────────────────────────────────────────────

function CustomerTable({ selectedYear, onSelectCustomer, selectedCustomerId }: {
  selectedYear: number;
  onSelectCustomer: (id: number | null) => void;
  selectedCustomerId: number | null;
}) {
  const customerList = useStore(s => s.customerList);
  const updateCustomer = useStore(s => s.updateCustomer);
  const addCustomer = useStore(s => s.addCustomer);
  const deleteCustomer = useStore(s => s.deleteCustomer);
  const { annualData, forecastYears } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Customer>>({});
  const [filterChannel, setFilterChannel] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const hasResults = annualData.length > 0;
  const yrIdx = forecastYears.indexOf(selectedYear);

  // Compute metrics for all customers
  const customerMetrics = useMemo(() => {
    if (!hasResults || yrIdx < 0) return new Map<number, ReturnType<typeof Object>>();
    const annual = annualData[yrIdx];
    const fc = forecast[yrIdx];
    const ca = channelAllocations[yrIdx];
    if (!annual || !fc || !ca) return new Map();

    const m = new Map<number, { units: number; grossSales: number; netRevenue: number; gtnPct: number }>();
    for (const c of customerList) {
      const channelPct = (ca.allocations[c.channelType] ?? 0) / 100;
      const volPct = c.volumePctOfChannel / 100;
      const units = annual.units * channelPct * volPct;
      const grossSales = units * fc.wacPerUnit;
      const isDisc = c.channelType.includes('GPO') || c.channelType.includes('340B');
      let netRevenue: number, gtnPct: number;
      if (isDisc && c.idnDiscount !== undefined) {
        netRevenue = units * fc.wacPerUnit * (1 - c.idnDiscount / 100);
        gtnPct = c.idnDiscount;
      } else {
        netRevenue = grossSales * (1 - c.contractedRebatePct / 100);
        gtnPct = c.contractedRebatePct;
      }
      m.set(c.id, { units, grossSales, netRevenue, gtnPct });
    }
    return m;
  }, [hasResults, yrIdx, annualData, forecast, channelAllocations, customerList]);

  const filtered = useMemo(() => {
    let list = [...customerList];
    if (filterChannel.length > 0) list = list.filter(c => filterChannel.includes(c.channelType));
    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = '';
      if (sortCol === 'name') { va = a.name; vb = b.name; }
      else if (sortCol === 'channel') { va = a.channelType; vb = b.channelType; }
      else if (sortCol === 'rate') { va = a.contractedRebatePct || a.idnDiscount || 0; vb = b.contractedRebatePct || b.idnDiscount || 0; }
      else if (sortCol === 'gross') { va = customerMetrics.get(a.id)?.grossSales ?? 0; vb = customerMetrics.get(b.id)?.grossSales ?? 0; }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [customerList, filterChannel, sortCol, sortAsc, customerMetrics]);

  const toggleSort = (col: string) => { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(true); } };

  const startEdit = (c: Customer) => { setEditingId(c.id); setEditDraft({ ...c }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const saveEdit = () => {
    if (editingId !== null) { updateCustomer(editingId, editDraft); setEditingId(null); setEditDraft({}); }
  };

  // Totals
  const totals = useMemo(() => {
    let units = 0, gross = 0, net = 0, weightedGtn = 0;
    for (const c of filtered) {
      const m = customerMetrics.get(c.id);
      if (m) { units += m.units; gross += m.grossSales; net += m.netRevenue; weightedGtn += m.gtnPct * m.grossSales; }
    }
    return { units, gross, net, avgGtn: gross > 0 ? weightedGtn / gross : 0 };
  }, [filtered, customerMetrics]);

  const gtnColor = (pct: number) => pct < 20 ? 'text-green-600' : pct <= 35 ? 'text-amber-600' : 'text-red-600';

  const uniqueChannels = [...new Set(customerList.map(c => c.channelType))];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={() => { addCustomer(); }} className="text-xs px-3 py-1.5 bg-[#004567] text-white rounded-md font-semibold hover:bg-[#004466]">+ Add Customer</button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#44546A]">Filter:</span>
          <select multiple value={filterChannel} onChange={e => setFilterChannel(Array.from(e.target.selectedOptions, o => o.value))}
            className="text-[10px] border border-[#EAECEC] rounded px-2 py-1">
            {uniqueChannels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          {filterChannel.length > 0 && <button onClick={() => setFilterChannel([])} className="text-[10px] text-[#C98B27] underline">Clear</button>}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#004567] text-white">
              {[
                { key: 'name', label: 'Customer' }, { key: 'channel', label: 'Channel' },
                { key: 'type', label: 'Type' }, { key: 'rate', label: 'Rate %' },
                { key: 'mcaid', label: 'Mcaid Mix' }, { key: 'vol', label: 'Vol % Ch.' },
              ].map(h => (
                <th key={h.key} className="px-2 py-2 text-left cursor-pointer hover:bg-white/10 whitespace-nowrap" onClick={() => toggleSort(h.key)}>
                  {h.label} {sortCol === h.key ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
              {hasResults && <>
                <th className="px-2 py-2 text-right whitespace-nowrap">Est. Units</th>
                <th className="px-2 py-2 text-right whitespace-nowrap cursor-pointer hover:bg-white/10" onClick={() => toggleSort('gross')}>Gross $</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Net $</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">GTN%</th>
              </>}
              <th className="px-2 py-2 text-left">Notes</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const isEditing = editingId === c.id;
              const m = customerMetrics.get(c.id);
              const isDisc = c.channelType.includes('GPO') || c.channelType.includes('340B');
              const contractType = c.is340b ? '340B' : isDisc ? 'Discount' : 'Rebate';

              if (isEditing) {
                return (
                  <tr key={c.id} className="bg-[#FFF9EE]">
                    <td className="px-2 py-1"><input value={editDraft.name ?? ''} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} className="w-full px-1 py-0.5 border border-[#C98B27] rounded text-xs" /></td>
                    <td className="px-2 py-1">
                      <select value={editDraft.channelType ?? c.channelType} onChange={e => setEditDraft({ ...editDraft, channelType: e.target.value })} className="text-xs border border-[#C98B27] rounded px-1 py-0.5">
                        {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-[10px]">{contractType}</td>
                    <td className="px-2 py-1"><input type="number" value={isDisc ? (editDraft.idnDiscount ?? c.idnDiscount ?? 0) : (editDraft.contractedRebatePct ?? c.contractedRebatePct)} onChange={e => isDisc ? setEditDraft({ ...editDraft, idnDiscount: Number(e.target.value) }) : setEditDraft({ ...editDraft, contractedRebatePct: Number(e.target.value) })} className="w-16 px-1 py-0.5 border border-[#C98B27] rounded text-xs text-center" /></td>
                    <td className="px-2 py-1"><input type="number" value={editDraft.medicaidMixPct ?? c.medicaidMixPct} onChange={e => setEditDraft({ ...editDraft, medicaidMixPct: Number(e.target.value) })} className="w-14 px-1 py-0.5 border border-[#C98B27] rounded text-xs text-center" /></td>
                    <td className="px-2 py-1"><input type="number" value={editDraft.volumePctOfChannel ?? c.volumePctOfChannel} onChange={e => setEditDraft({ ...editDraft, volumePctOfChannel: Number(e.target.value) })} className="w-14 px-1 py-0.5 border border-[#C98B27] rounded text-xs text-center" /></td>
                    {hasResults && <><td /><td /><td /><td /></>}
                    <td className="px-2 py-1"><input value={editDraft.notes ?? c.notes} onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })} className="w-full px-1 py-0.5 border border-[#C98B27] rounded text-xs" /></td>
                    <td className="px-2 py-1 flex gap-1">
                      <button onClick={saveEdit} className="text-[10px] px-2 py-0.5 bg-[#004567] text-white rounded font-semibold">Save</button>
                      <button onClick={cancelEdit} className="text-[10px] px-2 py-0.5 border border-[#EAECEC] rounded">Cancel</button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={c.id} className={`${i % 2 ? 'bg-[#EAECEC]/30' : 'bg-white'} ${selectedCustomerId === c.id ? 'ring-2 ring-[#C98B27] ring-inset' : ''} hover:bg-[#FFF9EE]/50`}>
                  <td className="px-2 py-1.5">
                    <button onClick={() => onSelectCustomer(selectedCustomerId === c.id ? null : c.id)} className="font-semibold text-[#004567] hover:text-[#C98B27] underline text-left">{c.name}</button>
                  </td>
                  <td className="px-2 py-1.5 text-[#44546A]">{c.channelType}</td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${c.is340b ? 'bg-amber-100 text-amber-700' : isDisc ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{contractType}</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-center">{isDisc ? (c.idnDiscount ?? 0).toFixed(1) : c.contractedRebatePct.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 font-mono text-center">{c.medicaidMixPct}%</td>
                  <td className="px-2 py-1.5 font-mono text-center">{c.volumePctOfChannel}%</td>
                  {hasResults && m && <>
                    <td className="px-2 py-1.5 font-mono text-right">{fmtU(m.units)}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{fmtM(m.grossSales)}</td>
                    <td className="px-2 py-1.5 font-mono text-right">{fmtM(m.netRevenue)}</td>
                    <td className={`px-2 py-1.5 font-mono text-right font-bold ${gtnColor(m.gtnPct)}`}>{fmtPct(m.gtnPct)}</td>
                  </>}
                  {hasResults && !m && <><td /><td /><td /><td /></>}
                  <td className="px-2 py-1.5 text-[#9296B2] max-w-[120px] truncate" title={c.notes}>{c.notes}</td>
                  <td className="px-2 py-1.5 flex gap-1">
                    <button onClick={() => startEdit(c)} className="text-[10px] px-2 py-0.5 border border-[#EAECEC] rounded hover:bg-[#EAECEC]">Edit</button>
                    <button onClick={() => deleteCustomer(c.id)} className="text-[10px] px-2 py-0.5 border border-red-200 rounded text-red-500 hover:bg-red-50">Del</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {hasResults && (
            <tfoot>
              <tr className="bg-[#004567]/5 font-bold">
                <td className="px-2 py-2 text-[#004567]" colSpan={6}>Totals ({filtered.length} customers)</td>
                <td className="px-2 py-2 font-mono text-right">{fmtU(totals.units)}</td>
                <td className="px-2 py-2 font-mono text-right">{fmtM(totals.gross)}</td>
                <td className="px-2 py-2 font-mono text-right">{fmtM(totals.net)}</td>
                <td className={`px-2 py-2 font-mono text-right ${gtnColor(totals.avgGtn)}`}>{fmtPct(totals.avgGtn)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Customer Drill-Down Panel ─────────────────────────────────────────────

function CustomerDrillDown({ customerId, selectedYear }: { customerId: number; selectedYear: number }) {
  const customer = useStore(s => s.customerList.find(c => c.id === customerId));
  const { annualData, forecastYears } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);

  if (!customer) return null;

  const isDisc = customer.channelType.includes('GPO') || customer.channelType.includes('340B');

  // Multi-year data
  const yearData = forecastYears.map((yr, i) => {
    const annual = annualData[i];
    const fc = forecast[i];
    const ca = channelAllocations[i];
    if (!annual || !fc || !ca) return { year: yr, netRevenue: 0, gtnPct: 0, grossSales: 0, rebate: 0 };
    const channelPct = (ca.allocations[customer.channelType] ?? 0) / 100;
    const volPct = customer.volumePctOfChannel / 100;
    const units = annual.units * channelPct * volPct;
    const grossSales = units * fc.wacPerUnit;
    let netRevenue: number, gtnPct: number;
    if (isDisc && customer.idnDiscount !== undefined) {
      netRevenue = units * fc.wacPerUnit * (1 - customer.idnDiscount / 100);
      gtnPct = customer.idnDiscount;
    } else {
      netRevenue = grossSales * (1 - customer.contractedRebatePct / 100);
      gtnPct = customer.contractedRebatePct;
    }
    return { year: yr, netRevenue: netRevenue / 1e6, gtnPct, grossSales: grossSales / 1e6, rebate: (grossSales - netRevenue) / 1e6 };
  });

  // Waterfall for selected year
  const yrData = yearData.find(d => d.year === selectedYear);
  const wfData = yrData ? [
    { label: 'Gross', range: [0, yrData.grossSales] as [number, number], fill: '#5B9BD5' },
    { label: isDisc ? '(-) Chargeback' : '(-) Rebate', range: [yrData.netRevenue, yrData.grossSales] as [number, number], fill: '#f87171' },
    { label: 'Net', range: [0, yrData.netRevenue] as [number, number], fill: '#4ade80' },
  ] : [];

  return (
    <div className="bg-white rounded-xl border-2 border-[#C98B27] p-4 mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Deal Terms */}
      <div className="space-y-2">
        <div className="text-base font-bold text-[#004567]">{customer.name}</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${customer.is340b ? 'bg-amber-100 text-amber-700' : isDisc ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {customer.is340b ? '340B' : isDisc ? 'Discount' : 'Rebate'}
        </span>
        <div className="text-xs text-[#44546A] space-y-1 mt-2">
          <div>Channel: <span className="font-semibold text-[#004567]">{customer.channelType}</span></div>
          <div>Rate: <span className="font-mono font-bold">{isDisc ? customer.idnDiscount : customer.contractedRebatePct}%</span></div>
          <div>Medicaid Mix: <span className="font-mono">{customer.medicaidMixPct}%</span></div>
          <div>Volume Share: <span className="font-mono">{customer.volumePctOfChannel}%</span></div>
          {customer.notes && <div className="text-[#9296B2] italic mt-2">{customer.notes}</div>}
        </div>
      </div>

      {/* Middle: Waterfall */}
      <div>
        <div className="text-xs font-bold text-[#004567] mb-2">Revenue Waterfall — {selectedYear}</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={wfData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v: number) => `$${v.toFixed(1)}M`} tick={{ fontSize: 9 }} domain={[0, 'auto']} />
            <Tooltip formatter={(v: unknown) => { const a = v as [number, number]; return [`$${Math.abs(a[1] - a[0]).toFixed(2)}M`]; }} contentStyle={{ fontSize: 10 }} />
            <Bar dataKey="range">
              {wfData.map((e, i) => <Cell key={i} fill={e.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Right: Multi-year trend */}
      <div>
        <div className="text-xs font-bold text-[#004567] mb-2">Multi-Year Trend</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={yearData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECEC" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => `$${v.toFixed(1)}M`} tick={{ fontSize: 9 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 9 }} />
            <Tooltip contentStyle={{ fontSize: 10 }} />
            <Line yAxisId="left" dataKey="netRevenue" name="Net $M" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" dataKey="gtnPct" name="GTN%" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Channel Coverage Summary ──────────────────────────────────────────────

function ChannelCoverageSummary({ selectedYear }: { selectedYear: number }) {
  const customerList = useStore(s => s.customerList);
  const { annualData, forecastYears } = useComputedData();
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const activeChannels = useStore(s => s.activeChannels);

  const yrIdx = forecastYears.indexOf(selectedYear);
  if (yrIdx < 0 || !annualData[yrIdx]) return null;

  const annual = annualData[yrIdx];
  const fc = forecast[yrIdx];
  const ca = channelAllocations[yrIdx];

  const channelData = activeChannels.map(ch => {
    const channelPct = (ca?.allocations[ch] ?? 0) / 100;
    const channelGross = annual.units * channelPct * (fc?.wacPerUnit ?? 0);
    const customers = customerList.filter(c => c.channelType === ch);
    const assignedPct = customers.reduce((s, c) => s + c.volumePctOfChannel, 0);
    const unassigned = Math.max(0, 100 - assignedPct);
    return { channel: ch, gross: channelGross, customerCount: customers.length, assignedPct, unassigned };
  }).filter(d => d.gross > 0);

  return (
    <Accordion title="Channel-Level Customer Coverage" summary={`${selectedYear} · ${channelData.length} active channels`} defaultOpen={true}>
      <div className="overflow-auto rounded-lg border border-[#EAECEC]">
        <table className="w-full text-xs">
          <thead><tr className="bg-[#004567] text-white">
            <th className="px-3 py-2 text-left">Channel</th>
            <th className="px-3 py-2 text-right">Gross ($M)</th>
            <th className="px-3 py-2 text-center">Customers</th>
            <th className="px-3 py-2 text-right">Assigned %</th>
            <th className="px-3 py-2 text-right">Unassigned %</th>
          </tr></thead>
          <tbody>
            {channelData.map((d, i) => (
              <tr key={d.channel} className={i % 2 ? 'bg-[#EAECEC]/30' : 'bg-white'}>
                <td className="px-3 py-1.5 font-semibold text-[#004567]">{d.channel}</td>
                <td className="px-3 py-1.5 font-mono text-right">{fmtM(d.gross)}</td>
                <td className="px-3 py-1.5 text-center">{d.customerCount}</td>
                <td className="px-3 py-1.5 font-mono text-right">{d.assignedPct.toFixed(1)}%</td>
                <td className={`px-3 py-1.5 font-mono text-right ${d.unassigned > 0 ? 'text-amber-600 font-bold' : 'text-green-600'}`}>
                  {d.unassigned.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {channelData.some(d => d.unassigned > 0) && (
        <p className="text-[10px] text-amber-600 mt-2">
          ⚠ Some channels have unassigned volume. Named customers do not cover 100% of channel volume.
        </p>
      )}
    </Accordion>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function CustomerForecastPage() {
  const { annualData, forecastYears } = useComputedData();
  const [selectedYear, setSelectedYear] = useState(forecastYears[0] ?? 2025);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const hasResults = annualData.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#004567]">Customer-Level Forecast</h2>
        {forecastYears.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#44546A]">Year:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="border border-[#EAECEC] rounded px-3 py-1.5 text-sm font-mono focus:ring-1 focus:ring-[#004567] outline-none">
              {forecastYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {!hasResults && (
        <div className="bg-[#FFF9EE] border border-[#C98B27] rounded-lg p-4 text-sm text-[#004567]">
          Run the GTN engine in Results to see customer-level revenue estimates.
          Customer deal terms are available to configure now.
        </div>
      )}

      <SectionHeader>Customer Summary</SectionHeader>
      <CustomerTable selectedYear={selectedYear} onSelectCustomer={setSelectedCustomerId} selectedCustomerId={selectedCustomerId} />

      {selectedCustomerId !== null && (
        <CustomerDrillDown customerId={selectedCustomerId} selectedYear={selectedYear} />
      )}

      {hasResults && <ChannelCoverageSummary selectedYear={selectedYear} />}
    </div>
  );
}
