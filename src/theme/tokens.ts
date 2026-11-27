/**
 * Shared visual tokens.
 *
 * Brand palette follows the approved forest-green / ivory / blue-gray route
 * icon (2026-10-09). Semantic error/warning colors remain distinct.
 */

export const colors = {
  /** Primary text. */
  text: '#1C2D26',
  /** Secondary text. */
  textSecondary: '#35483F',
  /** Tertiary text. */
  textMuted: '#52635A',
  /** Labels and captions. */
  textSubtle: '#627269',
  /** Disabled and placeholder text. */
  textDisabled: '#9BA69E',

  /** Forest-green primary actions match the icon background. */
  primary: '#086050',
  /** Emphasised accent (pressed states, active controls). */
  primaryStrong: '#075346',
  /** Deep accent for large fills. */
  primaryDeep: '#044438',
  /** Tinted accent surface for chips and selected rows. */
  primarySoft: '#E7F0E9',
  primaryDisabled: '#9BA69E',
  /** Blue-gray itinerary accent; selected rows and map pins share this family. */
  accent: '#4E7580',
  accentStrong: '#365F6B',
  accentSoft: '#E7EFF0',
  /** Text and borders over dark brand fills. */
  onPrimary: '#FFFFFF',

  danger: '#b42318',
  /** Amber for derived validation warnings (Stage-03 §6.12 ⚠ rows). */
  warning: '#b54708',
  success: '#086050',
  successSurface: '#EDF3ED',

  surface: '#FFFBF3',
  /** Page background. */
  background: '#F5F2EA',
  surfaceMuted: '#F0EFE7',

  border: '#D4DCD3',
  borderSubtle: '#E4E8DF',

  backdrop: 'rgba(28, 45, 38, 0.35)',
  /**
   * Solid backdrop layer for sheets that animate their own opacity.
   *
   * A sheet backdrop must be one full-viewport layer that only fades, so its
   * tint cannot live in the colour's own alpha — that would make the resting
   * opacity depend on two values instead of the animated one.
   */
  backdropLayer: '#1C2D26',
} as const;

/**
 * Map marker palette. One hue family; state is expressed through weight rather
 * than unrelated hues (Stage 03 §3.5).
 *
 * Home retains these state tones. Trip selection/quantity badges use the normal
 * fill plus size/white-ring emphasis; its native AMap normal/unscheduled values
 * stay aligned with these tokens without importing across the native boundary.
 */
export const markerColors = {
  normal: '#4E7580',
  selected: '#365F6B',
  unscheduled: '#85928D',
  cluster: '#274C57',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  screenTitle: { fontSize: 28, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 13 },
  micro: { fontSize: 12 },
} as const;

/** Minimum touch target Apple documents for iOS. */
export const MIN_TOUCH_TARGET = 44;
