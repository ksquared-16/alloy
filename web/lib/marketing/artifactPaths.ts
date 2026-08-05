/**
 * Marketing site asset paths.
 * Brand doctrine: docs/marketing/ALLOY-BRAND-DOCTRINE.md
 * Website structure: docs/marketing/ALLOY-MARKETING-WEBSITE.md
 *
 * Pending production assets use MarketingAssetPlaceholder with these keys —
 * do not invent final art.
 */

export const MARKETING_BRAND = {
  wordmark: "/marketing/brand/alloy-gradient-wordmark.svg",
  wordmarkLockup: "/marketing/brand/alloy-gradient-wordmark-lockup.svg",
  brandmark: "/marketing/brand/alloy-gradient-brandmark.svg",
  favicon: "/marketing/favicon/alloy-gradient-brandmark.svg",
} as const;

export const MARKETING_ASSETS = {
  hero: {
    key: "hero/alloy-work-forward-hero",
    src: "/marketing/hero/alloy-work-forward-hero.webp",
    alt: "Alloy operating system: information enters, Business Processes organize work, and actions produce outcomes",
    aspect: "5/3" as const,
    ready: true,
  },
  disconnectedToUnified: {
    key: "illustrations/disconnected-to-unified",
    src: "/marketing/illustrations/disconnected-to-unified.webp",
    alt: "Disconnected systems becoming one operating system",
    aspect: "3/2" as const,
    ready: true,
  },
  businessProcesses: {
    key: "illustrations/business-processes",
    src: "/marketing/illustrations/business-processes.webp",
    alt: "Business Processes organizing operational work",
    aspect: "16/10" as const,
    ready: false,
  },
  processing: {
    key: "product/processing",
    src: "/marketing/product/processing.webp",
    alt: "Alloy Processing product surface",
    aspect: "16/10" as const,
    ready: false,
  },
  operationalIntelligence: {
    key: "product/operational-intelligence",
    src: "/marketing/product/operational-intelligence.webp",
    alt: "Alloy Operational Intelligence product surface",
    aspect: "16/10" as const,
    ready: false,
  },
  communications: {
    key: "product/communications",
    src: "/marketing/product/communications.webp",
    alt: "Alloy Communications product surface",
    aspect: "16/10" as const,
    ready: false,
  },
  bos: {
    key: "product/bos",
    src: "/marketing/product/bos.webp",
    alt: "Alloy BOS operational AI surface",
    aspect: "16/10" as const,
    ready: false,
  },
  platformExpansion: {
    key: "illustrations/platform-expansion",
    src: "/marketing/illustrations/platform-expansion.webp",
    alt: "Alloy platform expansion vision",
    aspect: "16/10" as const,
    ready: false,
  },
  finalCta: {
    key: "illustrations/final-cta",
    src: "/marketing/illustrations/final-cta.webp",
    alt: "Where Work Happens",
    aspect: "16/10" as const,
    ready: false,
  },
} as const;

export type MarketingAssetKey = keyof typeof MARKETING_ASSETS;
export type MarketingAssetDef = (typeof MARKETING_ASSETS)[MarketingAssetKey];

/** @deprecated Prefer MARKETING_ASSETS + MarketingAssetPlaceholder. Login still uses a real SVG. */
export const MARKETING_ARTIFACTS = {
  title: MARKETING_BRAND.brandmark,
  problem: MARKETING_BRAND.brandmark,
  platformFoundation: MARKETING_BRAND.brandmark,
  enrollmentWorkflow: MARKETING_BRAND.brandmark,
  biggerPicture: MARKETING_BRAND.brandmark,
  vision: MARKETING_BRAND.brandmark,
} as const;
