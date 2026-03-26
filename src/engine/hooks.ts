import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { expandToMonthly, computeASPSeries, computeGTN, annualRollup } from './compute';
import type { MonthlyRow, ASPRow, GTNRow, AnnualGTN } from '../types';

export function useComputedData() {
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const discounts = useStore(s => s.discounts);
  const rebates = useStore(s => s.rebates);
  const otherRates = useStore(s => s.otherRates);

  return useMemo(() => {
    const channelAllocByYear: Record<number, Record<string, number>> = {};
    for (const ca of channelAllocations) {
      channelAllocByYear[ca.year] = ca.allocations;
    }

    const discountByYear: Record<number, { gpo: number; idn: number; b340: number; va: number }> = {};
    for (const d of discounts) {
      discountByYear[d.year] = { gpo: d.gpo, idn: d.idn, b340: d.b340, va: d.va };
    }

    const rebateByYear: Record<number, { comPbm: number; comMed: number; mcrD: number; mcaid: number; manMcaid: number }> = {};
    for (const r of rebates) {
      rebateByYear[r.year] = { comPbm: r.comPbm, comMed: r.comMed, mcrD: r.mcrD, mcaid: r.mcaid, manMcaid: r.manMcaid };
    }

    const otherByYear: Record<number, { adminFee: number; distFee: number; copay: number; returns: number }> = {};
    for (const o of otherRates) {
      otherByYear[o.year] = { adminFee: o.adminFee, distFee: o.distFee, copay: o.copay, returns: o.returns };
    }

    const monthly: MonthlyRow[] = expandToMonthly(forecast);
    const aspData: ASPRow[] = computeASPSeries(monthly, channelAllocByYear, discountByYear);
    const gtnData: GTNRow[] = computeGTN(monthly, aspData, channelAllocByYear, discountByYear, rebateByYear, otherByYear);
    const annualData: AnnualGTN[] = annualRollup(gtnData);

    const forecastYears = forecast.map(f => f.year);

    return {
      monthly,
      aspData,
      gtnData,
      annualData,
      channelAllocByYear,
      discountByYear,
      rebateByYear,
      otherByYear,
      forecastYears,
    };
  }, [forecast, channelAllocations, discounts, rebates, otherRates]);
}
