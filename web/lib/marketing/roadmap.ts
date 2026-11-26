/**
 * Public marketing roadmap V2 — `/vision` source of truth.
 *
 * Model: Evolution (milestones by period) → Maturity (today) → Building now → Domains.
 *
 * Doctrine: actual periods for the past; honest maturity for the present;
 * direction for the future; ETAs only when published.
 *
 * Evidence: docs/platform/foundation/release-history.md, product-roadmap.md,
 * platform-capabilities.md, freeze-july-2026.md,
 * Operational-Intelligence-Platform-V1-Certified.md.
 */

export type RoadmapDateConfidence = "month" | "period";

export type RoadmapMilestone = {
  id: string;
  /** ISO month `YYYY-MM`, or period key like `2026-Q1`. */
  period: string;
  title: string;
  /** Optional one-sentence detail (progressive disclosure). */
  description?: string;
  dateConfidence: RoadmapDateConfidence;
  evidenceNote?: string;
  public: boolean;
};

export type CapabilityMaturity = {
  id: string;
  title: string;
  maturity: "established" | "expanding" | "next";
  public: boolean;
};

export type BuildingNowItem = {
  id: string;
  title: string;
  description: string;
  publicStatus: string;
  targetLabel?: string | null;
  public: boolean;
};

export type RoadmapDomain = {
  id: string;
  title: string;
  items: string[];
  public: boolean;
};

export type EvolutionPeriod = {
  key: string;
  label: string;
  sortKey: string;
  milestones: RoadmapMilestone[];
};

/** Quiet trust signal — bump when public roadmap content changes. */
export const ROADMAP_LAST_UPDATED = {
  isoMonth: "2026-08",
  label: "August 2026",
} as const;

