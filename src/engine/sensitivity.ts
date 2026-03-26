import { CHANNELS } from './constants';
import { expandToMonthly, computeASPSeries, computeGTN, annualRollup, computeIRARebate, applyIRAToAnnual } from './compute';
import type {
  ForecastRow, ChannelAllocation, DiscountRates, RebateRates, OtherRates, IDN,
  MonthlyRow, ASPRow, AnnualGTN, ReferenceProduct, IRAConfig,
} from '../types';

// ── Types ────────────────────────────────────────────────────────────────

export type TargetMetric = 'netSales' | 'gtnPct' | 'asp' | 'netPricePerUnit';

export interface TornadoResult {
  inputName: string;
  lowValue: number;
  highValue: number;
  baseValue: number;
  impact: number; // highValue - lowValue
}

export interface TwoWayResult {
  rowLabels: number[];
  colLabels: number[];
  values: number[][];
}

export interface StressParams {
  gpoDisc: number;
  idnDisc: number;
  b340Mix: number;
  gpoMix: number;
  pbmMix: number;
  wacPct: number;
}

export interface RescueParams {
  gpoDisc: number;
  idnDisc: number;
  pbmMix: number;
  mcrBMix: number;
  gpoMix: number;
}

export interface BaseAssumptions {
  forecast: ForecastRow[];
  channelAllocations: ChannelAllocation[];
  discounts: DiscountRates[];
  rebates: RebateRates[];
  otherRates: OtherRates[];
  idnList: IDN[];
  activeChannels: string[];
  referenceProduct?: ReferenceProduct;
  iraConfig?: IRAConfig;
}

// ── Pipeline helpers ─────────────────────────────────────────────────────

function buildDicts(assumptions: BaseAssumptions) {
  const channelAllocByYear: Record<number, Record<string, number>> = {};
  for (const ca of assumptions.channelAllocations) channelAllocByYear[ca.year] = ca.allocations;

  const discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
  for (const d of assumptions.discounts) discountByYear[d.year] = { gpo: d.gpo, idn: d.idn, b340: d.b340, va: d.va };

  const rebateByYear: Record<number, { comPbm: number; comMed: number; mcrD: number; mcaid: number; manMcaid: number }> = {};
  for (const r of assumptions.rebates) rebateByYear[r.year] = { comPbm: r.comPbm, comMed: r.comMed, mcrD: r.mcrD, mcaid: r.mcaid, manMcaid: r.manMcaid };

  const otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number; specialtyPharmFee: number; papCost: number }> = {};
  for (const o of assumptions.otherRates) otherByYear[o.year] = { adminFee: o.adminFee, distFee: o.distFee, copay: o.copay, returns: o.returns, specialtyPharmFee: o.specialtyPharmFee ?? 0, papCost: o.papCost ?? 0 };

  return { channelAllocByYear, discountByYear, rebateByYear, otherByYear };
}

function runPipeline(assumptions: BaseAssumptions): { annual: AnnualGTN[]; aspData: ASPRow[] } {
  const { channelAllocByYear, discountByYear, rebateByYear, otherByYear } = buildDicts(assumptions);
  const monthly = expandToMonthly(assumptions.forecast);
  const aspData = computeASPSeries(monthly, channelAllocByYear, discountByYear);
  const gtnData = computeGTN(monthly, aspData, channelAllocByYear, discountByYear, rebateByYear, otherByYear);
  let annual = annualRollup(gtnData);

  // Apply IRA if configured
  if (assumptions.iraConfig?.enabled) {
    const effectiveIRA = {
      ...assumptions.iraConfig,
      baselineASP: assumptions.iraConfig.baselineASP > 0 ? assumptions.iraConfig.baselineASP
        : (aspData.length > 0 ? aspData.filter(a => a.year === assumptions.forecast[0]?.year).reduce((s, a) => s + a.rollingASP6M, 0) / Math.max(1, aspData.filter(a => a.year === assumptions.forecast[0]?.year).length) : 0),
    };
    const iraResults = computeIRARebate(gtnData, aspData, effectiveIRA, channelAllocByYear);
    annual = applyIRAToAnnual(annual, iraResults);
  }

  return { annual, aspData };
}

