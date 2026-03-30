import { create } from 'zustand';
import type {
  ForecastRow, ChannelAllocation, DiscountRates, RebateRates, OtherRates,
  IDN, TabId, Scenario, ScenarioSnapshot, BenefitType, IRAConfig, ReferenceProduct, AdoptionConfig, Customer,
} from '../types';
import {
  DEFAULT_CHANNEL_ALLOC, BNB_CHANNEL_ALLOC, PBX_CHANNEL_ALLOC,
  BNB_REBATE_DEFAULTS, PBX_REBATE_DEFAULTS,
} from '../engine/constants';

// ── localStorage helpers ─────────────────────────────────────────────────

const STORAGE_KEY = 'accesslens_scenarios';

function loadScenarios(): Record<string, Scenario> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function persistScenarios(scenarios: Record<string, Scenario>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios)); } catch { /* noop */ }
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── State interface ──────────────────────────────────────────────────────

interface AppState {
  // Config
  productName: string;
  therapyArea: string;
  benefitType: BenefitType;
  roa: 'IV' | 'SC' | 'Oral';
  benefitTypeOverridden: boolean;
  nYears: number;
  startYear: number;
  activeTab: TabId;
  viewMode: 'brand' | 'portfolio' | 'customers';

  // Data
  forecast: ForecastRow[];
  channelAllocations: ChannelAllocation[];
  discounts: DiscountRates[];
  rebates: RebateRates[];
  otherRates: OtherRates[];
  idnList: IDN[];
  activeChannels: string[];
  iraConfig: IRAConfig;
  referenceProduct: ReferenceProduct;
  adoptionConfig: AdoptionConfig;
  formularyTierOverride: 'auto' | 'preferred' | 'non-preferred' | 'non-formulary';
  customerList: Customer[];

  // Scenario management
  scenarios: Record<string, Scenario>;
  activeScenarioId: string | null;
  dirty: boolean;

  // Config actions
  setProductName: (v: string) => void;
  setTherapyArea: (v: string) => void;
  setBenefitType: (v: BenefitType) => void;
  setRoa: (v: 'IV' | 'SC' | 'Oral') => void;
  resetBenefitTypeToAuto: () => void;
  setViewMode: (v: 'brand' | 'portfolio' | 'customers') => void;
  setNYears: (v: number) => void;
  setStartYear: (v: number) => void;
  setActiveTab: (v: TabId) => void;

  // Data actions
  setForecast: (v: ForecastRow[]) => void;
  updateForecastRow: (idx: number, updates: Partial<ForecastRow>) => void;
  setChannelAllocations: (v: ChannelAllocation[]) => void;
  updateChannelAllocation: (yearIdx: number, channel: string, value: number) => void;
  setDiscounts: (v: DiscountRates[]) => void;
  updateDiscount: (yearIdx: number, field: keyof Omit<DiscountRates, 'year'>, value: number) => void;
  setRebates: (v: RebateRates[]) => void;
  updateRebate: (yearIdx: number, field: keyof Omit<RebateRates, 'year'>, value: number) => void;
  setOtherRates: (v: OtherRates[]) => void;
  updateOtherRate: (yearIdx: number, field: keyof Omit<OtherRates, 'year'>, value: number) => void;
  setIdnList: (v: IDN[]) => void;
  addIDN: () => void;
  removeIDN: (idx: number) => void;
  updateIDN: (idx: number, updates: Partial<IDN>) => void;
  setActiveChannels: (v: string[]) => void;
  setIRAConfig: (v: Partial<IRAConfig>) => void;
  setReferenceProduct: (v: Partial<ReferenceProduct>) => void;
  setAdoptionConfig: (v: Partial<AdoptionConfig>) => void;
  setFormularyTierOverride: (v: 'auto' | 'preferred' | 'non-preferred' | 'non-formulary') => void;
  setCustomerList: (v: Customer[]) => void;
  updateCustomer: (id: number, patch: Partial<Customer>) => void;
  addCustomer: () => void;
  deleteCustomer: (id: number) => void;
  reinitialize: () => void;

