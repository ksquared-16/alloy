import type { CreateLeadCommitRecord, CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type {
    CreateLeadCommitResolution,
    CreateLeadCommitResolutionState,
    CreateLeadHouseholdResolution,
    CreateLeadLeadResolution,
} from "@/lib/intake/resolve/commitOverlayTypes";
import {
    makeMatchCandidateId,
    resolutionStateFromConfidence,
} from "@/lib/intake/resolve/buildProposals";
import type {
    IntakeRecordResolutionCandidate,
    IntakeRecordResolutionProposal,
    IntakeRecordResolutionResult,
} from "@/lib/intake/resolve/types";

function proposalForCandidate(
    result: IntakeRecordResolutionResult,
    intakeCandidateId: string,
): IntakeRecordResolutionProposal | undefined {
    return result.proposals.find((p) => p.intake_candidate_id === intakeCandidateId);
}

function candidatesForIntakeCandidate(
    result: IntakeRecordResolutionResult,
    intakeCandidateId: string,
): IntakeRecordResolutionCandidate[] {
    return result.candidates.filter((c) => c.intake_candidate_id === intakeCandidateId);
}

function candidateByMatchId(
    result: IntakeRecordResolutionResult,
    matchId: string | undefined,
): IntakeRecordResolutionCandidate | undefined {
    if (!matchId) return undefined;
    return result.candidates.find((c) => c.candidate_id === matchId);
}

function buildRecordResolution(
    result: IntakeRecordResolutionResult,
    intakeCandidateId: string,
    entityType: "person" | "customer_member",
): CreateLeadCommitResolution | undefined {
    const proposal = proposalForCandidate(result, intakeCandidateId);
    if (!proposal) return undefined;

    const relatedCandidates = candidatesForIntakeCandidate(result, intakeCandidateId).filter(
        (c) => c.matched_entity_type === entityType || c.matched_entity_type === "customer_member",
    );
    const selected =
        candidateByMatchId(result, proposal.selected_match_id) ??
        relatedCandidates.find((c) => c.matched_entity_type === entityType) ??
        relatedCandidates[0];

    const action = proposal.action;
    const confidence = proposal.confidence;
    const state = resolutionStateFromConfidence(confidence, action);

    if (confidence === "no_match" && action === "create_new") {
        return {
            state: "new",
            action,
            confidence,
            reasons: proposal.reasons,
        };
    }

    return {
        state,
        action,
        confidence,
        linked_entity_type:
            selected?.matched_entity_type === "customer_member" ? "customer_member"
            : selected?.matched_entity_type === "person" ? "person"
            : undefined,
        linked_entity_id: selected?.matched_entity_id,
        match_display_name: selected?.match_display_name,
        candidate_match_id: selected?.candidate_id,
        reasons: proposal.reasons,
        blocking_conflicts: selected?.blocking_conflicts,
        candidates: relatedCandidates.length > 1 ? relatedCandidates : undefined,
    };
}

function applyResolutionToRecord(
    record: CreateLeadCommitRecord,
    result: IntakeRecordResolutionResult,
): CreateLeadCommitRecord {
    const resolution = buildRecordResolution(
        result,
        record.candidate_id,
        record.entity_type === "child" ? "customer_member" : "person",
    );
    if (!resolution) return record;

    const next: CreateLeadCommitRecord = { ...record, resolution };

    if (resolution.state === "conflict" || resolution.action === "reject") {
        next.include_in_commit = false;
        next.commit_blockers = [
            ...next.commit_blockers,
            resolution.reasons[0] ?? "Record resolution conflict — review required.",
        ];
        next.validation_state = "invalid";
    }

    return next;
}

/** Merge canonical resolution result into Create Lead commit selection defaults. */
export function applyResolutionToCommitSelection(
    selection: CreateLeadCommitSelection,
    result: IntakeRecordResolutionResult,
    householdId: string,
): CreateLeadCommitSelection {
    const parents = selection.parents.map((record) => applyResolutionToRecord(record, result));
    const children = selection.children.map((record) => applyResolutionToRecord(record, result));

    const householdProposal = proposalForCandidate(result, householdId);
    const householdCandidate = result.candidates.find(
        (c) => c.intake_entity_role === "household" && c.matched_entity_type === "customer",
    );
    let household_resolution: CreateLeadHouseholdResolution | undefined;
    if (householdProposal) {
        const action = householdProposal.action;
        const confidence = householdProposal.confidence;
        household_resolution = {
            state: resolutionStateFromConfidence(confidence, action),
            action,
            linked_customer_id: householdCandidate?.matched_entity_id,
            match_display_name: householdCandidate?.match_display_name,
            reasons: householdProposal.reasons,
        };
    }

    const leadProposal = result.proposals.find((p) => p.intake_candidate_id === `${householdId}:lead`);
    const leadCandidate = result.candidates.find((c) => c.matched_entity_type === "opportunity");
    let lead_resolution: CreateLeadLeadResolution | undefined;
    if (leadProposal) {
        const action = leadProposal.action;
        const confidence = leadProposal.confidence;
        lead_resolution = {
            state: resolutionStateFromConfidence(confidence, action),
            action,
            linked_opportunity_id:
                leadCandidate && leadCandidate.matched_entity_id !== "ambiguous" ?
                    leadCandidate.matched_entity_id
                :   undefined,
            reasons: leadProposal.reasons,
        };
    }

    return {
        ...selection,
        parents,
        children,
        household_resolution,
        lead_resolution,
    };
}

export function patchCreateLeadCommitResolution(
    selection: CreateLeadCommitSelection,
    candidateId: string,
    patch: {
        action: IntakeRecordResolutionProposal["action"];
        selected_match_id?: string;
    },
    resolutionResult?: IntakeRecordResolutionResult | null,
): CreateLeadCommitSelection {
    const mapRecord = (records: CreateLeadCommitRecord[]) =>
        records.map((record) => {
            if (record.candidate_id !== candidateId || !record.resolution) return record;
            const selected =
                resolutionResult ?
                    candidateByMatchId(resolutionResult, patch.selected_match_id)
                :   record.resolution.candidates?.find((c) => c.candidate_id === patch.selected_match_id);

            const confidence =
                patch.action === "link_existing" ?
                    (selected?.confidence ?? record.resolution.confidence)
                : patch.action === "create_new" ?
                    "no_match"
                :   record.resolution.confidence;

            const resolution: CreateLeadCommitResolution = {
                ...record.resolution,
                action: patch.action,
                confidence,
                state: resolutionStateFromConfidence(confidence, patch.action),
                linked_entity_id:
                    patch.action === "link_existing" ? selected?.matched_entity_id ?? record.resolution.linked_entity_id
                    : undefined,
                linked_entity_type:
                    patch.action === "link_existing" ?
                        selected?.matched_entity_type === "customer_member" ? "customer_member"
                        : selected?.matched_entity_type === "person" ? "person"
                        : record.resolution.linked_entity_type
                    : undefined,
                match_display_name:
                    patch.action === "link_existing" ?
                        selected?.match_display_name ?? record.resolution.match_display_name
                    : undefined,
                candidate_match_id: patch.selected_match_id ?? record.resolution.candidate_match_id,
                reasons:
                    patch.action === "create_new" ?
                        ["Operator chose to create a new record."]
                    : patch.action === "link_existing" ?
                        selected?.reasons ?? record.resolution.reasons
                    :   record.resolution.reasons,
            };

            const next: CreateLeadCommitRecord = {
                ...record,
                resolution,
                commit_blockers:
                    resolution.state === "conflict" ?
                        [
                            ...record.commit_blockers.filter(
                                (b) => !b.includes("resolution") && !b.includes("Record resolution"),
                            ),
                            resolution.reasons[0] ?? "Record resolution conflict.",
                        ]
                    :   record.commit_blockers.filter(
                            (b) => !b.includes("Record resolution conflict"),
                        ),
            };

            if (resolution.state === "conflict") {
                next.validation_state = "invalid";
                next.include_in_commit = false;
            } else if (next.validation_state === "valid" && patch.action !== "reject") {
                if (record.primary) next.include_in_commit = true;
            }

            return next;
        });

    return {
        ...selection,
        parents: mapRecord(selection.parents),
        children: mapRecord(selection.children),
    };
}

export function linkedPersonIdFromCommitRecord(record: CreateLeadCommitRecord | null | undefined): string | null {
    if (!record?.resolution) return null;
    if (record.resolution.action !== "link_existing") return null;
    if (record.resolution.linked_entity_type !== "person") return null;
    return record.resolution.linked_entity_id ?? null;
}

export function commitBlockedByResolution(selection: CreateLeadCommitSelection): string[] {
    const issues: string[] = [];
    for (const record of [...selection.parents, ...selection.children]) {
        if (!record.include_in_commit) continue;
        if (record.resolution?.state === "conflict" || record.resolution?.action === "reject") {
            issues.push(
                `${record.first_name || record.entity_type}: ${record.resolution.reasons[0] ?? "Resolution conflict."}`,
            );
        }
        if (record.resolution?.action === "review_required" && record.resolution.state === "possible_match") {
            issues.push(
                `${record.first_name || record.entity_type}: Possible match requires operator review before commit.`,
            );
        }
    }
  if (selection.lead_resolution?.state === "conflict") {
        issues.push(selection.lead_resolution.reasons[0] ?? "Lead resolution conflict.");
    }
    return issues;
}

export function makePersonMatchId(personId: string): string {
    return makeMatchCandidateId("person", personId);
}