function extractMetric(annual: AnnualGTN[], aspData: ASPRow[], metric: TargetMetric, targetYear?: number): number {
  const filtered = targetYear ? annual.filter(a => a.year === targetYear) : annual;
  switch (metric) {
    case 'netSales': return filtered.reduce((s, a) => s + a.netSales, 0);
    case 'gtnPct': return filtered.length > 0 ? filtered.reduce((s, a) => s + a.gtnPct, 0) / filtered.length : 0;
    case 'asp': {
      const aspFiltered = targetYear ? aspData.filter(a => a.year === targetYear) : aspData;
      return aspFiltered.length > 0 ? aspFiltered.reduce((s, a) => s + a.rollingASP6M, 0) / aspFiltered.length : 0;
    }
    case 'netPricePerUnit': {
      const totalNet = filtered.reduce((s, a) => s + a.netSales, 0);
      const totalUnits = filtered.reduce((s, a) => s + a.units, 0);
      return totalUnits > 0 ? totalNet / totalUnits : 0;
    }
  }
}

// ── Tornado (One-Way Sensitivity) ────────────────────────────────────────

interface InputVar {
  name: string;
  apply: (base: BaseAssumptions, delta: number) => BaseAssumptions;
}

function cloneAssumptions(a: BaseAssumptions): BaseAssumptions {
  return JSON.parse(JSON.stringify(a));
}

