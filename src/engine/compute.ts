import { CHANNELS, ASP_ELIGIBLE, MONTHS, MONTH_PROFILES } from './constants';
import type {
  ForecastRow, MonthlyRow, ASPRow, GTNRow, AnnualGTN,
  DiscountRates, RebateRates, OtherRates, IRAConfig, IRAResult,
} from '../types';

export function getMonthlyWeights(profileName: string): number[] {
  const w = MONTH_PROFILES[profileName] ?? MONTH_PROFILES['Flat'];
  const s = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / s);
}

export function expandToMonthly(forecast: ForecastRow[]): MonthlyRow[] {
  const rows: MonthlyRow[] = [];
  for (const row of forecast) {
    const w = getMonthlyWeights(row.monthlyProfile);
    for (let m = 0; m < 12; m++) {
      rows.push({
        year: row.year,
        month: MONTHS[m],
        monthIdx: m + 1,
        period: `${row.year}-${MONTHS[m]}`,
        units: row.annualUnits * w[m],
        wac: row.wacPerUnit,
        amp: row.ampPerUnit,
      });
    }
  }
  return rows;
}

export function computeASPSeries(
  monthly: MonthlyRow[],
  channelAllocByYear: Record<number, Record<string, number>>,
  discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }>,
): ASPRow[] {
  const records: ASPRow[] = [];

  for (const row of monthly) {
    const yr = row.year;
    const wac = row.wac;
    const alloc = channelAllocByYear[yr] ?? channelAllocByYear[Math.min(...Object.keys(channelAllocByYear).map(Number))];
    const disc = discountByYear[yr] ?? discountByYear[Math.min(...Object.keys(discountByYear).map(Number))];

    const amp = row.amp;
    const gpoP = wac * (1 - disc.gpo / 100);
    const idnP = wac * (1 - disc.idn / 100);
    const vaP = wac * (1 - disc.va / 100);
    // 340B ceiling price = AMP - URA; for biosimilars (351(k)): URA = AMP * 0.13
    // Use the LOWER of AMP-based ceiling and WAC-based discount
    const b340CeilingFromAMP = amp * 0.87;
    const b340P = Math.min(b340CeilingFromAMP, wac * (1 - disc.b340 / 100));

    // Selling prices per channel for ASP calculation (manufacturer transaction price)
    const chPrices: Record<string, number> = {
      'Commercial PBM': wac,           // WAC invoiced; rebates are post-sale, excluded from ASP
      'Commercial Medical': gpoP,      // GPO/contract price to provider
      // Medicare Part B: provider purchases at GPO/IDN contract price; CMS reimburses provider at ASP+6%
      // The ASP-relevant price is the manufacturer's transaction price to provider, approximated here as GPO price
      'Medicare Part B': gpoP,
      'Medicare Part D': wac,           // WAC invoiced; Part D rebates are post-sale
      // Medicaid: invoiced at WAC; statutory rebates are post-sale and excluded from ASP selling price per 42 CFR 414.804(a)(3)
      'Medicaid FFS': wac,
      'Managed Medicaid': wac,
      'GPO/IDN Non-340B': idnP,        // IDN contract price
      'GPO/IDN 340B': b340P,           // 340B ceiling price (excluded from ASP)
      'VA/DoD/Federal': vaP,           // FSS price (excluded from ASP)
      'Cash/Uninsured': wac,
    };

    let totalRev = 0;
    let totalUnits = 0;
    for (const ch of CHANNELS) {
      if (!ASP_ELIGIBLE[ch]) continue;
      const pct = (alloc[ch] ?? 0) / 100;
      const u = row.units * pct;
      totalRev += u * chPrices[ch];
      totalUnits += u;
    }

    const monthlyASP = totalUnits > 0 ? totalRev / totalUnits : wac;
    records.push({
      period: row.period,
      year: yr,
      month: row.month,
      monthIdx: row.monthIdx,
      totalUnits: row.units,
      eligibleUnits: totalUnits,
      monthlyRevASP: totalRev,
      monthlyASP,
      wac,
      rollingASP6M: 0,
      aspPlus6: 0,
    });
  }

  // 6-month rolling weighted average
  for (let i = 0; i < records.length; i++) {
    const start = Math.max(0, i - 5);
    let num = 0;
    let denom = 0;
    for (let j = start; j <= i; j++) {
      num += records[j].monthlyRevASP;
      denom += records[j].eligibleUnits;
    }
    records[i].rollingASP6M = denom > 0 ? num / denom : records[i].monthlyASP;
    records[i].aspPlus6 = records[i].rollingASP6M * 1.06;
  }

  return records;
}

