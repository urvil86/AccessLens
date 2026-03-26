export const CHANNELS = [
  'Commercial PBM',
  'Commercial Medical',
  'Medicare Part B',
  'Medicare Part D',
  'Medicaid FFS',
  'Managed Medicaid',
  'GPO/IDN Non-340B',
  'GPO/IDN 340B',
  'VA/DoD/Federal',
  'Cash/Uninsured',
] as const;

export const ASP_ELIGIBLE: Record<string, boolean> = {
  'Commercial PBM': true,
  'Commercial Medical': true,
  'Medicare Part B': true,
  'Medicare Part D': true,
  'Medicaid FFS': false,
  'Managed Medicaid': false,
  'GPO/IDN Non-340B': true,
  'GPO/IDN 340B': false,
  'VA/DoD/Federal': false,
  'Cash/Uninsured': true,
};

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const MONTH_PROFILES: Record<string, number[]> = {
  'Flat': Array(12).fill(1/12),
  'S-Curve (Launch)': [0.03,0.04,0.05,0.07,0.09,0.10,0.10,0.10,0.10,0.10,0.11,0.11],
  'Back-Loaded': [0.04,0.05,0.06,0.07,0.08,0.08,0.09,0.09,0.10,0.10,0.11,0.13],
  'Front-Loaded': [0.13,0.12,0.11,0.10,0.10,0.09,0.08,0.08,0.07,0.05,0.04,0.03],
};

export const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  'Commercial PBM': 'Retail/specialty pharmacy benefit — large rebate driver',
  'Commercial Medical': 'Provider buy-and-bill on commercial insurance',
  'Medicare Part B': 'Provider buy-and-bill billed to CMS at ASP+6%',
  'Medicare Part D': 'Pharmacy benefit for Medicare enrollees',
  'Medicaid FFS': 'State fee-for-service Medicaid — statutory rebates apply',
  'Managed Medicaid': 'MCO-managed Medicaid — supplemental rebates',
  'GPO/IDN Non-340B': 'Health system GPO contract price — chargeback driven',
  'GPO/IDN 340B': 'Covered entity 340B ceiling price — deepest discount',
  'VA/DoD/Federal': 'Federal Supply Schedule — FSS pricing required',
  'Cash/Uninsured': 'Out-of-pocket / patient assistance programs',
};

// Chryselys 2026 Brand Palette
export const BRAND = {
  navy: '#004567',
  charcoal: '#44546A',
  white: '#FFFFFF',
  lightGray: '#EAECEC',
  gold: '#C98B27',
  cream: '#E8E1CE',
  creamLight: '#FFF9EE',
  sand: '#C6B78A',
  slateBlue: '#9296B2',
  darkSlate: '#5C6082',
  skyBlue: '#5B9BD5',
  darkNavy: '#004466',
  hlink: '#5F5F5F',
  folhlink: '#919191',
} as const;

// Chart palette using brand colors + complementary tones
export const COLORS_MAIN = [
  '#5B9BD5', // sky blue
  '#C98B27', // gold
  '#004567', // navy
  '#9296B2', // slate blue
  '#5C6082', // dark slate
  '#C6B78A', // sand
  '#44546A', // charcoal
  '#E8E1CE', // cream
  '#7AB8D5', // lighter sky
  '#D4A84A', // lighter gold
];

export const DEFAULT_CHANNEL_ALLOC: Record<string, number> = {
  'Commercial PBM': 25,
  'Commercial Medical': 18,
  'Medicare Part B': 16,
  'Medicare Part D': 12,
  'Medicaid FFS': 8,
  'Managed Medicaid': 6,
  'GPO/IDN Non-340B': 7,
  'GPO/IDN 340B': 4,
  'VA/DoD/Federal': 2,
  'Cash/Uninsured': 2,
};

export const THERAPY_AREAS = ['Oncology','Rare Disease','Immunology','Cardiovascular','Neurology','Other'];
export const ADMIN_ROUTES = ['IV Infusion (Buy & Bill)','SC Injection','Oral','IM Injection'];