function getInputVars(benefitType?: 'buy-and-bill' | 'pharmacy-benefit'): InputVar[] {
  const vars: InputVar[] = [];

  // WAC
  vars.push({
    name: 'WAC per Unit',
    apply: (base, delta) => {
      const a = cloneAssumptions(base);
      a.forecast = a.forecast.map(f => ({ ...f, wacPerUnit: f.wacPerUnit * (1 + delta / 100) }));
      return a;
    },
  });

  // Rebates
  const rebateFields: { key: keyof Omit<RebateRates, 'year'>; label: string }[] = [
    { key: 'comPbm', label: 'Com PBM Rebate' },
    { key: 'comMed', label: 'Com Med Rebate' },
    { key: 'mcrD', label: 'Mcr Part D Rebate' },
    { key: 'mcaid', label: 'Medicaid FFS Rebate' },
    { key: 'manMcaid', label: 'Managed Mcaid Rebate' },
  ];
  for (const rf of rebateFields) {
    vars.push({
      name: rf.label,
      apply: (base, delta) => {
        const a = cloneAssumptions(base);
        a.rebates = a.rebates.map(r => ({ ...r, [rf.key]: Math.max(0, Math.min(100, (r[rf.key] as number) * (1 + delta / 100))) }));
        return a;
      },
    });
  }

  // Discounts
  const discFields: { key: keyof Omit<DiscountRates, 'year'>; label: string }[] = [
    { key: 'gpo', label: 'GPO Discount' },
    { key: 'idn', label: 'IDN Discount' },
    { key: 'b340', label: '340B Discount' },
    { key: 'va', label: 'VA FSS Discount' },
  ];
  for (const df of discFields) {
    vars.push({
      name: df.label,
      apply: (base, delta) => {
        const a = cloneAssumptions(base);
        a.discounts = a.discounts.map(d => ({ ...d, [df.key]: Math.max(0, Math.min(99, (d[df.key] as number) * (1 + delta / 100))) }));
        return a;
      },
    });
  }

  // Fees
  const feeFields: { key: keyof Omit<OtherRates, 'year'>; label: string }[] = [
    { key: 'adminFee', label: 'Admin Fee' },
    { key: 'distFee', label: 'Dist Fee' },
    { key: 'copay', label: 'Copay Support' },
    { key: 'returns', label: 'Returns' },
  ];
  for (const ff of feeFields) {
    vars.push({
      name: ff.label,
      apply: (base, delta) => {
        const a = cloneAssumptions(base);
        a.otherRates = a.otherRates.map(o => ({ ...o, [ff.key]: Math.max(0, (o[ff.key] as number) * (1 + delta / 100)) }));
        return a;
      },
    });
  }

  // Top channel allocations
  const topChannels = ['Commercial PBM', 'Commercial Medical', 'Medicare Part B', 'Medicare Part D', 'GPO/IDN Non-340B'];
  for (const ch of topChannels) {
    vars.push({
      name: `${ch} Mix`,
      apply: (base, delta) => {
        const a = cloneAssumptions(base);
        a.channelAllocations = a.channelAllocations.map(ca => {
          const alloc = { ...ca.allocations };
          const oldVal = alloc[ch] ?? 0;
          const newVal = Math.max(0, Math.min(100, oldVal * (1 + delta / 100)));
          const diff = newVal - oldVal;
          alloc[ch] = newVal;
          // Redistribute the difference proportionally across other channels
          const others = Object.keys(alloc).filter(k => k !== ch);
          const othersSum = others.reduce((s, k) => s + alloc[k], 0);
          if (othersSum > 0) {
            for (const k of others) {
              alloc[k] = Math.max(0, alloc[k] - diff * (alloc[k] / othersSum));
            }
          }
          return { ...ca, allocations: alloc };
        });
        return a;
      },
    });
  }

  // AMP per Unit
  vars.push({
    name: 'AMP per Unit',
    apply: (base, delta) => {
      const a = cloneAssumptions(base);
      a.forecast = a.forecast.map(f => ({ ...f, ampPerUnit: f.ampPerUnit * (1 + delta / 100) }));
      return a;
    },
  });

  // Specialty Pharmacy Fee
  vars.push({
    name: 'Specialty Pharm Fee',
    apply: (base, delta) => {
      const a = cloneAssumptions(base);
      a.otherRates = a.otherRates.map(o => ({ ...o, specialtyPharmFee: Math.max(0, (o.specialtyPharmFee ?? 0) * (1 + delta / 100)) }));
      return a;
    },
  });

  // PAP Cost
  vars.push({
    name: 'PAP / Copay Assist',
    apply: (base, delta) => {
      const a = cloneAssumptions(base);
      a.otherRates = a.otherRates.map(o => ({ ...o, papCost: Math.max(0, (o.papCost ?? 0) * (1 + delta / 100)) }));
      return a;
    },
  });

  // Forecast Volume
  vars.push({
    name: 'Forecast Volume',
    apply: (base, delta) => {
      const a = cloneAssumptions(base);
      a.forecast = a.forecast.map(f => ({ ...f, annualUnits: Math.max(0, Math.round(f.annualUnits * (1 + delta / 100))) }));
      return a;
    },
  });

  // Filter by benefit type if specified
  if (benefitType) {
    const bnbNames = new Set(['GPO Discount', 'IDN Discount', '340B Discount', 'VA FSS Discount',
      'Commercial PBM Mix', 'Medicare Part B Mix', 'GPO/IDN Non-340B Mix']);
    const pbxNames = new Set(['Com PBM Rebate', 'Com Med Rebate', 'Mcr Part D Rebate',
      'Managed Mcaid Rebate', 'Medicaid FFS Rebate', 'Specialty Pharm Fee', 'PAP / Copay Assist',
      'Commercial PBM Mix', 'Medicare Part D Mix']);
    const commonNames = new Set(['WAC per Unit', 'AMP per Unit', 'Forecast Volume',
      'Admin Fee', 'Dist Fee', 'Returns']);
    const allowed = benefitType === 'buy-and-bill'
      ? new Set([...commonNames, ...bnbNames])
      : new Set([...commonNames, ...pbxNames]);
    return vars.filter(v => allowed.has(v.name));
  }

  return vars;
}

// ── Rebate Stress Test (Pharmacy Benefit) ────────────────────────────────

export interface RebateStressParams {
  pbmRebate: number;
  partDRebate: number;
  manMcaidRebate: number;
  specPharmFee: number;
  papCost: number;
  pbmMix: number;
}