export function computeGTN(
  monthly: MonthlyRow[],
  aspData: ASPRow[],
  channelAllocByYear: Record<number, Record<string, number>>,
  discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }>,
  rebateByYear: Record<number, { comPbm: number; comMed: number; mcrD: number; mcaid: number; manMcaid: number }>,
  otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number; specialtyPharmFee: number; papCost: number }>,
): GTNRow[] {
  const aspLookup = new Map(aspData.map(r => [r.period, r.rollingASP6M]));
  const aspPlusLookup = new Map(aspData.map(r => [r.period, r.aspPlus6]));
  const rows: GTNRow[] = [];

  for (const row of monthly) {
    const yr = row.year;
    const period = row.period;
    const wac = row.wac;
    const units = row.units;
    const alloc = channelAllocByYear[yr] ?? channelAllocByYear[Math.min(...Object.keys(channelAllocByYear).map(Number))];
    const disc = discountByYear[yr] ?? discountByYear[Math.min(...Object.keys(discountByYear).map(Number))];
    const rebate = rebateByYear[yr] ?? rebateByYear[Math.min(...Object.keys(rebateByYear).map(Number))];
    const other = otherByYear[yr] ?? otherByYear[Math.min(...Object.keys(otherByYear).map(Number))];

    const amp = row.amp;
    const gpoP = wac * (1 - disc.gpo / 100);
    const idnP = wac * (1 - disc.idn / 100);
    const vaP = wac * (1 - disc.va / 100);
    // 340B ceiling: AMP-based for biosimilars (351(k)): URA = AMP * 0.13, ceiling = AMP * 0.87
    const b340CeilingFromAMP = amp * 0.87;
    const b340P = Math.min(b340CeilingFromAMP, wac * (1 - disc.b340 / 100));

    const grossSales = units * wac;
    const chU: Record<string, number> = {};
    for (const ch of CHANNELS) chU[ch] = units * (alloc[ch] ?? 0) / 100;

    // Best Price: lowest non-exempt transaction price
    const nonExemptPrices = [wac, gpoP, idnP].filter(p => p > 0);
    const bestPrice = Math.min(...nonExemptPrices);

    // Medicaid rebate floor enforcement:
    // Statutory rebate = max(mcaid% of AMP, AMP - Best Price)
    const statutoryRebatePct = rebate.mcaid / 100;
    const ampBasedRebate = amp * statutoryRebatePct;
    const bestPriceRebate = amp - bestPrice;
    const effectiveMcaidRebatePerUnit = Math.max(ampBasedRebate, bestPriceRebate);

    // Rebates
    const rebComPBM = chU['Commercial PBM'] * wac * (rebate.comPbm / 100);
    const rebComMed = chU['Commercial Medical'] * wac * (rebate.comMed / 100);
    const rebMcrD = chU['Medicare Part D'] * wac * (rebate.mcrD / 100);
    // Medicaid: use effective rebate (max of statutory floor vs Best Price-driven)
    const rebMcaid = chU['Medicaid FFS'] * effectiveMcaidRebatePerUnit;
    // Managed Medicaid: supplemental rebate ~15% above statutory floor
    const rebManMcaid = chU['Managed Medicaid'] * effectiveMcaidRebatePerUnit * 1.15;
    const totalRebates = rebComPBM + rebComMed + rebMcrD + rebMcaid + rebManMcaid;

    // Chargebacks
    const cbGPO = chU['GPO/IDN Non-340B'] * (wac - idnP);
    const cb340B = chU['GPO/IDN 340B'] * (wac - b340P);
    const cbVA = chU['VA/DoD/Federal'] * (wac - vaP);
    const totalChargebacks = cbGPO + cb340B + cbVA;

    // Other
    const adminFee = grossSales * (other.adminFee / 100);
    const distFee = grossSales * (other.distFee / 100);
    const copay = grossSales * (other.copay / 100);
    const returns = grossSales * (other.returns / 100);
    const specialtyPharmFee = grossSales * ((other.specialtyPharmFee ?? 0) / 100);
    const papCost = grossSales * ((other.papCost ?? 0) / 100);
    const totalOther = adminFee + distFee + copay + returns + specialtyPharmFee + papCost;

    const totalDeductions = totalRebates + totalChargebacks + totalOther;
    const netSales = grossSales - totalDeductions;

    const aspVal = aspLookup.get(period) ?? wac;
    const asp6Val = aspPlusLookup.get(period) ?? wac * 1.06;

    rows.push({
      period, year: yr, month: row.month,
      units, wac, grossSales,
      rebComPBM, rebComMed, rebMcrD, rebMcaid, rebManMcaid, totalRebates,
      cbGPO, cb340B, cbVA, totalChargebacks,
      adminFee, distFee, copay, returns, specialtyPharmFee, papCost, totalOther,
      totalDeductions, netSales,
      asp: aspVal, aspPlus6: asp6Val,
      idnPrice: idnP, b340Price: b340P,
      idnBelowASP: aspVal < idnP,
      b340BelowASP: aspVal < b340P,
      idnSpread: asp6Val - idnP,
      gtnPct: grossSales > 0 ? (totalDeductions / grossSales) * 100 : 0,
      bestPrice,
      effectiveMcaidRebate: effectiveMcaidRebatePerUnit,
    });
  }
  return rows;
}

