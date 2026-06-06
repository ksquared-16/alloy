/**
 * Layout V2 — read-only adapter: placement waitlist projection → card VM.
 *
 * Maps the EXISTING projection VM (`QueueRowPlacementWaitlistCandidateVm`,
 * produced by the live placement runtime) into the presentation-only
 * {@link WaitlistCandidateCardVM}. It is PURE and computes nothing: tier,
 * position, cohort, and override values are passed through verbatim from the
 * runtime. Optional joins the projection doesn't carry (age, phone, email,
 * location name, program name) remain undefined. See plan §2/§3.
 *
 * The type import is type-only — no live runtime code is pulled in.
 */

import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";
import type { WaitlistCandidateCardVM } from "./waitlistCandidateCardVm";

/** Optional joined display values the projection VM does not carry today. */
export type WaitlistCardVmExtras = {
    householdId?: string;
    childId?: string;
    /** Candidate `desired_start_date` (not carried by the projection VM today). */
    desiredStartDate?: string;
    /** Candidate lifecycle/status label (waitlisted / offer_pending / …). */
    status?: string;
    child?: { ageLabel?: string; birthdate?: string; programLabel?: string; schedulePreference?: string };
    household?: { phone?: string; email?: string; locationName?: string };
    /** Capability flags; default to enabled (simulated) in proof. */
    capabilities?: Partial<WaitlistCandidateCardVM["actions"]>;
    /** Opaque widget payloads supplied by the runtime (priority trace, etc.). */
    widgets?: Partial<WaitlistCandidateCardVM["widgets"]>;
};

const trimOrUndef = (v: string | null | undefined): string | undefined => {
    const s = (v ?? "").trim();
    return s ? s : undefined;
};

const DEFAULT_CAPS: WaitlistCandidateCardVM["actions"] = {
    canOpen: true,
    canMessage: true,
    canCreateOffer: true,
    canOverride: true,
    canAdjustPosition: true,
    canAskBos: true,
};

/**
 * Adapt a placement projection VM (+ optional joined extras) into the card VM.
 * Preserves runtime-computed tier/position/override values verbatim.
 */
export function placementCandidateVmToCardVm(
    row: QueueRowPlacementWaitlistCandidateVm,
    extras: WaitlistCardVmExtras = {},
): WaitlistCandidateCardVM {
    const kinds = row.activeOverrideKinds ?? [];
    return {
        candidateId: row.placementCandidateId,
        opportunityId: row.opportunityId,
        householdId: extras.householdId,
        childId: extras.childId,
        isSyntheticFallback: Boolean(row.isSyntheticFallback),

        child: {
            name: row.childDisplayName,
            ageLabel: trimOrUndef(extras.child?.ageLabel),
            birthdate: trimOrUndef(extras.child?.birthdate),
            programLabel: trimOrUndef(extras.child?.programLabel) ?? trimOrUndef(row.cohortLabel),
            desiredStartDate: trimOrUndef(extras.desiredStartDate),
            schedulePreference: trimOrUndef(extras.child?.schedulePreference),
        },

        household: {
            name: trimOrUndef(row.familyDisplayName),
            primaryContactName: trimOrUndef(row.parentDisplayName),
            phone: trimOrUndef(extras.household?.phone),
            email: trimOrUndef(extras.household?.email),
            locationName: trimOrUndef(extras.household?.locationName),
        },

        waitlist: {
            cohortKey: row.cohortKey,
            cohortLabel: trimOrUndef(row.cohortLabel),
            cohortSectionTitle: trimOrUndef(row.cohortSectionTitle),
            // tier/position are RUNTIME-COMPUTED — passed through, never derived here.
            tierLabel: trimOrUndef(row.bucketLabel),
            positionLabel: trimOrUndef(row.runtimePositionLabel),
            positionMode: row.runtimePositionMode,
            positionHelp: trimOrUndef(row.runtimePositionHelp) ?? trimOrUndef(row.runtimePositionPrecedenceNote),
            waitSince: trimOrUndef(row.waitSinceLabel),
            desiredStartDate: trimOrUndef(extras.desiredStartDate),
            status: trimOrUndef(extras.status),
            shadowMode: Boolean(row.shadowMode),
            linkModeLabel: trimOrUndef(row.linkModeLabel),
            siblingContextLines: row.siblingContextLines?.length ? row.siblingContextLines : undefined,
        },

        overrides: {
            hasActive: Boolean(row.hasActiveOverride),
            kinds,
            pinned: kinds.includes("pin"),
            tierBoost: kinds.includes("tier_boost"),
            temporary: kinds.includes("temporary"),
            manuallyAdjusted: Boolean(row.hasManualPositionAdjustment),
            reason: trimOrUndef(row.manualAdjustmentReason) ?? trimOrUndef(row.activeOverrides?.[0]?.reason),
        },

        actions: { ...DEFAULT_CAPS, ...(extras.capabilities ?? {}) },
        widgets: { ...(extras.widgets ?? {}) },
    };
}
