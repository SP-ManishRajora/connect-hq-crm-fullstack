import { createHash } from "crypto";

/*
 * Google Ads offline conversion upload.
 *
 * This is the half of conversion tracking that Google cannot do by itself. Its
 * tag sees a form submit and calls that a conversion — but a form submit is not
 * revenue, and a campaign full of tyre-kickers looks identical to one full of
 * customers until someone tells Google which clicks actually paid. That is what
 * this does: when a lead reaches a paying stage, the click id it arrived with
 * is reported back with the deal's value.
 *
 * Talks to the REST endpoint directly with google-auth-library rather than
 * pulling in the google-ads-api package. That package is very large, wraps a
 * gRPC stack, and we make exactly one kind of call. The auth library is already
 * present as a dependency of the GA4 client.
 *
 * Nothing here runs in the browser: the refresh token and developer token are
 * server-only and would be catastrophic to ship to a client bundle.
 */

const ADS_API_VERSION = "v18";

export type AdsConfig = {
  customerId: string;       // the account conversions belong to, digits only
  loginCustomerId: string;  // the MCC/manager account, digits only; may equal customerId
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Resource name of the conversion action, e.g. customers/123/conversionActions/456 */
  conversionActionId: string;
};

/**
 * Read config from the environment, or null when Ads upload is not set up.
 *
 * Returns null rather than throwing, matching getGaConfig(): the dashboard has
 * to render a "not configured" panel on a fresh checkout instead of a 500.
 */
export function getAdsConfig(): AdsConfig | null {
  const digits = (v: string | undefined) => (v ?? "").replace(/[^0-9]/g, "");

  const customerId = digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  const conversionActionId = digits(process.env.GOOGLE_ADS_CONVERSION_ACTION_ID);

  if (!customerId || !developerToken || !clientId || !clientSecret || !refreshToken) return null;
  if (!conversionActionId) return null;

  // A single (non-manager) account manages itself.
  const loginCustomerId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || customerId;

  return {
    customerId,
    loginCustomerId,
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    conversionActionId,
  };
}

export function isAdsConfigured(): boolean {
  return getAdsConfig() !== null;
}

/**
 * Normalise and hash a value for enhanced conversions.
 *
 * Google requires SHA-256 of the lower-cased, trimmed value — the hashing is
 * what makes it "enhanced conversions for leads" rather than sending Google a
 * customer list in the clear. The raw email or phone never leaves this server.
 */
export function hashForAds(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Phone numbers must be E.164 before hashing, or the hash will not match
 * Google's — "+91 63009 07795", "06300907795" and "6300907795" are the same
 * subscriber and must produce one hash.
 *
 * Indian numbers are assumed when no country code is present, which is the only
 * case this CRM sees. A number that cannot be made sense of returns null rather
 * than a hash of something wrong: a wrong hash is worse than no hash, because
 * it silently never matches and looks like poor campaign performance.
 */
export function toE164(phone: string | null | undefined, defaultCc = "91"): string | null {
  let s = String(phone ?? "").trim();
  if (!s) return null;

  const hadPlus = s.startsWith("+");
  s = s.replace(/[^0-9]/g, "");
  if (!s) return null;

  if (hadPlus) return "+" + s;

  // 0-prefixed trunk dialling, e.g. 06300907795.
  if (s.startsWith("0")) s = s.replace(/^0+/, "");

  // Already carries the country code.
  if (s.length > 10 && s.startsWith(defaultCc)) return "+" + s;

  if (s.length === 10) return "+" + defaultCc + s;

  // Anything else is ambiguous — refuse rather than guess.
  return s.length > 10 ? "+" + s : null;
}

export type ConversionUpload = {
  gclid: string;
  /** When the conversion happened. Google rejects anything in the future. */
  conversionDateTime: Date;
  value: number | null;
  currencyCode?: string;
  /** Optional enhanced-conversion identifiers, hashed before sending. */
  email?: string | null;
  phone?: string | null;
  /** Our own id, so a retry is idempotent on Google's side. */
  orderId?: string;
};

/**
 * Format a date the way the Ads API demands: "yyyy-MM-dd HH:mm:ss+HH:mm".
 *
 * An ISO string is rejected. The offset must be explicit — a naive timestamp is
 * interpreted in the account's timezone, which silently shifts every conversion
 * by hours and makes attribution windows wrong.
 */
export function formatAdsDateTime(d: Date, offsetMinutes = 330): string {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);

  return (
    `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())} ` +
    `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

/** Build one conversion in the shape the Ads API expects. */
export function buildConversionPayload(cfg: AdsConfig, c: ConversionUpload) {
  const conversion: Record<string, unknown> = {
    gclid: c.gclid,
    conversionAction: `customers/${cfg.customerId}/conversionActions/${cfg.conversionActionId}`,
    conversionDateTime: formatAdsDateTime(c.conversionDateTime),
  };

  // Google rejects a zero or negative value outright, so send nothing rather
  // than a value it will refuse — the conversion itself still counts.
  if (c.value && c.value > 0) {
    conversion.conversionValue = c.value;
    conversion.currencyCode = c.currencyCode || "INR";
  }

  // Idempotency: re-uploading the same order id updates rather than duplicates.
  if (c.orderId) conversion.orderId = c.orderId;

  // Enhanced conversions: hashed identifiers that let Google match a
  // conversion whose click id alone was not enough (e.g. across devices).
  const identifiers: Record<string, string>[] = [];
  const email = hashForAds(c.email);
  if (email) identifiers.push({ hashedEmail: email });
  const phone = hashForAds(toE164(c.phone));
  if (phone) identifiers.push({ hashedPhoneNumber: phone });
  if (identifiers.length) {
    conversion.userIdentifiers = identifiers;
    // Required whenever identifiers are present.
    conversion.userIdentifierSource = "FIRST_PARTY";
  }

  return conversion;
}

/** Exchange the long-lived refresh token for a short-lived access token. */
async function getAccessToken(cfg: AdsConfig): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Google refused the refresh token (${res.status}). ${body.error_description || body.error || ""}`.trim(),
    );
  }
  return body.access_token as string;
}

