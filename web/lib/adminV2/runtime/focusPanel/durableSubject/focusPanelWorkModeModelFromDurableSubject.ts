/**
 * Producer: durable subject → FocusPanelWorkModeModel. The THIRD producer, and the first with no
 * queue behind it.
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
} from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCardReadiness,
    FocusPanelWorkModeModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import { derivePersonFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";

export type FocusPanelWorkModeFromDurablePersonInput = {
    mode: FocusPanelMode;
    subject: DurablePersonSubject;
    /** Whether this operator may mutate the record. Resolved by the caller, never assumed. */
    canMutate: boolean;
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
        capabilities: { canMutate, maskedChannels: false },
        status: "ready",
    };
}

export function focusPanelWorkModeModelFromDurablePerson(
    input: FocusPanelWorkModeFromDurablePersonInput,
): FocusPanelWorkModeModel {
    const { mode, subject, canMutate } = input;

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
        context: buildDurablePersonOperationalContext(subject, canMutate),
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
