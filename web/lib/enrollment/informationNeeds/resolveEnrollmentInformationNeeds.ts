/**
 * Resolve the unique participant information needs for one Enrollment objective.
 *
 * The chain, reusing the owner of each link:
 *
 * ```
 *   resolveEnrollmentParticipantProgress   (Slice 2.3: pinned revision -> effective requirements)
 *     -> only SATISFIABLE realized form requirements
 *     -> each occurrence's D-94 resolved_form_definition_version_id
 *     -> THAT version's schema_json                      (never the definition's latest)
 *     -> projectEnrollmentInformationNeeds               (the ask-once collapse)
 *     -> shared_values + session metadata confirmations   (D-99)
 * ```
 *
 * READ ONLY, like the progress resolver it builds on.
 *
 * ## Only effective requirements contribute
 *
 * The requirement set comes from Slice 2.3, which reads the PINNED revision. A Form that exists in
 * configuration but is not an effective requirement of this objective adds no question to the
 * parent's list, and republishing the Business Process cannot change the list for a running journey.
 *
 * ## An unrealized requirement fabricates nothing
 *
 * Slice 2.3 reports a BP-required Form the packet does not contain as `unrealized`, and that is the
 * truthful place for it. There is no pinned version and no schema, so there is nothing to derive
 * needs from — inventing questions for a Form that does not exist in the participant's packet would
 * be worse than the gap it papers over. Requirement-level progress keeps reporting it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { safeParseFormSchema } from "@/lib/forms/schema";
import {
    resolveEnrollmentParticipantProgress,
    type EnrollmentParticipantProgressResult,
} from "@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress";
import type { EnrollmentParticipantProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import { readEnrollmentNeedConfirmations } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import {
    projectEnrollmentInformationNeeds,
    type PinnedRequirementForm,
} from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    summarizeEnrollmentInformationNeeds,
    type EnrollmentInformationNeeds,
} from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

export type EnrollmentInformationNeedsRefusal =
    | { readonly code: "process_instance_not_found"; readonly detail: string }
    | { readonly code: "read_failed"; readonly detail: string };

export type EnrollmentInformationNeedsResult =
    | { readonly ok: true; readonly value: EnrollmentInformationNeeds }
    | { readonly ok: false; readonly refusal: EnrollmentInformationNeedsRefusal };

type SessionRow = {
    id: string;
    subject_id?: string | null;
    shared_values: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
};

type SessionItemRow = {
    id: string;
    packet_item_id: string;
    resolved_form_definition_version_id: string | null;
};

export async function resolveEnrollmentInformationNeeds(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        processInstanceId: string;
        /**
         * Canonical keys this objective requires the participant to CONFIRM rather than silently
         * accept. Explicit and narrow: no repository-wide assurance framework exists, and the caller
         * naming its policy is honest where inventing one would not be.
         */
        requiresConfirmation?: ReadonlySet<string>;
        /** Canonical record prefill by shared key. Lower precedence than session shared values. */
        canonicalValues?: Readonly<Record<string, unknown>>;
        /**
         * An already-resolved progress projection.
         *
         * The objective resolver computes progress and needs "in parallel", but needs BEGINS by
         * computing progress itself — so every participant turn resolved the pinned revision, the
         * session and its items twice, and the second copy was pure duplicate latency. Passing the
         * first one in removes it. Optional, so every other caller is unchanged.
         */
        progress?: EnrollmentParticipantProgressResult;
    },
): Promise<EnrollmentInformationNeedsResult> {
    const progress =
        input.progress ??
        (await resolveEnrollmentParticipantProgress(supabase, {
            orgId: input.orgId,
            processInstanceId: input.processInstanceId,
        }));
    if (!progress.ok) return { ok: false, refusal: progress.refusal };

    const { value: prog } = progress;
    if (!prog.session_id) {
        // No participant objective launched yet. Requirements still project at the progress level;
        // there is simply nothing realized to derive needs from.
        return {
            ok: true,
            value: {
                process_instance_id: prog.process_instance_id,
                session_id: null,
                business_process_revision_id: prog.business_process_revision_id,
                stage_key: prog.stage_key,
                subject_id: null,
                total_needs: 0,
                needs_requiring_action: 0,
                needs: [],
            },
        };
    }

    const [{ data: sessionData, error: sessionError }, { data: instanceData }] = await Promise.all([
        supabase
            .from("form_packet_sessions")
            .select("id, shared_values, metadata")
            .eq("id", prog.session_id)
            .eq("org_id", input.orgId)
            .maybeSingle(),
        supabase
            .from("process_instances")
            .select("subject_id")
            .eq("id", prog.process_instance_id)
            .eq("org_id", input.orgId)
            .maybeSingle(),
    ]);
    if (sessionError) {
        return { ok: false, refusal: { code: "read_failed", detail: sessionError.message } };
    }
    const session = (sessionData ?? null) as SessionRow | null;
    const subjectId =
        String((instanceData as { subject_id?: string | null } | null)?.subject_id ?? "").trim() || null;

    // Only requirements the participant can actually act on. `unrealized` has no pinned version and
    // no schema; `unsupported` is a non-form kind. Neither can produce a field need.
    const actionable = prog.requirements.filter(
        (r: EnrollmentParticipantProgress["requirements"][number]) =>
            r.kind === "form" && (r.status === "outstanding" || r.status === "satisfied"),
    );
    if (actionable.length === 0 || !session) {
        return {
            ok: true,
            value: {
                process_instance_id: prog.process_instance_id,
                session_id: prog.session_id,
                business_process_revision_id: prog.business_process_revision_id,
                stage_key: prog.stage_key,
                subject_id: subjectId,
                total_needs: 0,
                needs_requiring_action: 0,
                needs: [],
            },
        };
    }

    const { data: itemRows } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_item_id, resolved_form_definition_version_id")
        .eq("packet_session_id", session.id)
        .order("sequence_index", { ascending: true });
    const items = (itemRows ?? []) as SessionItemRow[];

    // The D-94 pin is the ONLY version consulted. A newer published version of the same form does
    // not reach an in-flight session, and asking this query for "latest" would silently undo that.
    const versionIds = [
        ...new Set(items.map((i) => i.resolved_form_definition_version_id).filter(Boolean)),
    ] as string[];
    const packetItemIds = [...new Set(items.map((i) => i.packet_item_id).filter(Boolean))];

    const [versionsResult, packetItemsResult] = await Promise.all([
        versionIds.length
            ? supabase
                  .from("form_definition_versions")
                  .select("id, form_definition_id, schema_json")
                  .eq("org_id", input.orgId)
                  .in("id", versionIds)
            : Promise.resolve({ data: [], error: null }),
        packetItemIds.length
            ? supabase
                  .from("form_packet_items")
                  .select("id, form_definition_id")
                  .eq("org_id", input.orgId)
                  .in("id", packetItemIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const versionById = new Map<string, { form_definition_id: string; schema_json: unknown }>();
    for (const row of (versionsResult.data ?? []) as {
        id: string;
        form_definition_id: string;
        schema_json: unknown;
    }[]) {
        versionById.set(String(row.id), {
            form_definition_id: String(row.form_definition_id),
            schema_json: row.schema_json,
        });
    }
    const formByPacketItem = new Map<string, string>();
    for (const row of (packetItemsResult.data ?? []) as { id: string; form_definition_id: string }[]) {
        formByPacketItem.set(String(row.id), String(row.form_definition_id));
    }

    const requirementByForm = new Map<string, string>();
    for (const requirement of actionable) requirementByForm.set(requirement.artifact.id, requirement.requirement_id);

    const forms: PinnedRequirementForm[] = [];
    for (const item of items) {
        const versionId = item.resolved_form_definition_version_id;
        // A session item predating D-94 has no recoverable version. Its bindings cannot be read
        // truthfully, and reading the latest version instead would be exactly the drift D-94 removed.
        if (!versionId) continue;
        const version = versionById.get(versionId);
        if (!version) continue;

        const formDefinitionId = formByPacketItem.get(item.packet_item_id) ?? version.form_definition_id;
        const requirementId = requirementByForm.get(formDefinitionId);
        // Realized but not required by the governing revision: it adds no question to this objective.
        if (!requirementId) continue;

        // Lenient parse: an unreadable schema yields no needs rather than failing the whole
        // objective. A participant blocked from seeing ANY of their remaining work because one form
        // is malformed is a worse failure than a short list.
        const parsed = safeParseFormSchema(version.schema_json);
        if (!parsed.success) continue;
        const schema = parsed.data;

        forms.push({
            requirement_id: requirementId,
            form_definition_id: formDefinitionId,
            form_definition_version_id: versionId,
            session_item_id: item.id,
            schema,
        });
    }

    const needs = projectEnrollmentInformationNeeds({
        forms,
        subjectId,
        sharedValues: (session.shared_values ?? {}) as Record<string, unknown>,
        canonicalValues: input.canonicalValues,
        confirmations: readEnrollmentNeedConfirmations(session.metadata),
        requiresConfirmation: input.requiresConfirmation,
    });

    return {
        ok: true,
        value: {
            process_instance_id: prog.process_instance_id,
            session_id: session.id,
            business_process_revision_id: prog.business_process_revision_id,
            stage_key: prog.stage_key,
            subject_id: subjectId,
            ...summarizeEnrollmentInformationNeeds(needs),
            needs,
        },
    };
}