export const ROADMAP_MILESTONES: RoadmapMilestone[] = [
  // ── Early 2026 ───────────────────────────────────────────────────────────
  {
    id: "q1-workspace",
    period: "2026-Q1",
    title: "Workspace shell",
    description: "Operator workspace for landing work and opening records.",
    dateConfidence: "period",
    evidenceNote: "release-history §2026 Q1 — AdminV2 workspace shell",
    public: true,
  },
  {
    id: "q1-access",
    period: "2026-Q1",
    title: "Access & permissions",
    description: "Org, department, and site scoping for operational access.",
    dateConfidence: "period",
    evidenceNote: "release-history §2026 Q1 — CRM scope model",
    public: true,
  },
  {
    id: "q1-automation",
    period: "2026-Q1",
    title: "Automation foundation",
    description: "Registered events and automation that move work forward.",
    dateConfidence: "period",
    evidenceNote: "release-history §2026 Q1 — Event/workflow spine",
    public: true,
  },
  {
    id: "q1-enrollment-intake",
    period: "2026-Q1",
    title: "Enrollment intake",
    description: "End-to-end enrollment packet intake path.",
    dateConfidence: "period",
    evidenceNote: "release-history §2026 Q1 — Enrollment packet Phase 1",
    public: true,
  },

  // ── April 2026 ───────────────────────────────────────────────────────────
  {
    id: "apr-communications",
    period: "2026-04",
    title: "Communications V1",
    description: "Messages connected to people, records, and operational work.",
    dateConfidence: "month",
    evidenceNote: "release-history §April — Communications V1 production",
    public: true,
  },
  {
    id: "apr-forms",
    period: "2026-04",
    title: "Forms foundation",
    description: "Form definitions, public links, and admin authoring hub.",
    dateConfidence: "month",
    evidenceNote: "release-history §April — Forms engine foundation",
    public: true,
  },
  {
    id: "apr-routing",
    period: "2026-04",
    title: "Workspace routing",
    description: "Stable slug-first paths into operational work.",
    dateConfidence: "month",
    evidenceNote: "release-history §April — Routing Phase G",
    public: true,
  },

  // ── May 2026 ─────────────────────────────────────────────────────────────
  {
    id: "may-enrollment-pipeline",
    period: "2026-05",
    title: "Enrollment Pipeline V2",
    description: "Case and child work converge on a clearer enrollment model.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Child lifecycle + work-unit convergence",
    public: true,
  },
  {
    id: "may-waitlist",
    period: "2026-05",
    title: "Waitlist Operations",
    description: "Ranking, position controls, and waitlist operational truth.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Waitlist pilot readiness",
    public: true,
  },
  {
    id: "may-forms-mvp",
    period: "2026-05",
    title: "Forms productization",
    description: "Operational templates and simplified form setup.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Forms MVP productization",
    public: true,
  },
  {
    id: "may-search",
    period: "2026-05",
    title: "Global Search",
    description: "Find operational records and open the work directly.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Global Search V1",
    public: true,
  },
  {
    id: "may-config",
    period: "2026-05",
    title: "Configuration control plane",
    description: "Fields, layouts, and actions configured in one control plane.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Settings + Record UX Parity V1",
    public: true,
  },
  {
    id: "may-tour-comms",
    period: "2026-05",
    title: "Tour Communications",
    description: "Tour booking lifecycle messages and scheduled reminders.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — Tour Phase 2 Band A",
    public: true,
  },
  {
    id: "may-bos-assist",
    period: "2026-05",
    title: "BOS Assist",
    description: "Human-in-the-loop assist for routing, drafting, and review.",
    dateConfidence: "month",
    evidenceNote: "release-history §May — BOS operational assist",
    public: true,
  },

  // ── June 2026 ────────────────────────────────────────────────────────────
  {
    id: "jun-bp",
    period: "2026-06",
    title: "Business Processes V1",
    description: "Stages, requirements, decisions, outcomes, and next steps.",
    dateConfidence: "month",
    evidenceNote: "release-history §June — Business Processes V1",
    public: true,
  },
  {
    id: "jun-ops-enrollment",
    period: "2026-06",
    title: "Operational Enrollment",
    description: "Agreements, placements, and schedules as operational truth.",
    dateConfidence: "month",
    evidenceNote: "release-history §June — Childcare operational enrollment V1",
    public: true,
  },
  {
    id: "jun-reveal",
    period: "2026-06",
    title: "Workspace reveal",
    description: "Coordinated above-fold reveal so work surfaces load cleanly.",
    dateConfidence: "month",
    evidenceNote: "release-history §June — AdminV2 Pass 3",
    public: true,
  },
  {
    id: "jun-bos-identity",
    period: "2026-06",
    title: "BOS identity",
    description: "A clear visual identity for Alloy’s operational assistant.",
    dateConfidence: "month",
    evidenceNote: "release-history §June — BOS identity system",
    public: true,
  },
  {
    id: "jun-work-unit",
    period: "2026-06",
    title: "Work unit layout",
    description: "Queue-first work layout with a clear command rail.",
    dateConfidence: "month",
    evidenceNote: "release-history §June — Work unit layout V3 freeze",
    public: true,
  },

  // ── July 2026 ────────────────────────────────────────────────────────────
  {
    id: "jul-foundation",
    period: "2026-07",
    title: "Platform Foundation",
    description: "Foundational runtimes certified stable as one shared platform.",
    dateConfidence: "month",
    evidenceNote: "freeze-july-2026.md — Platform Stabilization Complete",
    public: true,
  },
  {
    id: "jul-presentation",
    period: "2026-07",
    title: "Presentation Runtime",
    description: "One presentation tree for workspace, queues, and focus.",
    dateConfidence: "month",
    evidenceNote: "release-history §July — Presentation Runtime finalized",
    public: true,
  },
  {
    id: "jul-focus",
    period: "2026-07",
    title: "Focus Panel",
    description: "Canonical record surface for current work and context.",
    dateConfidence: "month",
    evidenceNote: "release-history §July — Focus Panel / Current Work",
    public: true,
  },
  {
    id: "jul-processing",
    period: "2026-07",
    title: "Processing Workspace",
    description: "Incoming information becomes structured operational progress.",
    dateConfidence: "month",
    evidenceNote: "release-history §July — Processing canonical Digital Mailroom",
    public: true,
  },
  {
    id: "jul-comms-cc",
    period: "2026-07",
    title: "Communications Command Center",
    description: "Operational communications with identity at the center.",
    dateConfidence: "month",
    evidenceNote: "release-history §July — Communications Command Center",
    public: true,
  },
  {
    id: "jul-work-items",
    period: "2026-07",
    title: "Work Items",
    description: "Cross-record work connected to processes, processing, and communications.",
    dateConfidence: "month",
    evidenceNote: "release-history §July — Work Items V3",
    public: true,
  },
  {
    id: "jul-oi",
    period: "2026-07",
    title: "Operational Intelligence V1",
    description: "Questions, measurements, and answers across the operation.",
    dateConfidence: "month",
    evidenceNote: "OI Platform V1 Certified 2026-07-28",
    public: true,
  },
];