  // Scenario actions
  saveScenario: (name: string, description: string, tags: string[]) => string;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  lockScenario: (id: string) => void;
  unlockScenario: (id: string) => void;
  duplicateScenario: (id: string, newName: string) => string;
  setDirty: (v: boolean) => void;
}

// ── Default generators ───────────────────────────────────────────────────

function generateDefaults(startYear: number, nYears: number, benefitType: BenefitType = 'buy-and-bill') {
  const years = Array.from({ length: nYears }, (_, i) => startYear + i);
  const baseUnits = [10000, 22000, 38000, 50000, 58000, 62000, 65000, 67000, 68000, 69000];

  const forecast: ForecastRow[] = years.map((year, i) => {
    const wac = Math.round(1500 * Math.pow(1.015, i) * 100) / 100;
    return {
      year,
      annualUnits: baseUnits[i] ?? 69000,
      wacPerUnit: wac,
      ampPerUnit: Math.round(wac * 0.85 * 100) / 100, // AMP ≈ 85% of WAC
      monthlyProfile: i === 0 ? 'S-Curve (Launch)' : 'Flat',
    };
  });

  const chAlloc = benefitType === 'buy-and-bill' ? BNB_CHANNEL_ALLOC : PBX_CHANNEL_ALLOC;
  const rebDef = benefitType === 'buy-and-bill' ? BNB_REBATE_DEFAULTS : PBX_REBATE_DEFAULTS;

  const channelAllocations: ChannelAllocation[] = years.map(year => ({
    year,
    allocations: { ...chAlloc },
  }));

  const discounts: DiscountRates[] = years.map((year, i) => ({
    year,
    gpo: Math.round((18 + i * 0.3) * 10) / 10,
    idn: Math.round((20 + i * 0.4) * 10) / 10,
    b340: 25.6,
    va: 24.0,
  }));

  const rebates: RebateRates[] = years.map((year, i) => ({
    year,
    comPbm: Math.round((rebDef.comPbm + i * 0.5) * 10) / 10,
    comMed: Math.round((rebDef.comMed + i * 0.3) * 10) / 10,
    mcrD: Math.round((rebDef.mcrD + i * 0.4) * 10) / 10,
    mcaid: rebDef.mcaid,
    manMcaid: Math.round((rebDef.manMcaid + i * 0.3) * 10) / 10,
  }));

  const otherRates: OtherRates[] = years.map(year => ({
    year,
    adminFee: 2.0,
    distFee: 2.0,
    copay: 3.5,
    returns: 1.5,
    specialtyPharmFee: 1.5,
    papCost: 4.0,
  }));

  const referenceProduct: ReferenceProduct = {
    name: 'Reference Product',
    wacPerUnit: years.map((_, i) => Math.round(3000 * Math.pow(1.05, i) * 100) / 100),
    totalMarketUnits: years.map((_, i) => Math.round(200000 * Math.pow(0.97, i))),
    isInterchangeable: false,
  };

  return { forecast, channelAllocations, discounts, rebates, otherRates, referenceProduct };
}

// ── Snapshot helpers ─────────────────────────────────────────────────────

function takeSnapshot(s: AppState): ScenarioSnapshot {
  return {
    forecast: JSON.parse(JSON.stringify(s.forecast)),
    channelAllocations: JSON.parse(JSON.stringify(s.channelAllocations)),
    discounts: JSON.parse(JSON.stringify(s.discounts)),
    rebates: JSON.parse(JSON.stringify(s.rebates)),
    otherRates: JSON.parse(JSON.stringify(s.otherRates)),
    idnList: JSON.parse(JSON.stringify(s.idnList)),
    activeChannels: [...s.activeChannels],
    productName: s.productName,
    therapyArea: s.therapyArea,
    benefitType: s.benefitType,
    iraConfig: { ...s.iraConfig },
    referenceProduct: JSON.parse(JSON.stringify(s.referenceProduct)),
    adoptionConfig: { ...s.adoptionConfig },
    nYears: s.nYears,
    startYear: s.startYear,
  };
}

