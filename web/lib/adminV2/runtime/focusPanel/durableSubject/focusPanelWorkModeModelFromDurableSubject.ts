/**
 * Producers: durable subject → FocusPanelWorkModeModel. The THIRD producer family, and the first
 * with no queue behind it. One per durable grain (Person, Child); one shared model, one shared grid.
 *
 *     provisioning answer  ─┐
 *     settlement/drawer VM  ├─→  FocusPanelWorkModeModel  ─→  one grid + one set of card renderers
 *     durable subject      ─┘
 *
 * The grid does not learn about this producer. It reads `phase` (declared `settled` — the record is
 * fully composed the moment it is composed; nothing settles later), `subject.type` (already a plain
 * string on the platform contract), `cardModels` and `cardReadiness`. That the model contract was
 * written grain-agnostic ahead of a second subject is what makes this file small.
 *
 * ── WHAT IT REFUSES TO DO ──
 *
 * It supplies no `ProvisioningAnswer`, invents no `workUnit` / `activeWorkView` / `contextFrame`, and
 * fabricates no Opportunity. The case-shaped signal blocks are `NOT_APPLICABLE_CASE_SIGNALS` — read
 * that constant's docblock before assuming they are zeroes; they are safe here only because no
 * person-grain card reads them, which the registry enforces and the certification asserts directly.
 */

