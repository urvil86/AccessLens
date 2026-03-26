import type { ReferenceProduct, AdoptionConfig, ForecastRow } from '../types';

/**
 * Compute biosimilar adoption volumes from reference product market data.
 * Returns ForecastRow[] with computed annualUnits (WAC/AMP/profile set to 0 — caller merges).
 */
export function computeAdoptionVolumes(
  referenceProduct: ReferenceProduct,
  adoptionConfig: AdoptionConfig,
  forecastYears: number[],
): { annualUnits: number[]; monthlyDetail: { year: number; month: number; biosimilarUnits: number; rpRemaining: number }[] } {
  const annualUnits: number[] = [];
  const monthlyDetail: { year: number; month: number; biosimilarUnits: number; rpRemaining: number }[] = [];
  let cumulativeBiosimilarPatients = 0;

  for (let yIdx = 0; yIdx < forecastYears.length; yIdx++) {
    const year = forecastYears[yIdx];
    const rpMarketAnnual = referenceProduct.totalMarketUnits[yIdx] ?? 0;
    const rpMarketMonthly = rpMarketAnnual / 12;
    let yearUnits = 0;

    for (let m = 0; m < 12; m++) {
      // Before launch month in Year 1, zero volume
      if (yIdx === 0 && m + 1 < adoptionConfig.launchMonth) {
        monthlyDetail.push({ year, month: m + 1, biosimilarUnits: 0, rpRemaining: rpMarketMonthly });
        continue;
      }

      const maxBiosimilar = rpMarketMonthly * (adoptionConfig.peakSharePct / 100);
      const currentBiosimilarMonthly = Math.min(cumulativeBiosimilarPatients / 12, rpMarketMonthly);
      const remainingRP = rpMarketMonthly - currentBiosimilarMonthly;

      const effectiveSwitchRate = (adoptionConfig.switchRatePctPerMonth / 100)
        * (referenceProduct.isInterchangeable ? adoptionConfig.interchangeableUplift : 1);

      const newSwitches = remainingRP * effectiveSwitchRate;
      // ~5% monthly new-to-therapy patient inflow, biosimilar captures a portion
      const newPatients = (rpMarketMonthly * 0.05) * (adoptionConfig.newPatientCapturePct / 100);

      cumulativeBiosimilarPatients = Math.min(
        cumulativeBiosimilarPatients + newSwitches + newPatients,
        rpMarketAnnual * (adoptionConfig.peakSharePct / 100),
      );

      const monthUnits = Math.min(cumulativeBiosimilarPatients / 12, maxBiosimilar);
      yearUnits += monthUnits;

      monthlyDetail.push({
        year,
        month: m + 1,
        biosimilarUnits: Math.round(monthUnits),
        rpRemaining: Math.round(rpMarketMonthly - monthUnits),
      });
    }

    annualUnits.push(Math.round(yearUnits));
  }

  return { annualUnits, monthlyDetail };
}

/**
 * Merge adoption-computed volumes into existing forecast rows (preserving WAC, AMP, profile).
 */
export function mergeAdoptionIntoForecast(
  existingForecast: ForecastRow[],
  adoptionUnits: number[],
): ForecastRow[] {
  return existingForecast.map((f, i) => ({
    ...f,
    annualUnits: adoptionUnits[i] ?? f.annualUnits,
  }));
}
