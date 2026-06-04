import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import type {
    QueueRowPlacementPriorityV2Vm,
    QueueRowPlacementPriorityVm,
    QueueRowPlacementWaitlistCandidateVm,
} from "@/lib/ui-v2/workspace-types";
import type {
    EnrollmentHeaderAttentionInline,
    WaitlistHeaderInline,
} from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";
import {
    buildAttentionExpandedDetail,
    buildEnrollmentHeaderAttentionInline,
    buildEnrollmentHeaderSubline,
    buildWaitlistHeaderInlineFromCandidate,
    buildWaitlistHeaderInlineFromPlacement,
    buildWaitlistHeaderInlineFromV2,
    buildWaitlistHeaderSubline,
    shouldExpandAttentionBandFromDetail,
    waitlistCandidateNeedsExpandedBand,
} from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";

/** Shared band keys — lifecycle sections plug into `lifecycle` without new top-level bands. */
export type WorkUnitQueueRowBandKey =
    | "header"
    | "attention"
    | "lifecycle"
    | "people"
    | "facts"
    | "actions";

export type WorkUnitQueueRowLifecycleKey =
    | "enrollment"
    | "waitlist"
    | "tour_scheduling"
    | "enrolled"
    | "generic";

export type WorkUnitQueueRowPresentationInput = {
    slots: CrmCompactRowSemanticSlots;
    scanMode?: boolean;
    drawerRecordIconHandlers?: unknown;
    waitlistPlacementPreview?: QueueRowPlacementPriorityVm | null;
    waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm | null;
    waitlistCandidateRow?: QueueRowPlacementWaitlistCandidateVm | null;
    waitlistStatusLabel?: string | null;
    workUnitKey?: string | null;
};

export type WorkUnitQueueRowAttentionSection = {
    operationalRead: boolean;
    attentionReason: boolean;
    queuePriorityExplanation: boolean;
    operationalSummary: boolean;
    operationalNextHint: boolean;
    nextStep: boolean;
    childLifecycleSummary: boolean;
};

export type WorkUnitQueueRowLifecycleSection = {
    waitlistPlacement: boolean;
    waitlistCandidate: boolean;
    waitlistHouseholdContext: boolean;
};

export type WorkUnitQueueRowPresentationPlan = {
    lifecycle: WorkUnitQueueRowLifecycleKey;
    bands: WorkUnitQueueRowBandKey[];
    attention: WorkUnitQueueRowAttentionSection;
    lifecycleSections: WorkUnitQueueRowLifecycleSection;
    /** V3 — inline header context; attention/lifecycle bands only when expanded. */
    headerInline: {
        enrollmentAttention: EnrollmentHeaderAttentionInline | null;
        waitlist: WaitlistHeaderInline | null;
        /** Line 2 — reason + next step when not exceptionally expanded. */
        enrollmentSubline: string | null;
        /** Line 2 — waitlist priority / sibling / placement context. */
        waitlistSubline: string | null;
        attentionExpanded: boolean;
        lifecycleExpanded: boolean;
    };
    people: {
        /** Parent renders before children — identity/contact first, then child rows. */
        childrenFirst: boolean;
        parentCompact: boolean;
        childPrimary: boolean;
    };
};

function normalizeWorkUnitKey(raw: string | null | undefined): string {
    return (raw ?? "").trim().toLowerCase();
}

export function inferWorkUnitQueueRowLifecycleKey(input: {
    waitlistPlacementPreview?: QueueRowPlacementPriorityVm | null;
    waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm | null;
    waitlistCandidateRow?: QueueRowPlacementWaitlistCandidateVm | null;
    workUnitKey?: string | null;
}): WorkUnitQueueRowLifecycleKey {
    if (input.waitlistCandidateRow || input.waitlistPlacementPreview || input.waitlistPlacementV2) {
        return "waitlist";
    }
    const key = normalizeWorkUnitKey(input.workUnitKey);
    if (key.includes("waitlist")) return "waitlist";
    if (key.includes("tour")) return "tour_scheduling";
    if (key.includes("enrolled") || key.includes("attendance")) return "enrolled";
    if (key.includes("enrollment") || key.includes("needs_attention") || key.includes("pipeline")) {
        return "enrollment";
    }
    return "generic";
}

function buildAttentionSection(slots: CrmCompactRowSemanticSlots): WorkUnitQueueRowAttentionSection {
    const operationalRead = Boolean(slots.operationalReadPreview?.operationalRead?.trim());
    return {
        operationalRead,
        attentionReason: Boolean(slots.attentionReason?.trim()) && !operationalRead,
        queuePriorityExplanation: Boolean(slots.queuePriorityExplanation?.trim()),
        operationalSummary: Boolean(slots.operationalSummaryPreview?.headline?.trim()),
        operationalNextHint: Boolean(slots.operationalNextHint?.trim()),
        nextStep: Boolean(slots.nextStep?.trim()),
        childLifecycleSummary: Boolean(slots.childLifecycleSummary?.trim()),
    };
}

function attentionBandVisible(section: WorkUnitQueueRowAttentionSection): boolean {
    return (
        section.operationalRead ||
        section.attentionReason ||
        section.queuePriorityExplanation ||
        section.operationalSummary ||
        section.operationalNextHint ||
        section.nextStep ||
        section.childLifecycleSummary
    );
}