export type UploadResult = {
  ok: boolean;
  uploaded: number;
  /** Per-conversion errors, keyed by the index in the input array. */
  errors: { index: number; message: string }[];
  /** Whatever Google said, for the audit trail. */
  raw?: unknown;
};

/**
 * Upload conversions to Google Ads.
 *
 * partialFailure is on deliberately: one bad row in a batch of fifty should not
 * reject the other forty-nine. Google then reports per-row errors, which are
 * returned here so the caller can mark exactly the successful ones as uploaded.
 */
export async function uploadConversions(
  conversions: ConversionUpload[],
  cfg: AdsConfig | null = getAdsConfig(),
): Promise<UploadResult> {
  if (!cfg) return { ok: false, uploaded: 0, errors: [{ index: -1, message: "Google Ads is not configured." }] };
  if (!conversions.length) return { ok: true, uploaded: 0, errors: [] };

  const token = await getAccessToken(cfg);

  const res = await fetch(
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${cfg.customerId}:uploadClickConversions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": cfg.developerToken,
        "login-customer-id": cfg.loginCustomerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversions: conversions.map((c) => buildConversionPayload(cfg, c)),
        partialFailure: true,
        validateOnly: false,
      }),
    },
  );

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      body?.error?.message ||
      body?.[0]?.error?.message ||
      `Google Ads rejected the upload (HTTP ${res.status}).`;
    return { ok: false, uploaded: 0, errors: [{ index: -1, message }], raw: body };
  }

  // partialFailureError carries per-row failures; everything not named in it
  // succeeded. Its details encode the failing index in a field path like
  // "conversions[3]", which is the only way to tell which rows to leave unmarked.
  const errors: { index: number; message: string }[] = [];
  const pf = body?.partialFailureError;
  if (pf) {
    const details = pf.details ?? [];
    for (const d of details) {
      for (const e of d?.errors ?? []) {
        const path: string = e?.location?.fieldPathElements
          ?.map((f: { fieldName?: string; index?: number }) =>
            f.index != null ? `${f.fieldName}[${f.index}]` : f.fieldName,
          )
          .join(".") ?? "";
        const m = path.match(/conversions\[(\d+)\]/);
        errors.push({
          index: m ? Number(m[1]) : -1,
          message: e?.message || pf.message || "Unknown error",
        });
      }
    }
    // A partial failure with no parseable detail still means something failed.
    if (!errors.length) errors.push({ index: -1, message: pf.message || "Partial failure" });
  }

  const failedIdx = new Set(errors.map((e) => e.index).filter((i) => i >= 0));
  const uploaded = conversions.length - failedIdx.size;

  return { ok: errors.length === 0, uploaded, errors, raw: body };
}

/** Turn an Ads API failure into something an operator can act on. */
export function explainAdsError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/DEVELOPER_TOKEN_NOT_APPROVED|developer token/i.test(msg)) {
    return "The developer token is not approved for this account. Basic access is required before live uploads — check the API Center in your Google Ads manager account.";
  }
  if (/CUSTOMER_NOT_FOUND|USER_PERMISSION_DENIED|PERMISSION_DENIED/i.test(msg)) {
    return "Google refused access to that account. Check GOOGLE_ADS_CUSTOMER_ID is the conversion account (digits only) and that GOOGLE_ADS_LOGIN_CUSTOMER_ID is the manager account above it.";
  }
  if (/invalid_grant|refresh token/i.test(msg)) {
    return "The refresh token is no longer valid. Re-run the OAuth consent flow to issue a new GOOGLE_ADS_REFRESH_TOKEN.";
  }
  if (/CONVERSION_ACTION|conversionAction/i.test(msg)) {
    return "That conversion action was not found. GOOGLE_ADS_CONVERSION_ACTION_ID is the numeric id from the conversion action's URL in the Ads UI, and it must be an 'Import' action.";
  }
  return msg;
}