export function runRebateStressTest(
  baseAssumptions: BaseAssumptions,
  params: RebateStressParams,
): { annual: AnnualGTN[] } {
  const a = cloneAssumptions(baseAssumptions);
  // Override rebates
  a.rebates = a.rebates.map(r => ({
    ...r,
    comPbm: params.pbmRebate,
    mcrD: params.partDRebate,
    manMcaid: params.manMcaidRebate,
  }));
  // Override fees
  a.otherRates = a.otherRates.map(o => ({
    ...o,
    specialtyPharmFee: params.specPharmFee,
    papCost: params.papCost,
  }));
  // Override PBM mix — redistribute remaining proportionally
  a.channelAllocations = a.channelAllocations.map(ca => {
    const alloc = { ...ca.allocations };
    const oldPbm = alloc['Commercial PBM'] ?? 0;
    alloc['Commercial PBM'] = params.pbmMix;
    const diff = params.pbmMix - oldPbm;
    const others = Object.keys(alloc).filter(k => k !== 'Commercial PBM');
    const othersSum = others.reduce((s, k) => s + alloc[k], 0);
    if (othersSum > 0) {
      for (const k of others) alloc[k] = Math.max(0, alloc[k] - diff * (alloc[k] / othersSum));
    }
    return { ...ca, allocations: alloc };
  });
  const { annual } = runPipeline(a);
  return { annual };
}

export function runTornado(
  base: BaseAssumptions,
  targetMetric: TargetMetric,
  variationPct: number,
  targetYear?: number,
  benefitType?: 'buy-and-bill' | 'pharmacy-benefit',
): TornadoResult[] {
  const { annual: baseAnnual, aspData: baseASP } = runPipeline(base);
  const baseValue = extractMetric(baseAnnual, baseASP, targetMetric, targetYear);
  const vars = getInputVars(benefitType);
  const results: TornadoResult[] = [];

  for (const v of vars) {
    const lowAssumptions = v.apply(base, -variationPct);
    const highAssumptions = v.apply(base, variationPct);
    const { annual: lowAnnual, aspData: lowASP } = runPipeline(lowAssumptions);
    const { annual: highAnnual, aspData: highASP } = runPipeline(highAssumptions);
    const lowValue = extractMetric(lowAnnual, lowASP, targetMetric, targetYear);
    const highValue = extractMetric(highAnnual, highASP, targetMetric, targetYear);
    results.push({
      inputName: v.name,
      lowValue,
      highValue,
      baseValue,
      impact: Math.abs(highValue - lowValue),
    });
  }

  return results.sort((a, b) => b.impact - a.impact);
}

// ── Two-Way Sensitivity ──────────────────────────────────────────────────

export interface VarConfig {
  name: string;
  key: string;
  min: number;
  max: number;
  steps: number;
}

export function runTwoWay(
  base: BaseAssumptions,
  var1: VarConfig,
  var2: VarConfig,
  targetMetric: TargetMetric,
  targetYear?: number,
): TwoWayResult {
  const vars = getInputVars();
  const v1Fn = vars.find(v => v.name === var1.name);
  const v2Fn = vars.find(v => v.name === var2.name);
  if (!v1Fn || !v2Fn) return { rowLabels: [], colLabels: [], values: [] };

  const rowLabels: number[] = [];
  const colLabels: number[] = [];
  for (let i = 0; i <= var1.steps; i++) rowLabels.push(var1.min + (var1.max - var1.min) * (i / var1.steps));
  for (let i = 0; i <= var2.steps; i++) colLabels.push(var2.min + (var2.max - var2.min) * (i / var2.steps));

  const values: number[][] = [];
  for (const r of rowLabels) {
    const row: number[] = [];
    for (const c of colLabels) {
      // Apply var1 as absolute delta from base (treat as % variation from 0)
      const a1 = v1Fn.apply(base, r);
      const a2 = v2Fn.apply(a1, c);
      const { annual, aspData } = runPipeline(a2);
      row.push(extractMetric(annual, aspData, targetMetric, targetYear));
    }
    values.push(row);
  }

  return { rowLabels, colLabels, values };
}

