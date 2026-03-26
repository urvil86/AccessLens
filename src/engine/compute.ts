import { CHANNELS, ASP_ELIGIBLE, MONTHS, MONTH_PROFILES } from './constants';
import type {
  ForecastRow, MonthlyRow, ASPRow, GTNRow, AnnualGTN,
  DiscountRates, RebateRates, OtherRates,
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

    const gpoP = wac * (1 - disc.gpo / 100);
    const idnP = wac * (1 - disc.idn / 100);
    const vaP = wac * (1 - disc.va / 100);
    const b340P = wac * (1 - disc.b340 / 100);

    const chPrices: Record<string, number> = {
      'Commercial PBM': wac,
      'Commercial Medical': gpoP,
      'Medicare Part B': gpoP,
      'Medicare Part D': wac,
      'Medicaid FFS': wac,
      'Managed Medicaid': wac,
      'GPO/IDN Non-340B': idnP,
      'GPO/IDN 340B': b340P,
      'VA/DoD/Federal': vaP,
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
  otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number }>,
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

    const idnP = wac * (1 - disc.idn / 100);
    const b340P = wac * (1 - disc.b340 / 100);
    const vaP = wac * (1 - disc.va / 100);

    const grossSales = units * wac;
    const chU: Record<string, number> = {};
    for (const ch of CHANNELS) chU[ch] = units * (alloc[ch] ?? 0) / 100;

    // Rebates
    const rebComPBM = chU['Commercial PBM'] * wac * (rebate.comPbm / 100);
    const rebComMed = chU['Commercial Medical'] * wac * (rebate.comMed / 100);
    const rebMcrD = chU['Medicare Part D'] * wac * (rebate.mcrD / 100);
    const rebMcaid = chU['Medicaid FFS'] * wac * (rebate.mcaid / 100);
    const rebManMcaid = chU['Managed Medicaid'] * wac * (rebate.manMcaid / 100);
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
    const totalOther = adminFee + distFee + copay + returns;

    const totalDeductions = totalRebates + totalChargebacks + totalOther;
    const netSales = grossSales - totalDeductions;

    const aspVal = aspLookup.get(period) ?? wac;
    const asp6Val = aspPlusLookup.get(period) ?? wac * 1.06;

    rows.push({
      period, year: yr, month: row.month,
      units, wac, grossSales,
      rebComPBM, rebComMed, rebMcrD, rebMcaid, rebManMcaid, totalRebates,
      cbGPO, cb340B, cbVA, totalChargebacks,
      adminFee, distFee, copay, returns, totalOther,
      totalDeductions, netSales,
      asp: aspVal, aspPlus6: asp6Val,
      idnPrice: idnP, b340Price: b340P,
      idnBelowASP: aspVal < idnP,
      b340BelowASP: aspVal < b340P,
      idnSpread: asp6Val - idnP,
      gtnPct: grossSales > 0 ? (totalDeductions / grossSales) * 100 : 0,
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
    });
  }
  return result.sort((a, b) => a.year - b.year);
}

// Formatting helpers
export const fmtM = (v: number) => `$${(v / 1e6).toFixed(2)}M`;
export const fmtB = (v: number) => `$${(v / 1e9).toFixed(3)}B`;
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtU = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const fmtD = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtSales = (v: number) => v >= 1e9 ? fmtB(v) : fmtM(v);