import {
    NOT_APPLICABLE_CASE_SIGNALS,
    type OperationalContext,
    type OperationalHostContext,
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCardReadiness,
    FocusPanelWorkModeModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import { derivePersonFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import { deriveChildFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import {
    DURABLE_CHILD_GRAIN,
    type DurableChildSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { deriveHouseholdFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveHouseholdFocusPanelCards";
import type { DurableChildStageWorkContextInput } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildStageWorkContextInput";
import {
    DURABLE_HOUSEHOLD_GRAIN,
    type DurableHouseholdSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableHouseholdSubjectModel";

export type FocusPanelWorkModeFromDurablePersonInput = {
    mode: FocusPanelMode;
    subject: DurablePersonSubject;
    /** Whether this operator may mutate the record. Resolved by the caller, never assumed. */
    canMutate: boolean;
    /**
     * Operational context, when a queue happens to hold this person's household case. ENRICHMENT
     * ONLY — see `OperationalContext.operationalHost`. Absent is ordinary: a staff member has no
     * household at all.
     */
    operationalHost?: OperationalHostContext | null;
};

/**
 * The person's `OperationalContext`.
 *
 * `businessProcess` is all-null and that is the honest answer, not a gap: a person is not in a
 * business process. The alternative — borrowing the household's enrollment stage — would put a
 * family's process state on a staff member's panel.
 */
export function buildDurablePersonOperationalContext(
    subject: DurablePersonSubject,
    canMutate: boolean,
    operationalHost: OperationalHostContext | null = null,
): OperationalContext {
    return {
        grain: "person",
        subject: { type: "person", id: subject.personId, label: subject.label },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth: subject.truth,
        signals: NOT_APPLICABLE_CASE_SIGNALS,
        // Person-owned employment, carried verbatim from `lib/employment`. Null is an ANSWER here
        // ("never employed"), not "not composed yet" — this producer has no later settlement pass.
        employment: subject.employment,
        operationalHost,
        capabilities: { canMutate, maskedChannels: false },
        status: "ready",
    };
}

export function focusPanelWorkModeModelFromDurablePerson(
    input: FocusPanelWorkModeFromDurablePersonInput,
): FocusPanelWorkModeModel {
    const { mode, subject, canMutate } = input;

    // The host does NOT participate in card derivation. Which cards a durable subject composes is a
    // property of the subject, not of whether a queue happens to be working its family — otherwise
    // the same record would show different cards depending on someone else's workflow state.
    const cardModels = derivePersonFocusPanelCards({ employment: subject.employment });

    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>();
    for (const [key, model] of cardModels) {
        // Same contract as every other settled producer: an inapplicable card KEEPS its cell and
        // renders muted. Nothing is `reserved` — there is no later pass that could fill it.
        cardReadiness.set(key, model.visible ? "ready" : "not_applicable");
    }

    return {
        source: "durable_subject",
        phase: "settled",
        mode,
        subject: { type: "person", id: subject.personId, label: subject.label },
        context: buildDurablePersonOperationalContext(subject, canMutate, input.operationalHost ?? null),
        cardModels,
        cardReadiness,
        // No commands in V1. Employment is authored elsewhere, and inventing a command surface here
        // would be a second execution path for capabilities that already have one.
        commands: [],
        title: subject.label,
        statusLabel: null,
        canMutate,
        perspective: null,
    };
}

// ── CHILD ────────────────────────────────────────────────────────────────────────────────────────

export type FocusPanelWorkModeFromDurableChildInput = {
    mode: FocusPanelMode;
    subject: DurableChildSubject;
    canMutate: boolean;
    /** Injected so the age label is deterministic; nothing reads the clock implicitly. */
    now: Date;
    /**
     * Operational context, when a queue happens to hold this child's family case. ENRICHMENT ONLY —
     * it may add meaning, and it may never change the child's identity or decide whether the record
     * exists. Absent is the ordinary case for a completed enrollment.
     */
    operationalHost?: OperationalHostContext | null;
};

/**
 * The child's `OperationalContext`.
 *
 * `businessProcess` is all-null even when an operational host exists. The host says a family case is
 * being worked somewhere; it does not tell this panel which stage the CHILD is at, and borrowing the
 * family's stage would put the household's process state on the child's identity record. Workstream E
 * decides what enrichment may truthfully say.
 */
/**
 * `businessProcess` WAS ALL-NULL HERE, AND THAT WAS THE LOSS.
 *
 * A child moved to Enrolling through the real Process carries an explicit `process_instances.
 * stage_key`, and this builder — the one the durable child record composes with — threw it away and
 * asserted the child had no process at all. Every card downstream that asks "which stage is this
 * subject at" then correctly answered "none", so a child with published stage work, a published
 * operating plan and a bound operator action had no surface that could render any of it.
 *
 * The rule the household path states still holds and is not weakened: a HOUSEHOLD with two
 * enrollments has two stages, so any single stage would be a claim about the family that is true of
 * at most one of its cases. A CHILD is the opposite — the child IS the participant, their stage is
 * theirs alone, and it is explicit. So the child may carry one and the household still may not.
 *
 * `stageWork` is optional and absent means absent: a child with no journey keeps exactly the
 * all-null shape this had before, rather than a fabricated process.
 */
export function buildDurableChildOperationalContext(
    subject: DurableChildSubject,
    canMutate: boolean,
    operationalHost: OperationalHostContext | null = null,
    stageWork?: DurableChildStageWorkContextInput | null,
): OperationalContext {
    const stageKey = stageWork?.stageKey?.trim() || null;
    return {
        grain: DURABLE_CHILD_GRAIN,
        subject: { type: "child", id: subject.memberId, label: subject.label },
        businessProcess: stageKey
            ? {
                  key: stageWork?.processKey?.trim() || null,
                  // The operator-facing process name is the published plan's, never this builder's.
                  label: stageWork?.processLabel?.trim() || null,
                  stageKey,
              }
            : { key: null, label: null, stageKey: null },
        perspective: null,
        /*
         * THE FAMILY THIS CHILD'S CONVERSATION BELONGS TO, under the key the platform already reads.
         *
         * `resolveFocusPanelMutationOpportunityId` resolves the record communications and registry
         * mutations key on, and it checks `child.family_opportunity_id` FIRST precisely because a
         * child-grain panel's subject is the child. Supplying it here is what lets the shared Current
         * Work host thread a message on the right family without anyone re-selecting one — and
         * without the action's subject moving off the child, which stays `customer_members.id`.
         *
         * Server-resolved from the participation. The browser never supplies it.
         */
        truth: stageWork?.familyOpportunityId?.trim()
            ? { ...subject.truth, "child.family_opportunity_id": stageWork.familyOpportunityId.trim() }
            : subject.truth,
        signals: NOT_APPLICABLE_CASE_SIGNALS,
        operationalHost,
        capabilities: { canMutate, maskedChannels: false },
        status: "ready",
        ...(stageWork?.stageWorkRuntime ? { stageWorkRuntime: stageWork.stageWorkRuntime } : {}),
        ...(stageWork?.publishedStageInputs
            ? { publishedStageInputs: stageWork.publishedStageInputs }
            : {}),
        /*
         * THE PARTICIPANT THIS PANEL IS ABOUT. On a case host this is a scope HINT over a family;
         * here the child IS the subject, so it is simply true — and it is what lets a child-grain
         * command (the Enrolling send) resolve its subject without the host re-deriving one.
         */
        ...(stageWork?.opportunityCustomerMemberId
            ? {
                  participantScope: {
                      participationId: stageWork.opportunityCustomerMemberId,
                      customerMemberId: subject.memberId,
                      personId: subject.personId,
                      displayName: subject.label,
                      imageUrl: null,
                      stageKey,
                      // The stage's operator-facing name is the published plan's; the scope carries
                      // the identity and lets whoever renders it ask configuration for the word.
                      stageLabel: stageWork?.stageLabel?.trim() || null,
                  },
              }
            : {}),
    };
}

export function focusPanelWorkModeModelFromDurableChild(
    input: FocusPanelWorkModeFromDurableChildInput,
): FocusPanelWorkModeModel {
    const { mode, subject, canMutate, now } = input;

    // As on the person path: the host never participates in card derivation.
    const cardModels = deriveChildFocusPanelCards({ subject, now });

    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>();
    for (const [key, model] of cardModels) {
        cardReadiness.set(key, model.visible ? "ready" : "not_applicable");
    }

    return {
        source: "durable_subject",
        phase: "settled",
        mode,
        subject: { type: "child", id: subject.memberId, label: subject.label },
        context: buildDurableChildOperationalContext(subject, canMutate, input.operationalHost ?? null),
        cardModels,
        cardReadiness,
        commands: [],
        title: subject.label,
        statusLabel: null,
        canMutate,
        perspective: null,
    };
}

// ── HOUSEHOLD ────────────────────────────────────────────────────────────────────────────────────

export type FocusPanelWorkModeFromDurableHouseholdInput = {
    mode: FocusPanelMode;
    subject: DurableHouseholdSubject;
    canMutate: boolean;
    /**
     * Operational context, when a queue happens to hold one of this family's cases. ENRICHMENT ONLY,
     * and the plural matters: a family can have several cases and the host names at most one of them,
     * so it may add "somewhere this family is being worked" and may never stand for the family.
     */
    operationalHost?: OperationalHostContext | null;
};

/**
 * The household's `OperationalContext`.
 *
 * `businessProcess` is all-null even when an operational host exists — the same rule the child and
 * person paths follow, and for a sharper reason here: a household with two enrollments has two stages,
 * so ANY single stage on this panel would be a claim about the family that is true of at most one of
 * its cases.
 *
 * The grain is `case` (see `DURABLE_HOUSEHOLD_GRAIN`) while the subject TYPE is `household`. That pair
 * is what lets the registry offer the Household card here and withhold the case-shaped ones.
 */
export function buildDurableHouseholdOperationalContext(
    subject: DurableHouseholdSubject,
    canMutate: boolean,
    operationalHost: OperationalHostContext | null = null,
): OperationalContext {
    return {
        grain: DURABLE_HOUSEHOLD_GRAIN,
        subject: { type: "household", id: subject.householdId, label: subject.label },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth: subject.truth,
        signals: NOT_APPLICABLE_CASE_SIGNALS,
        operationalHost,
        capabilities: { canMutate, maskedChannels: false },
        status: "ready",
    };
}

export function focusPanelWorkModeModelFromDurableHousehold(
    input: FocusPanelWorkModeFromDurableHouseholdInput,
): FocusPanelWorkModeModel {
    const { mode, subject, canMutate } = input;

    // As on the person and child paths: the host never participates in card derivation. Which cards a
    // family composes is a property of the family, not of whether someone is currently working one of
    // its enrollments.
    const cardModels = deriveHouseholdFocusPanelCards({ subject });

    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>();
    for (const [key, model] of cardModels) {
        cardReadiness.set(key, model.visible ? "ready" : "not_applicable");
    }

    return {
        source: "durable_subject",
        phase: "settled",
        mode,
        subject: { type: "household", id: subject.householdId, label: subject.label },
        context: buildDurableHouseholdOperationalContext(
            subject,
            canMutate,
            input.operationalHost ?? null,
        ),
        cardModels,
        cardReadiness,
        commands: [],
        title: subject.label,
        statusLabel: null,
        canMutate,
        perspective: null,
    };
}
