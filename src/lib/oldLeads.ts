// Leads imported from the old spreadsheets live in their own "Old Lead" tab
// until someone works them. Source carries both the state and the enquiry date:
//
//   "Old Data · 18 Nov 2024"   imported, untouched  → Old Lead tab
//   "Old Leads · 18 Nov 2024"  followed up / updated → Lead tab
//
// Kept free of imports so the Leads page can use it in the browser.

export const OLD_DATA_SOURCE = "Old Data";
export const OLD_LEADS_SOURCE = "Old Leads";

function hasPrefix(source: string | null | undefined, prefix: string): boolean {
  return !!source && (source === prefix || source.startsWith(`${prefix} ·`));
}

// Imported and not yet worked: belongs in the Old Lead tab.
export function isOldDataSource(source: string | null | undefined): boolean {
  return hasPrefix(source, OLD_DATA_SOURCE);
}

// Imported from the old sheets, worked or not.
export function isImportedSource(source: string | null | undefined): boolean {
  return isOldDataSource(source) || hasPrefix(source, OLD_LEADS_SOURCE);
}

// "Old Data · 18 Nov 2024" → "Old Leads · 18 Nov 2024"; null if not an untouched import.
export function promotedSource(source: string | null | undefined): string | null {
  if (!isOldDataSource(source)) return null;
  return OLD_LEADS_SOURCE + (source as string).slice(OLD_DATA_SOURCE.length);
}

// The part after the prefix (the enquiry date), the same before and after promotion.
export function importedSourceSuffix(source: string): string {
  for (const p of [OLD_DATA_SOURCE, OLD_LEADS_SOURCE]) if (hasPrefix(source, p)) return source.slice(p.length);
  return source;
}