export function annualRollup(gtnRows: GTNRow[]): AnnualGTN[] {
  const byYear = new Map<number, GTNRow[]>();
  for (const r of gtnRows) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year)!.push(r);
  }

  const result: AnnualGTN[] = [];
  for (const [year, rows] of byYear) {
    const grossSales = rows.reduce((s, r) => s + r.grossSales, 0);
    const totalRebates = rows.reduce((s, r) => s + r.totalRebates, 0);
    const totalChargebacks = rows.reduce((s, r) => s + r.totalChargebacks, 0);
    const totalOther = rows.reduce((s, r) => s + r.totalOther, 0);
    const totalDeductions = rows.reduce((s, r) => s + r.totalDeductions, 0);
    const netSales = rows.reduce((s, r) => s + r.netSales, 0);
    const units = rows.reduce((s, r) => s + r.units, 0);
    const gtnPct = rows.reduce((s, r) => s + r.gtnPct, 0) / rows.length;
    result.push({
      year, grossSales, totalRebates, totalChargebacks, totalOther,
      totalDeductions, netSales, units, gtnPct,
      netPrice: units > 0 ? netSales / units : 0,
      netPct: grossSales > 0 ? (netSales / grossSales) * 100 : 0,
      iraRebate: 0,
      totalDeductionsWithIRA: totalDeductions,
      netSalesAfterIRA: netSales,
    });
  }
  return result.sort((a, b) => a.year - b.year);
}

// ── IRA Inflation Rebate ─────────────────────────────────────────────────

export function computeIRARebate(
  gtnRows: GTNRow[],
  aspData: ASPRow[],
  iraConfig: IRAConfig,
  channelAllocByYear: Record<number, Record<string, number>>,
): IRAResult[] {
  if (!iraConfig.enabled || iraConfig.baselineASP <= 0) return [];

  const years = [...new Set(gtnRows.map(r => r.year))].sort();
  const results: IRAResult[] = [];

  for (const year of years) {
    const yearsFromBaseline = year - iraConfig.baselineYear;
    if (yearsFromBaseline <= 0) {
      results.push({ year, iraRebate: 0, inflationAllowedASP: iraConfig.baselineASP, actualASP: iraConfig.baselineASP, excessPerUnit: 0 });
      continue;
    }

    const inflationAllowedASP = iraConfig.baselineASP * Math.pow(1 + iraConfig.annualCPIU / 100, yearsFromBaseline);
    const yearASP = aspData.filter(a => a.year === year);
    const actualASP = yearASP.length > 0 ? yearASP.reduce((s, a) => s + a.rollingASP6M, 0) / yearASP.length : 0;
    const excessPerUnit = Math.max(0, actualASP - inflationAllowedASP);

    const alloc = channelAllocByYear[year] ?? {};
    const partBPct = (alloc['Medicare Part B'] ?? 0) / 100;
    const yearGTN = gtnRows.filter(r => r.year === year);
    const totalUnits = yearGTN.reduce((s, r) => s + r.units, 0);
    const partBUnits = totalUnits * partBPct;
    const iraRebate = excessPerUnit * partBUnits;

    results.push({ year, iraRebate, inflationAllowedASP, actualASP, excessPerUnit });
  }
  return results;
}

export function applyIRAToAnnual(annual: AnnualGTN[], iraResults: IRAResult[]): AnnualGTN[] {
  const iraMap = new Map(iraResults.map(r => [r.year, r.iraRebate]));
  return annual.map(a => {
    const ira = iraMap.get(a.year) ?? 0;
    return {
      ...a,
      iraRebate: ira,
      totalDeductionsWithIRA: a.totalDeductions + ira,
      netSalesAfterIRA: a.netSales - ira,
    };
  });
}

// Formatting helpers
export const fmtM = (v: number) => `$${(v / 1e6).toFixed(2)}M`;
export const fmtB = (v: number) => `$${(v / 1e9).toFixed(3)}B`;
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtU = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const fmtD = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtSales = (v: number) => v >= 1e9 ? fmtB(v) : fmtM(v);