// ── ASP Stress Test ──────────────────────────────────────────────────────

export function runStressTest(
  monthly: MonthlyRow[],
  forecastYears: number[],
  channelAllocByYear: Record<number, Record<string, number>>,
  discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }>,
  params: StressParams,
): ASPRow[] {
  const wacMult = params.wacPct / 100;
  const stressedMonthly = monthly.map(r => ({ ...r, wac: r.wac * wacMult, amp: r.amp * wacMult }));

  const stressedAllocByYear: Record<number, Record<string, number>> = {};
  for (const yr of forecastYears) {
    const baseAlloc = channelAllocByYear[yr] ?? {};
    const modified: Record<string, number> = { ...baseAlloc };
    modified['GPO/IDN 340B'] = params.b340Mix;
    modified['GPO/IDN Non-340B'] = params.gpoMix;
    modified['Commercial PBM'] = params.pbmMix;
    const pinned = params.b340Mix + params.gpoMix + params.pbmMix;
    const otherChannels = CHANNELS.filter(ch => ch !== 'GPO/IDN 340B' && ch !== 'GPO/IDN Non-340B' && ch !== 'Commercial PBM');
    const otherSum = otherChannels.reduce((s, ch) => s + (baseAlloc[ch] ?? 0), 0);
    const remaining = Math.max(0, 100 - pinned);
    for (const ch of otherChannels) {
      modified[ch] = otherSum > 0 ? ((baseAlloc[ch] ?? 0) / otherSum) * remaining : remaining / otherChannels.length;
    }
    stressedAllocByYear[yr] = modified;
  }

  const stressedDiscByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
  for (const yr of forecastYears) {
    const baseDisc = discountByYear[yr] ?? { gpo: 14, idn: 20, b340: 25.6, va: 24 };
    stressedDiscByYear[yr] = { gpo: params.gpoDisc, idn: params.idnDisc, b340: baseDisc.b340, va: baseDisc.va };
  }

  return computeASPSeries(stressedMonthly, stressedAllocByYear, stressedDiscByYear);
}

// ── ASP Rescue Simulator ─────────────────────────────────────────────────

export function runRescueSimulator(
  monthly: MonthlyRow[],
  forecastYears: number[],
  channelAllocByYear: Record<number, Record<string, number>>,
  discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }>,
  params: RescueParams,
): ASPRow[] {
  const rescuedAllocByYear: Record<number, Record<string, number>> = {};
  for (const yr of forecastYears) {
    const baseAlloc = channelAllocByYear[yr] ?? {};
    const modified: Record<string, number> = { ...baseAlloc };
    modified['Commercial PBM'] = params.pbmMix;
    modified['Medicare Part B'] = params.mcrBMix;
    modified['GPO/IDN Non-340B'] = params.gpoMix;
    const pinned = params.pbmMix + params.mcrBMix + params.gpoMix;
    const otherChannels = CHANNELS.filter(ch => ch !== 'Commercial PBM' && ch !== 'Medicare Part B' && ch !== 'GPO/IDN Non-340B');
    const otherSum = otherChannels.reduce((s, ch) => s + (baseAlloc[ch] ?? 0), 0);
    const remaining = Math.max(0, 100 - pinned);
    for (const ch of otherChannels) {
      modified[ch] = otherSum > 0 ? ((baseAlloc[ch] ?? 0) / otherSum) * remaining : remaining / otherChannels.length;
    }
    rescuedAllocByYear[yr] = modified;
  }

  const rescuedDiscByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
  for (const yr of forecastYears) {
    const baseDisc = discountByYear[yr] ?? { gpo: 14, idn: 20, b340: 25.6, va: 24 };
    rescuedDiscByYear[yr] = { gpo: params.gpoDisc, idn: params.idnDisc, b340: baseDisc.b340, va: baseDisc.va };
  }

  return computeASPSeries(monthly, rescuedAllocByYear, rescuedDiscByYear);
}