export const CAPABILITY_MATURITY: CapabilityMaturity[] = [
  { id: "mat-foundation", title: "Platform Foundation", maturity: "established", public: true },
  { id: "mat-bp", title: "Business Processes", maturity: "established", public: true },
  { id: "mat-processing", title: "Processing", maturity: "established", public: true },
  { id: "mat-docs", title: "Documents & Forms", maturity: "established", public: true },
  { id: "mat-automation", title: "Automation", maturity: "established", public: true },
  { id: "mat-comms", title: "Communications", maturity: "expanding", public: true },
  { id: "mat-oi", title: "Operational Intelligence", maturity: "expanding", public: true },
  { id: "mat-config", title: "Configuration", maturity: "expanding", public: true },
  { id: "mat-enrollment", title: "Enrollment Operations", maturity: "expanding", public: true },
  { id: "mat-bos", title: "BOS", maturity: "expanding", public: true },
  { id: "mat-billing", title: "Billing", maturity: "next", public: true },
  { id: "mat-payments", title: "Payments", maturity: "next", public: true },
  { id: "mat-attendance", title: "Attendance", maturity: "next", public: true },
  { id: "mat-scheduling", title: "Scheduling", maturity: "next", public: true },
  { id: "mat-staffing", title: "Staffing", maturity: "next", public: true },
];

export const BUILDING_NOW: BuildingNowItem[] = [
  {
    id: "build-financial",
    title: "Financial Operations",
    description:
      "Billing and payments connected to the same operational records and work — not a separate finance silo.",
    publicStatus: "In development",
    targetLabel: null,
    public: true,
  },
  {
    id: "build-oi",
    title: "Operational Intelligence",
    description:
      "Expanding how Answers and attention surface across more of the operation.",
    publicStatus: "Expanding",
    targetLabel: null,
    public: true,
  },
  {
    id: "build-config",
    title: "Configuration",
    description:
      "Adapting Alloy to each organization — processes, records, and operating surfaces — without rebuilding the system.",
    publicStatus: "Expanding",
    targetLabel: null,
    public: true,
  },
];

export const ROADMAP_DOMAINS: RoadmapDomain[] = [
  {
    id: "financial",
    title: "Financial Operations",
    items: ["Billing", "Payments"],
    public: true,
  },
  {
    id: "people",
    title: "People & Staffing",
    items: ["Staffing", "Scheduling", "Workforce Operations"],
    public: true,
  },
  {
    id: "daily",
    title: "Daily Operations",
    items: ["Attendance", "Capacity", "Location Operations"],
    public: true,
  },
  {
    id: "experience",
    title: "Experience",
    items: ["Family Experience", "Participant Experience"],
    public: true,
  },
  {
    id: "intelligence",
    title: "Intelligence",
    items: ["Reporting", "Analytics", "Deeper Operational Intelligence"],
    public: true,
  },
];

const PERIOD_META: Record<string, { label: string; sortKey: string }> = {
  "2026-Q1": { label: "Early 2026", sortKey: "2026-01" },
  "2026-04": { label: "Apr 2026", sortKey: "2026-04" },
  "2026-05": { label: "May 2026", sortKey: "2026-05" },
  "2026-06": { label: "Jun 2026", sortKey: "2026-06" },
  "2026-07": { label: "Jul 2026", sortKey: "2026-07" },
};

export function getEvolutionPeriods(): EvolutionPeriod[] {
  const map = new Map<string, RoadmapMilestone[]>();
  for (const milestone of ROADMAP_MILESTONES) {
    if (!milestone.public) continue;
    const list = map.get(milestone.period) ?? [];
    list.push(milestone);
    map.set(milestone.period, list);
  }

  return [...map.entries()]
    .map(([key, milestones]) => {
      const meta = PERIOD_META[key] ?? { label: key, sortKey: key };
      return { key, label: meta.label, sortKey: meta.sortKey, milestones };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function getMaturityByLane() {
  const publicItems = CAPABILITY_MATURITY.filter((item) => item.public);
  return {
    established: publicItems.filter((item) => item.maturity === "established"),
    expanding: publicItems.filter((item) => item.maturity === "expanding"),
    next: publicItems.filter((item) => item.maturity === "next"),
  };
}

export function getBuildingNowItems(): BuildingNowItem[] {
  return BUILDING_NOW.filter((item) => item.public);
}

export function getPublicDomains(): RoadmapDomain[] {
  return ROADMAP_DOMAINS.filter((domain) => domain.public);
}
