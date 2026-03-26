import * as XLSX from 'xlsx';
import type {
  ForecastRow, ChannelAllocation, DiscountRates, RebateRates, OtherRates,
  AnnualGTN, ASPRow, GTNRow,
} from '../types';
import { MONTH_PROFILES } from './constants';

// ── Download helper ──────────────────────────────────────────────────────

export function triggerDownload(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Template Generation ──────────────────────────────────────────────────

export function generateTemplate(
  forecast: ForecastRow[],
  channelAllocations: ChannelAllocation[],
  discounts: DiscountRates[],
  rebates: RebateRates[],
  otherRates: OtherRates[],
  channels: string[],
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Instructions sheet
  const instrData = [
    ['AccessLens — Excel Template'],
    [''],
    ['Instructions:'],
    ['1. Fill in each sheet with your forecast assumptions.'],
    ['2. Do NOT rename sheets or change column headers.'],
    ['3. The "Volumes" sheet contains annual unit volumes and WAC per unit.'],
    ['4. Monthly Profile must be one of: Flat, S-Curve (Launch), Back-Loaded, Front-Loaded'],
    ['5. The "Channel Mix" sheet allocations must sum to 100% per year.'],
    ['6. Discount, rebate, and fee rates are entered as percentages (e.g. 14.0 means 14%).'],
    ['7. Save the file and upload it back into AccessLens.'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  // Volumes sheet
  const volHeaders = ['Year', 'Annual Units', 'WAC per Unit', 'Monthly Profile'];
  const volRows = forecast.map(f => [f.year, f.annualUnits, f.wacPerUnit, f.monthlyProfile]);
  const wsVol = XLSX.utils.aoa_to_sheet([volHeaders, ...volRows]);
  wsVol['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsVol, 'Volumes');

  // Channel Mix sheet
  const chHeaders = ['Year', ...channels];
  const chRows = channelAllocations.map(ca => [ca.year, ...channels.map(ch => ca.allocations[ch] ?? 0)]);
  const wsCh = XLSX.utils.aoa_to_sheet([chHeaders, ...chRows]);
  wsCh['!cols'] = [{ wch: 8 }, ...channels.map(() => ({ wch: 18 }))];
  XLSX.utils.book_append_sheet(wb, wsCh, 'Channel Mix');

  // Discounts sheet
  const discHeaders = ['Year', 'GPO %', 'IDN %', '340B %', 'VA FSS %'];
  const discRows = discounts.map(d => [d.year, d.gpo, d.idn, d.b340, d.va]);
  const wsDisc = XLSX.utils.aoa_to_sheet([discHeaders, ...discRows]);
  wsDisc['!cols'] = discHeaders.map(() => ({ wch: 12 }));
  XLSX.utils.book_append_sheet(wb, wsDisc, 'Discounts');

  // Rebates sheet
  const rebHeaders = ['Year', 'Com PBM %', 'Com Med %', 'Mcr Part D %', 'Medicaid FFS %', 'Managed Mcaid %'];
  const rebRows = rebates.map(r => [r.year, r.comPbm, r.comMed, r.mcrD, r.mcaid, r.manMcaid]);
  const wsReb = XLSX.utils.aoa_to_sheet([rebHeaders, ...rebRows]);
  wsReb['!cols'] = rebHeaders.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsReb, 'Rebates');

  // Fees sheet
  const feeHeaders = ['Year', 'Admin Fee %', 'Dist Fee %', 'Copay Support %', 'Returns %'];
  const feeRows = otherRates.map(o => [o.year, o.adminFee, o.distFee, o.copay, o.returns]);
  const wsFee = XLSX.utils.aoa_to_sheet([feeHeaders, ...feeRows]);
  wsFee['!cols'] = feeHeaders.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsFee, 'Fees');

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

// ── Upload Parsing ───────────────────────────────────────────────────────

export interface ParsedData {
  forecast: ForecastRow[];
  channelAllocations: ChannelAllocation[];
  discounts: DiscountRates[];
  rebates: RebateRates[];
  otherRates: OtherRates[];
}

const profileOptions = Object.keys(MONTH_PROFILES);

export async function parseUpload(file: File): Promise<{ data: ParsedData; errors: string[] }> {
  const errors: string[] = [];
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetNames = wb.SheetNames;
  const required = ['Volumes', 'Channel Mix', 'Discounts', 'Rebates', 'Fees'];
  for (const name of required) {
    if (!sheetNames.includes(name)) errors.push(`Missing required sheet: "${name}"`);
  }

  // Parse Volumes
  const forecast: ForecastRow[] = [];
  if (sheetNames.includes('Volumes')) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Volumes']);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = Number(r['Year']);
      const units = Number(r['Annual Units']);
      const wac = Number(r['WAC per Unit']);
      const profile = String(r['Monthly Profile'] ?? 'Flat');

      if (isNaN(year)) { errors.push(`Volumes row ${i + 2}: invalid Year`); continue; }
      if (isNaN(units) || units < 0) { errors.push(`Volumes row ${i + 2}: Units must be >= 0`); continue; }
      if (isNaN(wac) || wac <= 0) { errors.push(`Volumes row ${i + 2}: WAC must be > 0`); continue; }
      if (!profileOptions.includes(profile)) { errors.push(`Volumes row ${i + 2}: Profile must be one of ${profileOptions.join(', ')}`); }

      forecast.push({
        year, annualUnits: Math.round(units), wacPerUnit: Math.round(wac * 100) / 100,
        monthlyProfile: profileOptions.includes(profile) ? profile : 'Flat',
      });
    }
  }

  // Parse Channel Mix
  const channelAllocations: ChannelAllocation[] = [];
  if (sheetNames.includes('Channel Mix')) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Channel Mix']);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = Number(r['Year']);
      if (isNaN(year)) { errors.push(`Channel Mix row ${i + 2}: invalid Year`); continue; }
      const allocations: Record<string, number> = {};
      let sum = 0;
      for (const [key, val] of Object.entries(r)) {
        if (key === 'Year') continue;
        const num = Number(val);
        if (isNaN(num)) { errors.push(`Channel Mix row ${i + 2}: "${key}" is not a number`); continue; }
        if (num < 0) errors.push(`Channel Mix row ${i + 2}: "${key}" cannot be negative`);
        allocations[key] = num;
        sum += num;
      }
      if (Math.abs(sum - 100) > 0.5) errors.push(`Channel Mix row ${i + 2}: sum is ${sum.toFixed(1)}% (should be 100%)`);
      channelAllocations.push({ year, allocations });
    }
  }

  // Parse Discounts
  const discounts: DiscountRates[] = [];
  if (sheetNames.includes('Discounts')) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Discounts']);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = Number(r['Year']);
      const gpo = Number(r['GPO %']);
      const idn = Number(r['IDN %']);
      const b340 = Number(r['340B %']);
      const va = Number(r['VA FSS %']);
      if (isNaN(year)) { errors.push(`Discounts row ${i + 2}: invalid Year`); continue; }
      for (const [name, val] of [['GPO', gpo], ['IDN', idn], ['340B', b340], ['VA FSS', va]] as [string, number][]) {
        if (isNaN(val)) errors.push(`Discounts row ${i + 2}: ${name} is not a number`);
        else if (val > 100) errors.push(`Discounts row ${i + 2}: ${name} exceeds 100%`);
      }
      discounts.push({ year, gpo: gpo || 0, idn: idn || 0, b340: b340 || 0, va: va || 0 });
    }
  }

  // Parse Rebates
  const rebates: RebateRates[] = [];
  if (sheetNames.includes('Rebates')) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Rebates']);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = Number(r['Year']);
      if (isNaN(year)) { errors.push(`Rebates row ${i + 2}: invalid Year`); continue; }
      const comPbm = Number(r['Com PBM %']) || 0;
      const comMed = Number(r['Com Med %']) || 0;
      const mcrD = Number(r['Mcr Part D %']) || 0;
      const mcaid = Number(r['Medicaid FFS %']) || 0;
      const manMcaid = Number(r['Managed Mcaid %']) || 0;
      for (const [name, val] of [['Com PBM', comPbm], ['Com Med', comMed], ['Mcr Part D', mcrD], ['Medicaid FFS', mcaid], ['Managed Mcaid', manMcaid]] as [string, number][]) {
        if (val > 100) errors.push(`Rebates row ${i + 2}: ${name} exceeds 100%`);
      }
      rebates.push({ year, comPbm, comMed, mcrD, mcaid, manMcaid });
    }
  }

  // Parse Fees
  const otherRates: OtherRates[] = [];
  if (sheetNames.includes('Fees')) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Fees']);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = Number(r['Year']);
      if (isNaN(year)) { errors.push(`Fees row ${i + 2}: invalid Year`); continue; }
      const adminFee = Number(r['Admin Fee %']) || 0;
      const distFee = Number(r['Dist Fee %']) || 0;
      const copay = Number(r['Copay Support %']) || 0;
      const returns = Number(r['Returns %']) || 0;
      otherRates.push({ year, adminFee, distFee, copay, returns });
    }
  }

  return { data: { forecast, channelAllocations, discounts, rebates, otherRates }, errors };
}

