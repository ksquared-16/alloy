/**
 * Milestones card blueprint — platform-owned Focus Panel card.
 *
 * Question answered: “What meaningful outcomes or committed future events exist
 * for this subject?”
 *
 * Rules:
 * - No manually invented milestone truth
 * - No duplicate persistence solely for presentation
 * - Activity remains full event history; Current Work remains what’s next
 * - Milestones summarize meaningful completed or committed operational facts
 * - Sources are registered adapters (process outcomes, tours, forms, agreements,
 *   placements, schedules, billing setup, required documents, …)
 * - Surface configuration selects types, order, grouping, max, labels, destinations
 *
 * Enrollment may supply a *reference composition* — the blueprint itself stays
 * industry-agnostic.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardLink } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";

/** Registered milestone type keys — adapters register; surfaces include. */
export type MilestoneTypeKey = string;

export type MilestoneTemporalBucket = "completed" | "upcoming" | "committed";

export type MilestoneScope = "household" | "child" | "person" | "process" | "record";

export type MilestoneFact = {
    id: string;
    typeKey: MilestoneTypeKey;
    label: string;
    /** ISO timestamp when known; null for undated committed facts. */
    at: string | null;
    bucket: MilestoneTemporalBucket;
    scope: MilestoneScope;
    /** Subject id within scope (child id, person id, process instance id). */
    subjectId?: string | null;
    /** Optional destination Focus Panel card via Card Links. */
    destinationCard?: FocusPanelCardKey | null;
    /** Opaque source owner key for audit (never duplicated for display). */
    sourceOwner: string;
};

export type MilestoneTypeDefinition = {
    typeKey: MilestoneTypeKey;
    defaultLabel: string;
    /** Adapter id that projects this type from operational owners. */
    adapterId: string;
    defaultDestinationCard?: FocusPanelCardKey | null;
};

export type MilestonesCardSurfaceConfig = {
    /** Included milestone type keys (order is display order within a group). */
    includedTypeKeys: MilestoneTypeKey[];
    /** Optional grouping key: "bucket" | "type" | "none". */
    grouping: "bucket" | "type" | "none";
    /** Max milestones shown before overflow. */
    maxDisplayed: number;
    /** Which temporal buckets to include. */
    buckets: MilestoneTemporalBucket[];
    /** Operator labels override per typeKey. */
    labels?: Partial<Record<MilestoneTypeKey, string>>;
    /** Destination card override per typeKey (Card Links). */
    destinationCards?: Partial<Record<MilestoneTypeKey, FocusPanelCardKey>>;
};

/** Platform registry of milestone type definitions (not Enrollment-hardcoded). */
export const MILESTONE_TYPE_REGISTRY: readonly MilestoneTypeDefinition[] = [
    {
        typeKey: "process.outcome",
        defaultLabel: "Process outcome",
        adapterId: "business_process_outcomes",
        defaultDestinationCard: "current_work",
    },
    {
        typeKey: "tour.booking",
        defaultLabel: "Tour",
        adapterId: "tour_bookings",
        defaultDestinationCard: "tour_summary",
    },
    {
        typeKey: "form.submitted",
        defaultLabel: "Form submitted",
        adapterId: "submitted_forms",
        defaultDestinationCard: "documents",
    },
    {
        typeKey: "agreement.signed",
        defaultLabel: "Agreement",
        adapterId: "agreements",
        defaultDestinationCard: "documents",
    },
    {
        typeKey: "placement.committed",
        defaultLabel: "Placement",
        adapterId: "placements",
        defaultDestinationCard: "scheduling",
    },
    {
        typeKey: "schedule.assigned",
        defaultLabel: "Schedule assigned",
        adapterId: "schedule_assignments",
        defaultDestinationCard: "scheduling",
    },
    {
        typeKey: "billing.setup",
        defaultLabel: "Billing setup",
        adapterId: "billing_setup",
        defaultDestinationCard: "billing_preview",
    },
    {
        typeKey: "document.required_complete",
        defaultLabel: "Required document",
        adapterId: "required_documents",
        defaultDestinationCard: "documents",
    },
] as const;