function restoreSnapshot(snap: ScenarioSnapshot): Partial<AppState> {
  return {
    forecast: JSON.parse(JSON.stringify(snap.forecast)),
    channelAllocations: JSON.parse(JSON.stringify(snap.channelAllocations)),
    discounts: JSON.parse(JSON.stringify(snap.discounts)),
    rebates: JSON.parse(JSON.stringify(snap.rebates)),
    otherRates: JSON.parse(JSON.stringify(snap.otherRates)),
    idnList: JSON.parse(JSON.stringify(snap.idnList)),
    activeChannels: [...snap.activeChannels],
    productName: snap.productName,
    therapyArea: snap.therapyArea,
    benefitType: snap.benefitType,
    iraConfig: snap.iraConfig ? { ...snap.iraConfig } : { enabled: true, baselineASP: 0, baselineYear: 2025, annualCPIU: 3.0 },
    referenceProduct: snap.referenceProduct ? JSON.parse(JSON.stringify(snap.referenceProduct)) : undefined,
    adoptionConfig: snap.adoptionConfig ? { ...snap.adoptionConfig } : undefined,
    nYears: snap.nYears,
    startYear: snap.startYear,
  };
}

function generateChangesSummary(prev: ScenarioSnapshot | null, curr: ScenarioSnapshot): string {
  if (!prev) return 'Initial save';
  const changes: string[] = [];
  if (JSON.stringify(prev.forecast) !== JSON.stringify(curr.forecast)) changes.push('forecast volumes/WAC');
  if (JSON.stringify(prev.channelAllocations) !== JSON.stringify(curr.channelAllocations)) changes.push('channel allocation');
  if (JSON.stringify(prev.discounts) !== JSON.stringify(curr.discounts)) changes.push('discounts');
  if (JSON.stringify(prev.rebates) !== JSON.stringify(curr.rebates)) changes.push('rebates');
  if (JSON.stringify(prev.otherRates) !== JSON.stringify(curr.otherRates)) changes.push('fees');
  if (JSON.stringify(prev.idnList) !== JSON.stringify(curr.idnList)) changes.push('IDN list');
  if (JSON.stringify(prev.referenceProduct) !== JSON.stringify(curr.referenceProduct)) changes.push('reference product');
  return changes.length > 0 ? `Updated ${changes.join(', ')}` : 'No changes';
}

// ── Store ────────────────────────────────────────────────────────────────

const initialDefaults = generateDefaults(2025, 7, 'buy-and-bill');

