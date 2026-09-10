/**
 * Every form submission a Processing case actually rests on, in the order a family filled them.
 *
 * ## Why this exists at all
 *
 * A case's evidence, its recommendation and its commit each need the same answer to the same
 * question — "which submissions is this case made of?" — and each of them used to answer it
 * separately. That was harmless while a case meant one form. A packet case means several, and the
 * three answers immediately disagreed: the evidence panel fanned out over the packet's steps, the
 * recommendation route refused any source that was not a bare `form_submission`, and the proposal
 * loader skipped packet sources with a `continue`, so a packet's proposals could be SHOWN and never
 * committed.
 *
 * So the enumeration is one function, and the packet is what it always was underneath — an ordered
 * list of form submissions. Nothing downstream needs a packet-shaped code path; it needs this list.
 *
 * ## Independently, never aggregated
 *
 * Each entry is one submission with its own version, its own step and its own form. Callers map
 * them ONE AT A TIME through the existing adapter. Merging the payloads first and mapping the merge
 * would silently pick a winner for every field two forms both ask for — which is exactly the
 * question an operator is supposed to be shown, not one a loader is allowed to answer.
 *
 * Read only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CaseFormSubmissionSource = {
    submissionId: string;
    /** Present when the submission was completed inside a packet. */
    packetSessionId: string | null;
    /** Position within the packet, as authored. Null for a standalone submission. */
    stepIndex: number | null;
    formDefinitionId: string | null;
    /** The version the submission is pinned to — its own, never the form's latest. */
    formDefinitionVersionId: string | null;
    formName: string | null;
    /** The case-source row this came from, so callers can re-state what they acted on. */
    caseSource: { source_kind: string; source_id: string };
};

type CaseSourceRow = { source_kind: string; source_id: string; role?: string | null };

/**
 * @param caseId the Processing case
 * @returns ordered submissions; packet steps in authored order, standalone sources after
 */
export async function listCaseFormSubmissionSources(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
): Promise<CaseFormSubmissionSource[]> {
    const { data: sources, error: sourcesError } = await supabase
        .from("processing_case_sources")
        .select("source_kind, source_id, role")
        .eq("org_id", orgId)
        .eq("processing_case_id", caseId);
    if (sourcesError) throw new Error(sourcesError.message);
    const sourceRows = (sources ?? []) as CaseSourceRow[];

    /*
     * Packet sessions expand into their steps. `sequence_index` is the authored order, which is the
     * order the family saw and therefore the only order an operator can reconcile against.
     */
    const packetSessionIds = sourceRows
        .filter((s) => s.source_kind === "form_packet_session")
        .map((s) => s.source_id);

    type Pending = { submissionId: string; packetSessionId: string | null; stepIndex: number | null; caseSource: CaseSourceRow };
    const pending: Pending[] = [];

    if (packetSessionIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
            .from("form_packet_session_items")
            .select("packet_session_id, sequence_index, form_submission_id")
            .eq("org_id", orgId)
            .in("packet_session_id", packetSessionIds)
            .order("sequence_index", { ascending: true });
        if (itemsError) throw new Error(itemsError.message);
        for (const item of (items ?? []) as {
            packet_session_id: string;
            sequence_index: number | null;
            form_submission_id: string | null;
        }[]) {
            // A step the family has not reached yet has no submission and is not evidence of
            // anything. It is simply absent rather than an empty proposal.
            if (!item.form_submission_id) continue;
            const caseSource = sourceRows.find(
                (s) => s.source_kind === "form_packet_session" && s.source_id === item.packet_session_id,
            );
            if (!caseSource) continue;
            pending.push({
                submissionId: item.form_submission_id,
                packetSessionId: item.packet_session_id,
                stepIndex: item.sequence_index ?? null,
                caseSource,
            });
        }
    }

    for (const source of sourceRows) {
        if (source.source_kind !== "form_submission") continue;
        // A submission attached both directly and through a packet is one submission.
        if (pending.some((p) => p.submissionId === source.source_id)) continue;
        pending.push({ submissionId: source.source_id, packetSessionId: null, stepIndex: null, caseSource: source });
    }

    if (pending.length === 0) return [];

    const submissionIds = [...new Set(pending.map((p) => p.submissionId))];
    const { data: subs, error: subsError } = await supabase
        .from("form_submissions")
        .select("id, form_definition_id, form_definition_version_id")
        .eq("org_id", orgId)
        .in("id", submissionIds);
    if (subsError) throw new Error(subsError.message);
    const subById = new Map(
        ((subs ?? []) as { id: string; form_definition_id: string | null; form_definition_version_id: string | null }[]).map(
            (s) => [s.id, s],
        ),
    );

    const definitionIds = [
        ...new Set(
            [...subById.values()].map((s) => s.form_definition_id).filter((x): x is string => Boolean(x)),
        ),
    ];
    const nameByDefinition = new Map<string, string>();
    if (definitionIds.length > 0) {
        const { data: defs, error: defsError } = await supabase
            .from("form_definitions")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", definitionIds);
        if (defsError) throw new Error(defsError.message);
        for (const d of (defs ?? []) as { id: string; name: string | null }[]) {
            if (d.name) nameByDefinition.set(d.id, d.name);
        }
    }

    return pending.flatMap((p) => {
        const sub = subById.get(p.submissionId);
        // A source pointing at a submission this org cannot read is not silently treated as empty.
        if (!sub) return [];
        return [
            {
                submissionId: p.submissionId,
                packetSessionId: p.packetSessionId,
                stepIndex: p.stepIndex,
                formDefinitionId: sub.form_definition_id,
                formDefinitionVersionId: sub.form_definition_version_id,
                formName: sub.form_definition_id ? (nameByDefinition.get(sub.form_definition_id) ?? null) : null,
                caseSource: { source_kind: p.caseSource.source_kind, source_id: p.caseSource.source_id },
            },
        ];
    });
}
