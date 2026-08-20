/**
 * Resolve the canonical Enrollment participant progress for one running journey.
 *
 * The whole chain, in one place, reusing the owner of each link rather than re-deriving it:
 *
 * ```
 *   process_instance
 *     -> resolveProcessInstanceConfiguration   (D-96: pinned revision, or the ONE compat branch)
 *     -> the instance's own stage_key
 *     -> canonicalStageRequirements            (D-97: the revision states them itself)
 *     -> resolveCurrentEnrollmentSession       (D-95: the anchored participant objective)
 *     -> form_submissions.status = 'submitted' (Forms owns the evidence)
 *     -> projectRequirementsProgress           (the pure join)
 * ```
 *
 * READ ONLY. Nothing here launches a session, and that is deliberate: a progress read that
 * materialized durable participant state would turn every incidental page load into a write and
 * would race the database's one-current-session guarantee. A journey with no session yet still
 * projects its requirements — all `unrealized`, which is the truthful answer and exactly what an
 * operator needs in order to send the packet.
 *
 * @see enrollmentParticipantProgressTypes.ts — the authority split
 * @see projectEnrollmentParticipantProgress.ts — the pure join and its rules
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import { resolveEffectiveStageKey } from "@/lib/lifecycle/processEntryStage";
import { entryIntentFromProcessInstanceMetadata } from "@/lib/lifecycle/processEntryPointsV1";
import { resolveCurrentEnrollmentSession } from "@/lib/pos/packet/enrollmentObjectiveSession";
import { resolveProcessInstanceConfiguration } from "@/lib/process/resolveProcessInstanceConfiguration";
import { departmentForOpportunityContext } from "@/lib/process/resolveEnrollmentBusinessProcessRevision";
import { PROCESS_INSTANCES_TABLE } from "@/lib/process/processInstances";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import {
    summarizeEnrollmentRequirementProgress,
    type EnrollmentParticipantProgress,
} from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import {
    projectRequirementsProgress,
    type RealizedSessionFormItem,
} from "@/lib/enrollment/participantProgress/projectEnrollmentParticipantProgress";

type ProcessInstanceRow = {
    id: string;
    org_id: string;
    process_key: string;
    context_type: string | null;
    context_id: string | null;
    stage_key: string | null;
    /** Provenance. Carries the D-103 entry intent this journey was created with. */
    metadata: unknown;
    business_process_revision_id: string | null;
};

type SessionItemRow = {
    id: string;
    packet_item_id: string;
    resolved_form_definition_version_id: string | null;
    form_submission_id: string | null;
};

export type EnrollmentParticipantProgressRefusal =
    | { readonly code: "process_instance_not_found"; readonly detail: string }
    | { readonly code: "read_failed"; readonly detail: string };

export type EnrollmentParticipantProgressResult =
    | { readonly ok: true; readonly value: EnrollmentParticipantProgress }
    | { readonly ok: false; readonly refusal: EnrollmentParticipantProgressRefusal };

/**
 * Which form each realized step renders, and whether its submission is complete.
 *
 * Two reads rather than one nested select: `form_packet_session_items` names a `packet_item_id`,
 * and the FORM identity lives on `form_packet_items`. Resolving that hop here — instead of trusting
 * the session item's own `status` column — is what keeps Forms the satisfaction authority. The
 * packet step's status is a useful index for a review rollup and is deliberately not read.
 */