function buildLifecycleSection(
    lifecycle: WorkUnitQueueRowLifecycleKey,
    input: WorkUnitQueueRowPresentationInput
): WorkUnitQueueRowLifecycleSection {
    const { slots, waitlistCandidateRow, waitlistPlacementPreview, waitlistPlacementV2 } = input;
    const waitlistPlacement = Boolean(
        !waitlistCandidateRow && (waitlistPlacementV2 || waitlistPlacementPreview)
    );
    return {
        waitlistPlacement,
        waitlistCandidate: Boolean(waitlistCandidateRow),
        waitlistHouseholdContext:
            lifecycle === "waitlist" && Boolean(slots.waitlistHouseholdContext?.trim()),
    };
}

function lifecycleBandVisible(section: WorkUnitQueueRowLifecycleSection): boolean {
    return (
        section.waitlistPlacement ||
        section.waitlistCandidate ||
        section.waitlistHouseholdContext
    );
}

function hasPeopleBandContent(slots: CrmCompactRowSemanticSlots): boolean {
    const groups = slots.crmFactGroups ?? [];
    if (groups.some((g) => g.kind === "contact" || g.kind === "children_programs")) return true;
    return Boolean(
        slots.contactDisplayName?.trim() ||
            slots.contactSnippet?.trim() ||
            slots.childrenLines?.length ||
            slots.childName?.trim()
    );
}

function hasFactsBandContent(slots: CrmCompactRowSemanticSlots): boolean {
    return (slots.crmFactGroups ?? []).some((g) => g.kind === "timing" || g.kind === "meta");
}

/** Resolve band order + lifecycle-specific section visibility — presentation only. */
export function resolveWorkUnitQueueRowPresentationPlan(
    input: WorkUnitQueueRowPresentationInput
): WorkUnitQueueRowPresentationPlan {
    const lifecycle = inferWorkUnitQueueRowLifecycleKey(input);
    const attention = buildAttentionSection(input.slots);
    const lifecycleSections = buildLifecycleSection(lifecycle, input);

    let enrollmentAttention: EnrollmentHeaderAttentionInline | null = null;
    let waitlistInline: WaitlistHeaderInline | null = null;
    if (lifecycle === "enrollment" || lifecycle === "generic") {
        enrollmentAttention = buildEnrollmentHeaderAttentionInline(input.slots);
    }
    if (lifecycle === "waitlist") {
        if (input.waitlistCandidateRow) {
            waitlistInline = buildWaitlistHeaderInlineFromCandidate(input.waitlistCandidateRow);
        } else if (input.waitlistPlacementV2) {
            waitlistInline = buildWaitlistHeaderInlineFromV2(input.waitlistPlacementV2);
        } else if (input.waitlistPlacementPreview) {
            waitlistInline = buildWaitlistHeaderInlineFromPlacement(input.waitlistPlacementPreview);
        }
    }

    const attentionDetail =
        (lifecycle === "enrollment" || lifecycle === "generic") && enrollmentAttention
            ? buildAttentionExpandedDetail(input.slots, enrollmentAttention)
            : null;

    const attentionExpanded =
        attentionDetail != null &&
        attentionBandVisible(attention) &&
        shouldExpandAttentionBandFromDetail(attentionDetail);

    const enrollmentSubline =
        attentionDetail != null
            ? buildEnrollmentHeaderSubline(attentionDetail, attentionExpanded)
            : null;

    let waitlistSubline: string | null = null;
    if (lifecycle === "waitlist" && waitlistInline) {
        waitlistSubline = buildWaitlistHeaderSubline(
            waitlistInline,
            input.waitlistCandidateRow ?? null
        );
    }

    const lifecycleExpanded =
        lifecycleBandVisible(lifecycleSections) &&
        lifecycle === "waitlist" &&
        Boolean(input.waitlistCandidateRow && waitlistCandidateNeedsExpandedBand(input.waitlistCandidateRow)) &&
        !waitlistSubline;

    const bands: WorkUnitQueueRowBandKey[] = ["header"];
    if (attentionExpanded) bands.push("attention");
    if (lifecycleExpanded) bands.push("lifecycle");
    if (hasPeopleBandContent(input.slots)) bands.push("people");
    if (hasFactsBandContent(input.slots)) bands.push("facts");
    bands.push("actions");

    return {
        lifecycle,
        bands,
        attention,
        lifecycleSections,
        headerInline: {
            enrollmentAttention,
            waitlist: waitlistInline,
            enrollmentSubline,
            waitlistSubline,
            attentionExpanded,
            lifecycleExpanded,
        },
        people: {
            childrenFirst: false,
            parentCompact: true,
            childPrimary: lifecycle === "enrollment" || lifecycle === "generic",
        },
    };
}

export function workUnitQueueRowBandDataAttribute(plan: WorkUnitQueueRowPresentationPlan): string {
    return plan.bands.join(",");
}

/** Operational record frame — scan rows with doctrine fact groups + drawer icons. */
export function shouldUseOperationalRecordFrame(input: WorkUnitQueueRowPresentationInput): boolean {
    if (!input.scanMode || !input.drawerRecordIconHandlers) return false;
    if (input.waitlistCandidateRow || input.waitlistPlacementPreview || input.waitlistPlacementV2) {
        return true;
    }
    if (input.slots.crmFactGroups != null) {
        const hasPeople = input.slots.crmFactGroups.some(
            (g) => g.kind === "contact" || g.kind === "children_programs"
        );
        if (hasPeople) return true;
    }
    return attentionBandVisible(buildAttentionSection(input.slots));
}
