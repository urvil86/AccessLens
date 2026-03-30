export interface ForecastRow {
  year: number;
  annualUnits: number;
  wacPerUnit: number;
  ampPerUnit: number;  // Average Manufacturer Price — used for 340B ceiling & Medicaid rebate
  monthlyProfile: string;
}

export interface ChannelAllocation {
  year: number;
  allocations: Record<string, number>;
}

export interface DiscountRates {
  year: number;
  gpo: number;
  idn: number;
  b340: number;
  va: number;
}

export interface RebateRates {
  year: number;
  comPbm: number;
  comMed: number;
  mcrD: number;
  mcaid: number;
  manMcaid: number;
}

export interface OtherRates {
  year: number;
  adminFee: number;
  distFee: number;
  copay: number;
  returns: number;
  specialtyPharmFee: number;  // Specialty pharmacy handling/data fees
  papCost: number;            // Patient assistance program costs
}

export interface Customer {
  id: number;
  name: string;
  channelType: string;
  contractedRebatePct: number;
  medicaidMixPct: number;
  volumePctOfChannel: number;
  notes: string;
  idnDiscount?: number;
  is340b?: boolean;
}

export interface IDN {
  name: string;
  discount: number;
  volumePct: number;
  is340b: boolean;
}

export interface MonthlyRow {
  year: number;
  month: string;
  monthIdx: number;
  period: string;
  units: number;
  wac: number;
  amp: number;
}

export interface ASPRow {
  period: string;
  year: number;
  month: string;
  monthIdx: number;
  totalUnits: number;
  eligibleUnits: number;
  monthlyRevASP: number;
  monthlyASP: number;
  wac: number;
  rollingASP6M: number;
  aspPlus6: number;
}

export interface GTNRow {
  period: string;
  year: number;
  month: string;
  units: number;
  wac: number;
  grossSales: number;
  rebComPBM: number;
  rebComMed: number;
  rebMcrD: number;
  rebMcaid: number;
  rebManMcaid: number;
  totalRebates: number;
  cbGPO: number;
  cb340B: number;
  cbVA: number;
  totalChargebacks: number;
  adminFee: number;
  distFee: number;
  copay: number;
  returns: number;
  specialtyPharmFee: number;
  papCost: number;
  totalOther: number;
  totalDeductions: number;
  netSales: number;
  asp: number;
  aspPlus6: number;
  idnPrice: number;
  b340Price: number;
  idnBelowASP: boolean;
  b340BelowASP: boolean;
  idnSpread: number;
  gtnPct: number;
  bestPrice: number;
  effectiveMcaidRebate: number;
}

export interface AnnualGTN {
  year: number;
  grossSales: number;
  totalRebates: number;
  totalChargebacks: number;
  totalOther: number;
  totalDeductions: number;
  netSales: number;
  units: number;
  gtnPct: number;
  netPrice: number;
  netPct: number;
  iraRebate: number;
  totalDeductionsWithIRA: number;
  netSalesAfterIRA: number;
}

export interface IRAConfig {
  enabled: boolean;
  baselineASP: number;     // ASP in benchmark quarter (typically launch)
  baselineYear: number;
  annualCPIU: number;      // e.g. 3.0 for 3%
}

export interface IRAResult {
  year: number;
  iraRebate: number;
  inflationAllowedASP: number;
  actualASP: number;
  excessPerUnit: number;
}

export interface ReferenceProduct {
  name: string;
  wacPerUnit: number[];          // RP WAC per year (aligned to forecast years)
  totalMarketUnits: number[];    // Total market size in units per year
  isInterchangeable: boolean;    // Interchangeable designation (pharmacy substitution)
}

export interface AdoptionConfig {
  enabled: boolean;
  mode: 'manual' | 'adoption-curve';
  launchMonth: number;               // 1-12
  peakSharePct: number;              // target peak biosimilar share of RP market
  timeToSteadyStateYears: number;
  switchRatePctPerMonth: number;     // % of remaining RP patients switching per month
  newPatientCapturePct: number;      // % of new-to-therapy patients starting on biosimilar
  interchangeableUplift: number;     // multiplier on switch rate if interchangeable
}

export type BenefitType = 'buy-and-bill' | 'pharmacy-benefit';

export interface ScenarioSnapshot {
  forecast: ForecastRow[];
  channelAllocations: ChannelAllocation[];
  discounts: DiscountRates[];
  rebates: RebateRates[];
  otherRates: OtherRates[];
  idnList: IDN[];
  activeChannels: string[];
  productName: string;
  therapyArea: string;
  benefitType: BenefitType;
  iraConfig: IRAConfig;
  referenceProduct: ReferenceProduct;
  adoptionConfig: AdoptionConfig;
  nYears: number;
  startYear: number;
}

export interface ScenarioHistoryEntry {
  version: number;
  savedAt: string;
  changesSummary: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  lastModified: string;
  version: number;
  locked: boolean;
  snapshot: ScenarioSnapshot;
  history: ScenarioHistoryEntry[];
}

export type TabId = 'dashboard' | 'assumptions' | 'results' | 'scenarios';
