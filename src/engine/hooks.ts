import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { expandToMonthly, computeASPSeries, computeGTN, annualRollup, computeIRARebate, applyIRAToAnnual } from './compute';
import { computeAdoptionVolumes, mergeAdoptionIntoForecast } from './adoption';
import type { MonthlyRow, ASPRow, GTNRow, AnnualGTN, IRAResult } from '../types';

export function useComputedData() {
  const forecast = useStore(s => s.forecast);
  const channelAllocations = useStore(s => s.channelAllocations);
  const discounts = useStore(s => s.discounts);
  const rebates = useStore(s => s.rebates);
  const otherRates = useStore(s => s.otherRates);
  const iraConfig = useStore(s => s.iraConfig);
  const adoptionConfig = useStore(s => s.adoptionConfig);
  const referenceProduct = useStore(s => s.referenceProduct);

  return useMemo(() => {
    const forecastYears = forecast.map(f => f.year);

    // Apply adoption model if enabled
    let effectiveForecast = forecast;
    let adoptionDetail: ReturnType<typeof computeAdoptionVolumes> | null = null;
    if (adoptionConfig.enabled && adoptionConfig.mode === 'adoption-curve') {
      adoptionDetail = computeAdoptionVolumes(referenceProduct, adoptionConfig, forecastYears);
      effectiveForecast = mergeAdoptionIntoForecast(forecast, adoptionDetail.annualUnits);
    }
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
      otherByYear[o.year] = { adminFee: o.adminFee, distFee: o.distFee, copay: o.copay, returns: o.returns, specialtyPharmFee: o.specialtyPharmFee ?? 0, papCost: o.papCost ?? 0 };
    }

    const monthly: MonthlyRow[] = expandToMonthly(effectiveForecast);
    const aspData: ASPRow[] = computeASPSeries(monthly, channelAllocByYear, discountByYear);
    const gtnData: GTNRow[] = computeGTN(monthly, aspData, channelAllocByYear, discountByYear, rebateByYear, otherByYear);
    const rawAnnual: AnnualGTN[] = annualRollup(gtnData);

    // IRA inflation rebate
    const effectiveIRAConfig = {
      ...iraConfig,
      baselineASP: iraConfig.baselineASP > 0 ? iraConfig.baselineASP
        : (aspData.length > 0 ? aspData.filter(a => a.year === effectiveForecast[0]?.year).reduce((s, a) => s + a.rollingASP6M, 0) / Math.max(1, aspData.filter(a => a.year === effectiveForecast[0]?.year).length) : 0),
    };
    const iraResults: IRAResult[] = computeIRARebate(gtnData, aspData, effectiveIRAConfig, channelAllocByYear);
    const annualData: AnnualGTN[] = applyIRAToAnnual(rawAnnual, iraResults);

    return {
      monthly,
      aspData,
      gtnData,
      annualData,
      iraResults,
      adoptionDetail,
      effectiveForecast,
      channelAllocByYear,
      discountByYear,
      rebateByYear,
      otherByYear,
      forecastYears,
    };
  }, [forecast, channelAllocations, discounts, rebates, otherRates, iraConfig, adoptionConfig, referenceProduct]);
}
