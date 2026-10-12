export type FontId = "inter" | "poppins" | "noto-sans" | "google-sans";

export interface FontConfig {
  id: FontId;
  name: string;
  family: string;
  preview: string;
}

export type FontSizeId = "compact" | "standard" | "large";

export interface FontSizeConfig {
  id: FontSizeId;
  name: string;
  preview: string;
  description: string;
}

export interface FontSizeTokens {
  h1: [string, string];
  h2: [string, string];
  h3: [string, string];
  bodyLg: [string, string];
  bodyMd: [string, string];
  bodySm: [string, string];
  labelMd: [string, string];
  labelSm: [string, string];
  button: [string, string];
  input: [string, string];
  tableHeader: [string, string];
  tableBody: [string, string];
  caption: [string, string];
  badge: [string, string];
  tooltip: [string, string];
  navLabel: [string, string];
}

export const FONTS: Record<FontId, FontConfig> = {
  inter: {
    id: "inter",
    name: "Inter",
    family: "Inter, 'Noto Sans Bengali', 'Noto Sans', sans-serif",
    preview: "The quick brown fox jumps",
  },
  poppins: {
    id: "poppins",
    name: "Poppins",
    family: "Poppins, 'Noto Sans Bengali', 'Noto Sans', sans-serif",
    preview: "The quick brown fox jumps",
  },
  "noto-sans": {
    id: "noto-sans",
    name: "Noto Sans",
    family: "'Noto Sans', 'Noto Sans Bengali', sans-serif",
    preview: "The quick brown fox jumps",
  },
  "google-sans": {
    id: "google-sans",
    name: "Google Sans",
    family: "'DM Sans', 'Google Sans', 'Noto Sans Bengali', 'Noto Sans', sans-serif",
    preview: "The quick brown fox jumps",
  },
};

export const FONT_ORDER: FontId[] = ["inter", "poppins", "noto-sans", "google-sans"];

export const FONT_SIZES: Record<FontSizeId, FontSizeConfig> = {
  compact: {
    id: "compact",
    name: "Compact",
    preview: "Aa",
    description: "Smaller text for dense work",
  },
  standard: {
    id: "standard",
    name: "Standard",
    preview: "Aa",
    description: "Balanced text for daily use",
  },
  large: {
    id: "large",
    name: "Large",
    preview: "Aa",
    description: "Larger text for easier reading",
  },
};

export const FONT_SIZE_ORDER: FontSizeId[] = ["compact", "standard", "large"];

// [size, line-height] pairs
// Standard is the base; Compact is -10% and Large is +10% for font sizes.
export const FONT_SIZE_TOKENS: Record<FontSizeId, FontSizeTokens> = {
  compact: {
    h1: ["43.2px", "52px"],        // Reference: 48px (scaled down)
    h2: ["36px", "40px"],        // Reference: 40px (scaled down)
    h3: ["30.6px", "34px"],        // Reference: 34px (scaled down)
    bodyLg: ["18px", "27px"],    // Reference: 20px (scaled down)
    bodyMd: ["16.2px", "23px"],    // Reference: 18px (scaled down)
    bodySm: ["14.4px", "20px"],    // Reference: 16px (scaled down)
    labelMd: ["14.4px", "20px"],   // Reference: 16px (scaled down)
    labelSm: ["12.6px", "16px"],   // Reference: 14px (scaled down)
    button: ["18px", "26px"],    // Reference: 20px (scaled down)
    input: ["14.4px", "22px"],     // Reference: 16px (scaled down)
    tableHeader: ["12.6px", "18px"],
    tableBody: ["12.6px", "19px"],
    caption: ["10.8px", "15px"],
    badge: ["10.8px", "15px"],
    tooltip: ["10.8px", "16px"],
    navLabel: ["12.6px", "1.25"],
  },
  standard: {
    h1: ["48px", "1"],           // Reference: 48px Bold
    h2: ["40px", "1"],           // Reference: 40px Semi Bold
    h3: ["34px", "37px"],        // Reference: 34px Bold
    bodyLg: ["20px", "1.5"],     // Reference: 20px Regular
    bodyMd: ["18px", "27px"],    // Reference: 18px Regular
    bodySm: ["16px", "24px"],    // Reference: 16px Regular/Medium
    labelMd: ["16px", "20px"],   // Reference: 16px Medium
    labelSm: ["14px", "20px"],   // Reference: 14px Medium
    button: ["20px", "28px"],    // Reference: 20px Semi Bold
    input: ["16px", "20px"],     // Reference: 16px Regular
    tableHeader: ["14px", "20px"],
    tableBody: ["14px", "20px"],
    caption: ["12px", "16px"],
    badge: ["12px", "16px"],
    tooltip: ["12px", "16px"],
    navLabel: ["14px", "1.25"],
  },
  large: {
    h1: ["52.8px", "1"],           // Reference: 48px (scaled up)
    h2: ["44px", "1"],           // Reference: 40px (scaled up)
    h3: ["37.4px", "44px"],        // Reference: 34px (scaled up)
    bodyLg: ["22px", "1.5"],     // Reference: 20px (scaled up)
    bodyMd: ["19.8px", "30px"],    // Reference: 18px (scaled up)
    bodySm: ["17.6px", "27px"],    // Reference: 16px (scaled up)
    labelMd: ["17.6px", "24px"],   // Reference: 16px (scaled up)
    labelSm: ["15.4px", "22px"],   // Reference: 14px (scaled up)
    button: ["22px", "32px"],    // Reference: 20px (scaled up)
    input: ["17.6px", "24px"],     // Reference: 16px (scaled up)
    tableHeader: ["15.4px", "24px"],
    tableBody: ["15.4px", "24px"],
    caption: ["13.2px", "20px"],
    badge: ["13.2px", "20px"],
    tooltip: ["13.2px", "20px"],
    navLabel: ["15.4px", "1.25"],
  },
};