async function loadRealizedFormItems(
    supabase: SupabaseClient,
    orgId: string,
    items: readonly SessionItemRow[],
): Promise<RealizedSessionFormItem[]> {
    if (items.length === 0) return [];

    const packetItemIds = [...new Set(items.map((i) => i.packet_item_id).filter(Boolean))];
    const submissionIds = [...new Set(items.map((i) => i.form_submission_id).filter(Boolean))] as string[];

    const [packetItemsResult, submissionsResult] = await Promise.all([
        packetItemIds.length
            ? supabase
                  .from("form_packet_items")
                  .select("id, form_definition_id")
                  .eq("org_id", orgId)
                  .in("id", packetItemIds)
            : Promise.resolve({ data: [], error: null }),
        submissionIds.length
            ? supabase
                  .from("form_submissions")
                  .select("id, status")
                  .eq("org_id", orgId)
                  .in("id", submissionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const formByPacketItem = new Map<string, string>();
    for (const row of (packetItemsResult.data ?? []) as { id: string; form_definition_id: string }[]) {
        formByPacketItem.set(String(row.id), String(row.form_definition_id ?? ""));
    }
    const statusBySubmission = new Map<string, string>();
    for (const row of (submissionsResult.data ?? []) as { id: string; status: string }[]) {
        statusBySubmission.set(String(row.id), String(row.status ?? ""));
    }

    const out: RealizedSessionFormItem[] = [];
    for (const item of items) {
        const formDefinitionId = formByPacketItem.get(item.packet_item_id);
        // A step whose packet item cannot be resolved renders no known form, so it realizes no
        // requirement. Dropping it here is right; inventing an identity for it would be a guess.
        if (!formDefinitionId) continue;
        out.push({
            session_item_id: item.id,
            form_definition_id: formDefinitionId,
            resolved_form_definition_version_id: item.resolved_form_definition_version_id,
            form_submission_id: item.form_submission_id,
            submission_status: item.form_submission_id
                ? (statusBySubmission.get(item.form_submission_id) ?? null)
                : null,
        });
    }
    return out;
}

/**
 * What progress LOADED on the way to its projection — the session row, its items, the realized
 * form identities and the journey's subject. The needs resolver reads the same rows; handing them
 * over removes four duplicate query waves from every objective resolution.
 */
export type EnrollmentProgressLoaded = {
    readonly session: { id: string; shared_values?: unknown; metadata?: unknown } | null;
    readonly items: readonly SessionItemRow[];
    readonly formBySessionItem: ReadonlyMap<string, string>;
    readonly subjectId: string | null;
};

export async function resolveEnrollmentParticipantProgress(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        /** Receives the loaded rows on the success path, for callers that read them next. */
        captureLoaded?: (loaded: EnrollmentProgressLoaded) => void;
    },
): Promise<EnrollmentParticipantProgressResult> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id, org_id, process_key, subject_id, context_type, context_id, stage_key, metadata, business_process_revision_id")
        .eq("id", input.processInstanceId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (error) return { ok: false, refusal: { code: "read_failed", detail: error.message } };
    if (!data) {
        return {
            ok: false,
            refusal: {
                code: "process_instance_not_found",
                detail: "No Enrollment journey with that id in this organization.",
            },
        };
    }
    const instance = data as ProcessInstanceRow;

    // D-96. The pinned revision governs; an unpinned historical instance falls to the one
    // centralized compatibility branch. This module never repeats that decision — but the compat
    // branch does need a DEPARTMENT to read live configuration from, and an unpinned instance has
    // no revision to name one. The canonical route is the journey's own context
    // (`Org -> Department -> Work unit -> Record`, Gate 0B), reused rather than re-derived.
    //
    // Resolved only when unpinned: a pinned instance must not touch live configuration even to
    // locate it.
    const departmentId =
        instance.business_process_revision_id
            ? null
            : instance.context_type === "opportunity" && instance.context_id
              ? await departmentForOpportunityContext(supabase, input.orgId, instance.context_id)
              : null;

    // The pinned configuration and the anchored session depend only on the instance — one wave.
    const [configuration, sessionResolution] = await Promise.all([
        resolveProcessInstanceConfiguration({
            supabase,
            orgId: input.orgId,
            processInstance: instance,
            departmentId,
        }),
        resolveCurrentEnrollmentSession(supabase, {
            orgId: input.orgId,
            processInstanceId: instance.id,
        }),
    ]);

    /**
     * B1a. A journey that has not been moved yet has `stage_key = NULL` — process-start semantics
     * deliberately leave it there rather than stamping a position the execution graph never
     * produced. It is nonetheless governed by its process's DECLARED entry stage, and that is what
     * its requirements project from; otherwise a parent's objective would stay empty until an
     * operator happened to move them.
     *
     * A persisted stage always wins, because it is where the journey actually is.
     */
    const stageKey = resolveEffectiveStageKey({
        persistedStageKey: instance.stage_key,
        process: configuration.builder?.processes.find((p) => p.key === instance.process_key) ?? null,
        // D-103: the intent the journey was CREATED with, read from the provenance the insert helper
        // has always written. Never supplied by a caller — a reader that could choose the intent
        // could choose the stage, which is exactly the authority the decision moved to configuration.
        intent: entryIntentFromProcessInstanceMetadata((instance as { metadata?: unknown }).metadata),
    });
    // D-90 presence-is-authority, unchanged: an authored-empty section means the stage requires
    // nothing and yields a total of 0. An ABSENT section means the governing artifact says nothing
    // about this stage, which after D-97 normalization only happens for a revision published before
    // it — also nothing to project, and honestly so.
    const requirements: readonly StageRequirementV1[] = stageKey
        ? (canonicalStageRequirements(configuration.builder, stageKey, instance.process_key)
              ?.requirements ?? [])
        : [];

    const { session, items, error: sessionError } = sessionResolution;
    if (sessionError) {
        return { ok: false, refusal: { code: "read_failed", detail: sessionError.message } };
    }

    const realized = await loadRealizedFormItems(supabase, input.orgId, items as SessionItemRow[]);
    const projected = projectRequirementsProgress(requirements, realized);

    input.captureLoaded?.({
        session: (session ?? null) as EnrollmentProgressLoaded["session"],
        items: items as SessionItemRow[],
        formBySessionItem: new Map(realized.map((r) => [r.session_item_id, r.form_definition_id])),
        subjectId: String((instance as { subject_id?: string | null }).subject_id ?? "").trim() || null,
    });

    return {
        ok: true,
        value: {
            process_instance_id: instance.id,
            session_id: session?.id ?? null,
            business_process_revision_id: configuration.revisionId,
            stage_key: stageKey,
            ...summarizeEnrollmentRequirementProgress(projected),
            requirements: projected,
        },
    };
}