export const useStore = create<AppState>((set, get) => ({
  productName: 'RXPRODUCT-001',
  therapyArea: 'Oncology',
  benefitType: 'buy-and-bill' as BenefitType,
  roa: 'IV' as const,
  benefitTypeOverridden: false,
  nYears: 7,
  startYear: 2025,
  viewMode: 'brand' as const,
  activeTab: 'dashboard',

  ...initialDefaults,

  idnList: [
    { name: 'IDN-A (Academic Medical)', discount: 20.0, volumePct: 30.0, is340b: false },
    { name: 'IDN-B (Community Hospital)', discount: 18.0, volumePct: 25.0, is340b: false },
    { name: 'IDN-C (340B Covered Entity)', discount: 25.6, volumePct: 15.0, is340b: true },
    { name: 'IDN-D (GPO Member)', discount: 15.0, volumePct: 20.0, is340b: false },
    { name: 'IDN-E (VA Affiliate)', discount: 24.0, volumePct: 10.0, is340b: false },
  ],
  activeChannels: [...Object.keys(DEFAULT_CHANNEL_ALLOC)],
  iraConfig: { enabled: true, baselineASP: 0, baselineYear: 2025, annualCPIU: 3.0 },
  adoptionConfig: {
    enabled: false, mode: 'manual' as const, launchMonth: 1, peakSharePct: 40,
    timeToSteadyStateYears: 3, switchRatePctPerMonth: 3, newPatientCapturePct: 60, interchangeableUplift: 2.5,
  },
  formularyTierOverride: 'auto' as const,
  customerList: [
    { id: 1, name: 'CVS Caremark', channelType: 'Commercial PBM', contractedRebatePct: 34.5, medicaidMixPct: 0, volumePctOfChannel: 55, notes: 'Primary PBM — formulary preferred tier 2' },
    { id: 2, name: 'Express Scripts (Evernorth)', channelType: 'Commercial PBM', contractedRebatePct: 31.0, medicaidMixPct: 0, volumePctOfChannel: 45, notes: 'Formulary preferred tier 2' },
    { id: 3, name: 'UnitedHealth / Optum Rx', channelType: 'Medicare Part D', contractedRebatePct: 29.5, medicaidMixPct: 0, volumePctOfChannel: 40, notes: 'PDL preferred — Part D' },
    { id: 4, name: 'Humana Part D', channelType: 'Medicare Part D', contractedRebatePct: 27.0, medicaidMixPct: 0, volumePctOfChannel: 30, notes: 'Non-preferred — rebate pending negotiation' },
    { id: 5, name: 'Centene / WellCare', channelType: 'Managed Medicaid', contractedRebatePct: 43.5, medicaidMixPct: 85, volumePctOfChannel: 35, notes: 'Large managed Medicaid — supplemental rebate agreement' },
    { id: 6, name: 'Molina Healthcare', channelType: 'Managed Medicaid', contractedRebatePct: 41.0, medicaidMixPct: 80, volumePctOfChannel: 25, notes: 'Managed Medicaid — state formulary restrictions' },
    { id: 7, name: 'HCA Healthcare (IDN)', channelType: 'GPO/IDN Non-340B', contractedRebatePct: 0, medicaidMixPct: 12, volumePctOfChannel: 30, notes: 'GPO member — 20% off WAC contract', idnDiscount: 20.0, is340b: false },
    { id: 8, name: 'CommonSpirit Health (340B)', channelType: 'GPO/IDN 340B', contractedRebatePct: 0, medicaidMixPct: 18, volumePctOfChannel: 60, notes: '340B covered entity — ceiling price applies', idnDiscount: 25.6, is340b: true },
  ] as Customer[],

  // Scenario state
  scenarios: loadScenarios(),
  activeScenarioId: null,
  dirty: false,

  // ── Config actions ──

  setProductName: (v) => set({ productName: v, dirty: true }),
  setTherapyArea: (v) => set({ therapyArea: v, dirty: true }),
  setBenefitType: (v: BenefitType) => {
    const s = get();
    const chAlloc = v === 'buy-and-bill' ? BNB_CHANNEL_ALLOC : PBX_CHANNEL_ALLOC;
    const rebDef = v === 'buy-and-bill' ? BNB_REBATE_DEFAULTS : PBX_REBATE_DEFAULTS;
    const years = Array.from({ length: s.nYears }, (_, i) => s.startYear + i);
    const channelAllocations = years.map(year => ({ year, allocations: { ...chAlloc } }));
    const rebates = years.map((year, i) => ({
      year,
      comPbm: Math.round((rebDef.comPbm + i * 0.5) * 10) / 10,
      comMed: Math.round((rebDef.comMed + i * 0.3) * 10) / 10,
      mcrD: Math.round((rebDef.mcrD + i * 0.4) * 10) / 10,
      mcaid: rebDef.mcaid,
      manMcaid: Math.round((rebDef.manMcaid + i * 0.3) * 10) / 10,
    }));
    set({ benefitType: v, benefitTypeOverridden: true, channelAllocations, rebates, dirty: true });
  },
  setRoa: (v) => {
    const s = get();
    const roaMap: Record<string, BenefitType> = { 'IV': 'buy-and-bill', 'SC': 'pharmacy-benefit', 'Oral': 'pharmacy-benefit' };
    if (!s.benefitTypeOverridden) {
      const newBT = roaMap[v] ?? 'buy-and-bill';
      // Only reset allocations if benefit type actually changes
      if (newBT !== s.benefitType) {
        const chAlloc = newBT === 'buy-and-bill' ? BNB_CHANNEL_ALLOC : PBX_CHANNEL_ALLOC;
        const rebDef = newBT === 'buy-and-bill' ? BNB_REBATE_DEFAULTS : PBX_REBATE_DEFAULTS;
        const years = Array.from({ length: s.nYears }, (_, i) => s.startYear + i);
        const channelAllocations = years.map(year => ({ year, allocations: { ...chAlloc } }));
        const rebates = years.map((year, i) => ({
          year, comPbm: Math.round((rebDef.comPbm + i * 0.5) * 10) / 10,
          comMed: Math.round((rebDef.comMed + i * 0.3) * 10) / 10,
          mcrD: Math.round((rebDef.mcrD + i * 0.4) * 10) / 10,
          mcaid: rebDef.mcaid, manMcaid: Math.round((rebDef.manMcaid + i * 0.3) * 10) / 10,
        }));
        set({ roa: v, benefitType: newBT, channelAllocations, rebates, dirty: true });
      } else {
        set({ roa: v, dirty: true });
      }
    } else {
      set({ roa: v, dirty: true });
    }
  },
  resetBenefitTypeToAuto: () => {
    const s = get();
    const roaMap: Record<string, BenefitType> = { 'IV': 'buy-and-bill', 'SC': 'pharmacy-benefit', 'Oral': 'pharmacy-benefit' };
    const newBT = roaMap[s.roa] ?? 'buy-and-bill';
    set({ benefitTypeOverridden: false, benefitType: newBT, dirty: true });
  },
  setViewMode: (v) => set({ viewMode: v }),
  setNYears: (v) => {
    const s = get();
    const defaults = generateDefaults(s.startYear, v, s.benefitType);
    set({ nYears: v, ...defaults, dirty: true });
  },
  setStartYear: (v) => {
    const s = get();
    const defaults = generateDefaults(v, s.nYears, s.benefitType);
    set({ startYear: v, ...defaults, dirty: true });
  },
  setActiveTab: (v) => set({ activeTab: v }),

  // ── Data actions (all mark dirty) ──

  setForecast: (v) => set({ forecast: v, dirty: true }),
  updateForecastRow: (idx, updates) => set(s => {
    const forecast = [...s.forecast];
    forecast[idx] = { ...forecast[idx], ...updates };
    return { forecast, dirty: true };
  }),
  setChannelAllocations: (v) => set({ channelAllocations: v, dirty: true }),
  updateChannelAllocation: (yearIdx, channel, value) => set(s => {
    const allocations = [...s.channelAllocations];
    allocations[yearIdx] = {
      ...allocations[yearIdx],
      allocations: { ...allocations[yearIdx].allocations, [channel]: value },
    };
    return { channelAllocations: allocations, dirty: true };
  }),
  setDiscounts: (v) => set({ discounts: v, dirty: true }),
  updateDiscount: (yearIdx, field, value) => set(s => {
    const discounts = [...s.discounts];
    discounts[yearIdx] = { ...discounts[yearIdx], [field]: value };
    return { discounts, dirty: true };
  }),
  setRebates: (v) => set({ rebates: v, dirty: true }),
  updateRebate: (yearIdx, field, value) => set(s => {
    const rebates = [...s.rebates];
    rebates[yearIdx] = { ...rebates[yearIdx], [field]: value };
    return { rebates, dirty: true };
  }),
  setOtherRates: (v) => set({ otherRates: v, dirty: true }),
  updateOtherRate: (yearIdx, field, value) => set(s => {
    const otherRates = [...s.otherRates];
    otherRates[yearIdx] = { ...otherRates[yearIdx], [field]: value };
    return { otherRates, dirty: true };
  }),
  setIdnList: (v) => set({ idnList: v, dirty: true }),
  addIDN: () => set(s => ({
    idnList: [...s.idnList, {
      name: `IDN-${String.fromCharCode(65 + s.idnList.length)} (New)`,
      discount: 15.0, volumePct: 10.0, is340b: false,
    }],
    dirty: true,
  })),
  removeIDN: (idx) => set(s => ({
    idnList: s.idnList.filter((_, i) => i !== idx),
    dirty: true,
  })),
  updateIDN: (idx, updates) => set(s => {
    const idnList = [...s.idnList];
    idnList[idx] = { ...idnList[idx], ...updates };
    return { idnList, dirty: true };
  }),
  setActiveChannels: (v) => set({ activeChannels: v, dirty: true }),
  setIRAConfig: (v) => set(s => ({ iraConfig: { ...s.iraConfig, ...v }, dirty: true })),
  setReferenceProduct: (v) => set(s => ({ referenceProduct: { ...s.referenceProduct, ...v }, dirty: true })),
  setAdoptionConfig: (v) => set(s => ({ adoptionConfig: { ...s.adoptionConfig, ...v }, dirty: true })),
  setFormularyTierOverride: (v) => set({ formularyTierOverride: v, dirty: true }),
  setCustomerList: (v) => set({ customerList: v, dirty: true }),
  updateCustomer: (id, patch) => set(s => ({
    customerList: s.customerList.map(c => c.id === id ? { ...c, ...patch } : c), dirty: true,
  })),
  addCustomer: () => set(s => ({
    customerList: [...s.customerList, {
      id: Math.max(0, ...s.customerList.map(c => c.id)) + 1,
      name: 'New Customer', channelType: 'Commercial PBM', contractedRebatePct: 30,
      medicaidMixPct: 0, volumePctOfChannel: 10, notes: '',
    }], dirty: true,
  })),
  deleteCustomer: (id) => set(s => ({ customerList: s.customerList.filter(c => c.id !== id), dirty: true })),
  reinitialize: () => {
    const s = get();
    const defaults = generateDefaults(s.startYear, s.nYears, s.benefitType);
    set({ ...defaults, dirty: true });
  },

  // ── Scenario actions ──

  setDirty: (v) => set({ dirty: v }),

  saveScenario: (name, description, tags) => {
    const s = get();
    const now = new Date().toISOString();
    const snapshot = takeSnapshot(s);

    // If active scenario exists and name matches, save as new version
    if (s.activeScenarioId && s.scenarios[s.activeScenarioId] && s.scenarios[s.activeScenarioId].name === name) {
      const existing = s.scenarios[s.activeScenarioId];
      const newVersion = existing.version + 1;
      const changesSummary = generateChangesSummary(existing.snapshot, snapshot);
      const updated: Scenario = {
        ...existing,
        description,
        tags,
        lastModified: now,
        version: newVersion,
        snapshot,
        history: [...existing.history, { version: newVersion, savedAt: now, changesSummary }],
      };
      const scenarios = { ...s.scenarios, [existing.id]: updated };
      persistScenarios(scenarios);
      set({ scenarios, dirty: false });
      return existing.id;
    }

    // New scenario
    const id = uuid();
    const scenario: Scenario = {
      id, name, description, tags,
      createdAt: now, lastModified: now,
      version: 1, locked: false, snapshot,
      history: [{ version: 1, savedAt: now, changesSummary: 'Initial save' }],
    };
    const scenarios = { ...s.scenarios, [id]: scenario };
    persistScenarios(scenarios);
    set({ scenarios, activeScenarioId: id, dirty: false });
    return id;
  },

  loadScenario: (id) => {
    const s = get();
    const scenario = s.scenarios[id];
    if (!scenario) return;
    const restored = restoreSnapshot(scenario.snapshot);
    set({ ...restored, activeScenarioId: id, dirty: false });
  },

  deleteScenario: (id) => set(s => {
    const scenarios = { ...s.scenarios };
    delete scenarios[id];
    persistScenarios(scenarios);
    return {
      scenarios,
      activeScenarioId: s.activeScenarioId === id ? null : s.activeScenarioId,
    };
  }),

  lockScenario: (id) => set(s => {
    const scenario = s.scenarios[id];
    if (!scenario) return {};
    const scenarios = { ...s.scenarios, [id]: { ...scenario, locked: true } };
    persistScenarios(scenarios);
    return { scenarios };
  }),

  unlockScenario: (id) => set(s => {
    const scenario = s.scenarios[id];
    if (!scenario) return {};
    const scenarios = { ...s.scenarios, [id]: { ...scenario, locked: false } };
    persistScenarios(scenarios);
    return { scenarios };
  }),

  duplicateScenario: (id, newName) => {
    const s = get();
    const source = s.scenarios[id];
    if (!source) return '';
    const now = new Date().toISOString();
    const newId = uuid();
    const dup: Scenario = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId, name: newName,
      createdAt: now, lastModified: now,
      version: 1, locked: false,
      history: [{ version: 1, savedAt: now, changesSummary: `Duplicated from "${source.name}" v${source.version}` }],
    };
    const scenarios = { ...s.scenarios, [newId]: dup };
    persistScenarios(scenarios);
    set({ scenarios });
    return newId;
  },
}));
