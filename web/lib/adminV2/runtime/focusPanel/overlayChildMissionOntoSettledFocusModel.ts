/**
 * Child Attention + family Settlement: keep Settlement chrome (household, children, billing)
 * from the family opportunity VM, but never let the family's persisted stage / Current Work
 * replace the focused child's published stage mission.
 *
 * Record of Attention = child (effective stage + stage Work Templates).
 * Record of Truth / Settlement = family opportunity.
 */

import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import { buildCurrentWorkCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { deriveChildIdentityCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { mergeSubjectIdentityTruthOntoSettled } from "@/lib/adminV2/runtime/focusPanel/mergeSubjectIdentityTruthOntoSettled";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function trimOrNull(value: unknown): string | null {
    const text = value != null ? String(value).trim() : "";
    return text || null;
}

/**
 * The focused child's own row inside the family's settled children collection, matched on the
 * member id — the identity of record for a child. It carries facts the child bindings do not,
 * notably `dob`.
 */
function inquiryChildRow(
    truth: Record<string, unknown>,
    memberId: string | null,
): Record<string, unknown> | null {
    if (!memberId) return null;
    const rows = truth._inquiry_children;
    if (!Array.isArray(rows)) return null;
    return (
        (rows as unknown[]).find(
            (row): row is Record<string, unknown> =>
                Boolean(row)
                && typeof row === "object"
                && trimOrNull((row as Record<string, unknown>).customer_member_id) === memberId,
        ) ?? null
    );
}

export function overlayChildMissionOntoSettledFocusModel(
    settled: FocusPanelWorkModeModel,
    commitCritical: FocusPanelCommitCriticalInput,
    options?: {
        /**
         * The child attention is CURRENTLY on. When it names a different child than the answer
         * this overlay was built from, the answer's mission is the PREVIOUS child's.
         */
        attentionSubjectId?: string | null;
    },
): FocusPanelWorkModeModel {
    const grain = commitCritical.subjectGrain?.grain;
    if (grain !== "child") return settled;

    /**
     * CHILD MISSION IS SUBJECT-SCOPED — it may never outlive its subject.
     *
     * The header now commits the new child's identity from the clicked row's canonical context, so
     * it moves at ~150ms while this answer still describes the child the operator just left. The
     * FAMILY cards (household, children, billing, assignments) are authoritative for the same
     * family and stay — they are not stale, they are shared. The two cards this overlay itself
     * produces are the child's own, and showing the previous child's What's Next under the new
     * child's name would assert something false about them.
     *
     * So exactly those cards go to the canonical reserve — the calm hold that keeps the cell's
     * geometry and shows the card's title while its detail settles. The panel is never blanked and
     * no family card is disturbed.
     */
    const attentionSubjectId = options?.attentionSubjectId?.trim() || null;
    const missionIsForAnotherChild =
        attentionSubjectId != null && attentionSubjectId !== commitCritical.subjectId;

    const stageWorkRuntime = commitCritical.stageWorkRuntime;
    const publishedStageInputs = commitCritical.publishedStageInputs;
    const situation = commitCritical.situation;

    const nextActionLabel = commitCritical.primaryAction?.label ?? null;
    const cardModels = new Map(settled.cardModels);
    cardModels.set(
        "current_work",
        buildCurrentWorkCardModel({
            stageWorkRuntime,
            nextActionLabel,
        }),
    );

    const cardReadiness = new Map(settled.cardReadiness);
    cardReadiness.set("current_work", "ready");

    const subjectType = commitCritical.subjectGrain?.subjectType ?? "child";
    const subjectLabel =
        (typeof commitCritical.subjectIdentityTruth?.["child.display_name"] === "string"
            ? String(commitCritical.subjectIdentityTruth["child.display_name"]).trim()
            : null) || settled.title;

    /**
     * `child_identity` — the card the CHILD composition asks for, produced on the lens path.
     *
     * The grid composes a non-case subject from `focusPanelSummaryDefaultDocForGrain`, and the child
     * composition's one card is `child_identity`. That key was only ever derived on the
     * subject-first durable path (`deriveChildFocusPanelCards`), which "arrives subject-first and
     * never through a lens". So on a child-grain Work View the cell composed correctly and had no
     * producer, resolving `visible: false` → `not_applicable`: an authored cell reading as
     * inapplicable purely because nothing could fill it (R-017).
     *
     * The same derivation is reused rather than reimplemented — one child card, two entry paths.
     * The subject is assembled from what the lens already carries: the child bindings for identity,
     * and the focused child's own row in the settled family collection for `dob`, which the
     * bindings do not include. A missing DOB is a state the card states honestly, not a failure.
     */
    const childMemberId = trimOrNull(commitCritical.subjectIdentityTruth?.["child.customer_member_id"]);
    const childRow = inquiryChildRow(settled.context.truth, childMemberId);
    const childSubject: DurableChildSubject = {
        memberId: childMemberId ?? commitCritical.subjectId,
        // Enrichment on the durable path, and not carried by the lens. Null is ordinary, not an error.
        personId: null,
        householdId: null,
        label: subjectLabel,
        dateOfBirth: trimOrNull(childRow?.dob),
        householdName: trimOrNull(commitCritical.subjectIdentityTruth?.["child.family_name"]),
        // A lens row exists because the child is in an operating cohort.
        isActive: true,
        truth: settled.context.truth,
    };
    cardModels.set("child_identity", deriveChildIdentityCard(childSubject, new Date()));
    cardReadiness.set("child_identity", "ready");

    const commands: ResolvedActionForClient[] = commitCritical.primaryAction
        ? [
              {
                  key: commitCritical.primaryAction.actionRef,
                  label: commitCritical.primaryAction.label,
                  description: null,
                  action_type: "workflow",
                  icon: null,
                  style: null,
                  display_style: "button",
                  payload: {},
                  workflow_id: null,
              },
          ]
        : settled.commands;

    /**
     * CHILD MISSION MAY NOT OUTLIVE ITS SUBJECT.
     *
     * The header commits the new child from canonical queue context at ~150ms while this answer
     * still describes the child the operator left. The FAMILY cards are authoritative for the same
     * family and stay — they are shared, not stale. The two cards this overlay itself produces are
     * the child's own, and showing the previous child's What's Next under the new child's name
     * would assert something false.
     *
     * The cells KEEP their entries so the grid keeps composing them — dropping an entry removes the
     * cell from its lane, which is a card vanishing and reappearing rather than a hold. Only
     * `current_work` is rebuilt EMPTY so it asserts nothing; `reserved` readiness is what the grid
     * reads, and it renders the calm titled hold in place. The panel is never blanked.
     */
    if (missionIsForAnotherChild) {
        cardModels.set(
            "current_work",
            buildCurrentWorkCardModel({ stageWorkRuntime: null, nextActionLabel: null }),
        );
        cardReadiness.set("current_work", "reserved");
        cardReadiness.set("child_identity", "reserved");
    }

    return {
        ...settled,
        subject: {
            id: commitCritical.subjectId,
            type: subjectType,
            label: subjectLabel,
        },
        context: {
            ...settled.context,
            grain: "child",
            subject: {
                type: subjectType,
                id: commitCritical.subjectId,
                label: subjectLabel,
            },
            businessProcess: {
                key: situation?.stageKey ?? settled.context.businessProcess.key,
                label: situation?.stageLabel ?? settled.context.businessProcess.label,
                stageKey: situation?.stageKey ?? settled.context.businessProcess.stageKey,
            },
            stageWorkRuntime,
            publishedStageInputs,
            signals: {
                ...settled.context.signals,
                work: {
                    ...settled.context.signals.work,
                    nextActionLabel,
                },
            },
            truth: {
                ...mergeSubjectIdentityTruthOntoSettled(
                    settled.context.truth,
                    commitCritical.subjectIdentityTruth,
                ),
                ...(stageWorkRuntime ? { _stage_work_runtime: stageWorkRuntime } : {}),
            },
        },
        cardModels,
        cardReadiness,
        // A stale answer's `subjectLabel` is the PREVIOUS child. The header already commits the new
        // child from queue context, so the model falls back to the family title rather than
        // asserting a child it can no longer speak for.
        title: missionIsForAnotherChild ? settled.title : subjectLabel,
        statusLabel: situation?.stageLabel ?? settled.statusLabel,
        commands,
    };
}