export const DEFAULT_MILESTONES_CARD_SURFACE_CONFIG: MilestonesCardSurfaceConfig = {
    includedTypeKeys: MILESTONE_TYPE_REGISTRY.map((row) => row.typeKey),
    grouping: "bucket",
    maxDisplayed: 8,
    buckets: ["upcoming", "committed", "completed"],
};

/**
 * Enrollment reference composition — example include-set only.
 * Does not hardcode the blueprint to Enrollment; other BPs may author their own.
 */
export const ENROLLMENT_MILESTONES_REFERENCE_COMPOSITION: MilestonesCardSurfaceConfig = {
    includedTypeKeys: [
        "tour.booking",
        "form.submitted",
        "placement.committed",
        "schedule.assigned",
        "agreement.signed",
        "billing.setup",
        "document.required_complete",
        "process.outcome",
    ],
    grouping: "bucket",
    maxDisplayed: 6,
    buckets: ["upcoming", "committed", "completed"],
    destinationCards: {
        "tour.booking": "tour_summary",
        "placement.committed": "scheduling",
        "schedule.assigned": "scheduling",
        "billing.setup": "billing_preview",
        "form.submitted": "documents",
        "agreement.signed": "documents",
        "document.required_complete": "documents",
        "process.outcome": "current_work",
    },
};

export type MilestonesCardVM = {
    facts: MilestoneFact[];
    overflowCount: number;
    answerLine: string;
};

/** Pure projector: filter/order/cap registered facts by surface config. */
export function projectMilestonesCardVM(args: {
    facts: readonly MilestoneFact[];
    config?: MilestonesCardSurfaceConfig | null;
}): MilestonesCardVM {
    const config = args.config ?? DEFAULT_MILESTONES_CARD_SURFACE_CONFIG;
    const typeOrder = new Map(config.includedTypeKeys.map((key, index) => [key, index]));
    const bucketSet = new Set(config.buckets);
    const filtered = args.facts
        .filter((fact) => typeOrder.has(fact.typeKey) && bucketSet.has(fact.bucket))
        .slice()
        .sort((a, b) => {
            const typeDelta = (typeOrder.get(a.typeKey) ?? 0) - (typeOrder.get(b.typeKey) ?? 0);
            if (typeDelta !== 0) return typeDelta;
            const atA = a.at ?? "";
            const atB = b.at ?? "";
            return atA.localeCompare(atB);
        });
    const visible = filtered.slice(0, Math.max(0, config.maxDisplayed));
    const overflowCount = Math.max(0, filtered.length - visible.length);
    const answerLine =
        filtered.length === 0
            ? "No milestones yet"
            : overflowCount > 0
              ? `${filtered.length} milestones · showing ${visible.length}`
              : `${filtered.length} milestone${filtered.length === 1 ? "" : "s"}`;
    return {
        facts: visible.map((fact) => ({
            ...fact,
            label: config.labels?.[fact.typeKey] ?? fact.label,
            destinationCard:
                config.destinationCards?.[fact.typeKey]
                ?? fact.destinationCard
                ?? null,
        })),
        overflowCount,
        answerLine,
    };
}

/** Build Card Links from projected milestones that declare a destination. */
export function milestoneCardLinksFromVm(
    vm: MilestonesCardVM,
    fromCard: FocusPanelCardKey = "milestones",
): FocusPanelCardLink[] {
    return vm.facts
        .filter((fact) => Boolean(fact.destinationCard))
        .map((fact) => ({
            id: `milestone:${fact.id}`,
            fromCard,
            toCard: fact.destinationCard!,
            fromFieldKey: fact.id,
            label: fact.label,
        }));
}
