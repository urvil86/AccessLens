export interface ForecastRow {
  year: number;
  annualUnits: number;
  wacPerUnit: number;
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
}

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
  adminRoute: string;
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