// ── Results Export ────────────────────────────────────────────────────────

export function exportResults(
  annualData: AnnualGTN[],
  aspData: ASPRow[],
  gtnData: GTNRow[],
  metadata: { productName: string; scenarioName: string },
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Metadata
  const wsMeta = XLSX.utils.aoa_to_sheet([
    ['AccessLens — Results Export'],
    [''],
    ['Product', metadata.productName],
    ['Scenario', metadata.scenarioName],
    ['Exported', new Date().toISOString()],
    ['Forecast Horizon', annualData.length > 0 ? `${annualData[0].year}–${annualData[annualData.length - 1].year}` : ''],
  ]);
  wsMeta['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata');

  // Annual Summary
  const annHeaders = ['Year', 'Units', 'Gross Sales', 'Rebates', 'Chargebacks', 'Fees/Other',
    'Total Deductions', 'Net Sales', 'GTN %', 'Net $/Unit', 'Net % of WAC'];
  const annRows = annualData.map(d => [
    d.year, d.units, d.grossSales, d.totalRebates, d.totalChargebacks, d.totalOther,
    d.totalDeductions, d.netSales, d.gtnPct, d.netPrice, d.netPct,
  ]);
  const wsAnn = XLSX.utils.aoa_to_sheet([annHeaders, ...annRows]);
  wsAnn['!cols'] = annHeaders.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsAnn, 'Annual Summary');

  // Monthly GTN
  const gtnHeaders = ['Period', 'Year', 'Month', 'Units', 'WAC', 'Gross Sales', 'Total Rebates',
    'Total Chargebacks', 'Total Other', 'Total Deductions', 'Net Sales', 'GTN %'];
  const gtnRows = gtnData.map(d => [
    d.period, d.year, d.month, d.units, d.wac, d.grossSales,
    d.totalRebates, d.totalChargebacks, d.totalOther, d.totalDeductions, d.netSales, d.gtnPct,
  ]);
  const wsGTN = XLSX.utils.aoa_to_sheet([gtnHeaders, ...gtnRows]);
  wsGTN['!cols'] = gtnHeaders.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, wsGTN, 'Monthly GTN Detail');

  // Monthly ASP
  const aspHeaders = ['Period', 'Year', 'Month', 'WAC', 'Monthly ASP', 'Rolling 6M ASP',
    'ASP+6%', 'Eligible Units', 'Total Units'];
  const aspRows = aspData.map(d => [
    d.period, d.year, d.month, d.wac, d.monthlyASP, d.rollingASP6M,
    d.aspPlus6, d.eligibleUnits, d.totalUnits,
  ]);
  const wsASP = XLSX.utils.aoa_to_sheet([aspHeaders, ...aspRows]);
  wsASP['!cols'] = aspHeaders.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, wsASP, 'Monthly ASP Detail');

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

// ── Assumptions Export ───────────────────────────────────────────────────

export function exportAssumptions(
  forecast: ForecastRow[],
  channelAllocations: ChannelAllocation[],
  discounts: DiscountRates[],
  rebates: RebateRates[],
  otherRates: OtherRates[],
  channels: string[],
): Uint8Array {
  // Same format as template but with current values
  return generateTemplate(forecast, channelAllocations, discounts, rebates, otherRates, channels);
}
