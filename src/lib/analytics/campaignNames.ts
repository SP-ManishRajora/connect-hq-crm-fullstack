/*
 * Google Ads campaign ids → readable names.
 *
 * Lead Form submissions arrive with only `campaign_id` (Google's webhook sends
 * no name), so those leads are stored with utmCampaign = "23561204870". The
 * stored value is left alone — it is what filters and drill-downs match on —
 * and only the label shown is swapped.
 *
 * Configured in the environment rather than a table: campaigns are created a
 * few times a year, and an id that is not listed simply shows as the id.
 *
 *   GOOGLE_ADS_CAMPAIGN_NAMES="23561204870=CP Coworking Search; 23561204999=Noida PMax"
 */

let cache: { raw: string; map: Map<string, string> } | null = null;

function names(): Map<string, string> {
  const raw = process.env.GOOGLE_ADS_CAMPAIGN_NAMES ?? "";
  if (cache?.raw === raw) return cache.map;

  const map = new Map<string, string>();
  for (const pair of raw.split(/[;\n]/)) {
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const id = pair.slice(0, eq).trim();
    const name = pair.slice(eq + 1).trim();
    if (id && name) map.set(id, name);
  }
  cache = { raw, map };
  return map;
}

/** The configured name for a campaign id, or the value unchanged. */
export function campaignLabel(value: string): string {
  return names().get(value.trim()) ?? value;
}

/** Labels for a list of values, for passing to client charts. */
export function campaignLabels(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of values) out[v] = campaignLabel(v);
  return out;
}
