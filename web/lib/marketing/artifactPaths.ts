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
    key: "hero/work-moves-forward-flow",
    src: "/marketing/brand/alloy-gradient-brandmark.svg",
    alt: "Work moving forward: information becomes organized work and resolves into a clear outcome",
    aspect: "1024/520" as const,
    ready: true,
  },
  disconnectedToUnified: {
    key: "illustrations/disconnected-to-unified-v7",
    src: "/marketing/illustrations/disconnected-to-unified-v7.webp",
    alt: "Disconnected systems around a person: documents, reports, tools, spreadsheets, tasks, messages, and email that don't talk — work that doesn't flow",
    aspect: "834/660" as const,
    ready: true,
  },
  valuePropBanner: {
    key: "illustrations/value-prop-banner-v2",
    src: "/marketing/illustrations/value-prop-banner-v2.webp",
    alt: "From siloed to streamlined, save time, reduce risk, and drive impact with Alloy",
    aspect: "971/326" as const,
    /** Replaced by native ValuePropBanner component — keep file for reference only */
    ready: false,
  },
  businessProcesses: {
    key: "illustrations/business-processes-v3",
    src: "/marketing/illustrations/business-processes-v3.webp",
    alt: "Business process stages from start through requirements, decision, outcome, and next step",
    aspect: "1024/444" as const,
    /** Homepage only — native BusinessProcessFlow. Do not reuse on /platform. */
    ready: false,
  },
  platformFoundation: {
    key: "platform-foundation",
    src: "/marketing/brand/alloy-gradient-brandmark.svg",
    alt: "Shared Alloy foundation supporting Business Processes, Processing, Communications, Operational Intelligence, records, actions, permissions, and work",
    aspect: "16/9" as const,
    /** Native PlatformFoundationVisual on /platform — not a raster illustration */
    ready: true,
  },
  processBenefits: {
    key: "illustrations/process-benefits-icons-v1",
    src: "/marketing/illustrations/process-benefits-icons-v1.webp",
    alt: "Clear ownership, built-in consistency, real-time visibility, and better outcomes",
    aspect: "992/267" as const,
    /** Replaced by native ProcessBenefitsStrip component — keep file for reference only */
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
    /** Replaced by native VisionExpansionVisual on /vision */
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
