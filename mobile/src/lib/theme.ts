// Mirrors the web housekeeping module's Tailwind palette (slate + indigo), so
// staff moving between the browser and the app see the same system.
export const colors = {
  bg: "#f8fafc",        // slate-50
  surface: "#ffffff",
  border: "#e2e8f0",    // slate-200
  text: "#0f172a",      // slate-900
  textMuted: "#64748b", // slate-500
  primary: "#4f46e5",   // indigo-600
  primaryText: "#ffffff",
  success: "#16a34a",   // green-600
  warning: "#d97706",   // amber-600
  danger: "#dc2626",    // red-600
  dangerBg: "#fef2f2",  // red-50
  warningBg: "#fffbeb", // amber-50
  successBg: "#f0fdf4", // green-50
  infoBg: "#eef2ff",    // indigo-50
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

// Severity and priority colours match the web console's badges.
export const severityColor: Record<string, string> = {
  CRITICAL: colors.danger,
  HIGH: colors.warning,
  MEDIUM: colors.primary,
  LOW: colors.textMuted,
  URGENT: colors.danger,
  NORMAL: colors.primary,
};
