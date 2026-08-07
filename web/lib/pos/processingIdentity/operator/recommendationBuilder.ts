/**
 * Deterministic recommendation builder (D3 §34).
 *
 * Sits between resolution decisions and the Commit Plan. Produces REGISTERED
 * semantic operations only (never arbitrary mutations). Supports create / update /
 * link / attach / create-participation / no-op / request-information /
 * escalate-duplicate / propose-merge. Merge is escalation-only and is NOT emitted
 * as an executable plan operation (Decision H) — it is surfaced as an escalation.
 */

import { IDENTITY_COMMAND_KEYS } from "../commands/commandKeys";
import type { PlanOperationInput } from "../plan/buildCommitPlan";
import type { ProcessingResolutionRow } from "../processingResolutionsDb";

export type SubjectRole = "household" | "parent" | "child" | "lead" | "participation";

export type SubjectDecision =
    | "create"
    | "link"
    | "update"
    | "no_op"
    | "request_information"
    | "escalate_duplicate"
    | "propose_merge";

export type ResolvedSubject = {
    /** Stable ref (becomes op id + "@ref" for dependents), e.g. "parent:0". */
    ref: string;
    role: SubjectRole;
    decision: SubjectDecision;
    /** Existing record id for link/update. */
    selectedRecordId?: string | null;
    /** Provisional values (create/update payload). */
    values?: Record<string, unknown>;
    evidenceRefs?: string[];
    resolutionRef?: string;
    /** Subject refs this subject depends on (e.g. child depends on household). */
    dependsOn?: string[];
    optional?: boolean;
    /** For household links: which household subject ref this subject attaches to. */
    householdRef?: string;
    /** For participation: child + lead subject refs. */
    childRef?: string;
    leadRef?: string;
    /** For escalate_duplicate / propose_merge. */
    duplicate?: { entityType: "person" | "customer" | "customer_member"; survivorId: string; duplicateId: string };
    preconditionRecordVersion?: string | null;
};

export type IdentityResolutionSet = { subjects: ResolvedSubject[] };

export type Escalation = {
    kind: "duplicate" | "merge_proposal";
    entityType: string;
    survivorId: string;
    duplicateId: string;
    reason: string;
    subjectRef: string;
};

export type RecommendationResult = {
    operations: PlanOperationInput[];
    escalations: Escalation[];
    requestInformation: boolean;
    /** Subject refs left unresolved (no executable op). */
    unresolvedSubjects: string[];
};

function refFor(sub: ResolvedSubject): string {
    return sub.ref;
}

/** Decisions that result in a committed record the child/lead can be enrolled against. */
const COMMITTABLE_DECISIONS: readonly SubjectDecision[] = ["create", "link", "update", "no_op"];

/**
 * Enrollment participation is a committed consequence of creating a lead with children —
 * not an identity the operator resolves. For each committable child, ensure a participation
 * subject (child → lead) exists so the frozen `create_process_participation` command fires at
 * commit, giving a public-form / Create-Lead intake case the same enrollment process_instance
 * that manual Create Lead already produces. Idempotent: skipped when a participation subject
 * for that child is already present, and the downstream process_instance upsert is natural-keyed
 * (org_id, process_key, subject_id, context_id), so re-committing never duplicates.
 */
function ensureParticipationSubjects(subjects: ResolvedSubject[]): ResolvedSubject[] {
    const lead = subjects.find((s) => s.role === "lead");
    if (!lead || !COMMITTABLE_DECISIONS.includes(lead.decision)) return subjects;
    const alreadyEnrolled = new Set(
        subjects.filter((s) => s.role === "participation" && s.childRef).map((s) => s.childRef as string),
    );
    const synthesized: ResolvedSubject[] = [];
    for (const child of subjects) {
        if (child.role !== "child") continue;
        if (!COMMITTABLE_DECISIONS.includes(child.decision)) continue;
        if (alreadyEnrolled.has(child.ref)) continue;
        synthesized.push({
            ref: `${child.ref}:participation`,
            role: "participation",
            decision: "create",
            childRef: child.ref,
            leadRef: lead.ref,
            values: {},
            resolutionRef: child.resolutionRef,
        });
    }
    return synthesized.length ? [...subjects, ...synthesized] : subjects;
}

/**
 * Resolve a child/lead subject ref to the value a workflow op should reference: a `@ref`
 * placeholder when that subject is being created in this same plan, or the literal existing
 * record id when it is linked/updated/unchanged (mirrors the guardian-link resolution below,
 * so returning families whose child is linked to an existing record still enroll correctly).
 */
function resolveEntityRef(subjects: ResolvedSubject[], ref: string | undefined): string {
    if (!ref) return "";
    const sub = subjects.find((s) => s.ref === ref);
    if (sub && sub.decision !== "create" && sub.selectedRecordId) return sub.selectedRecordId;
    return `@${ref}`;
}

/** Build the deterministic recommendation set from operator resolution decisions. */
export function buildRecommendations(set: IdentityResolutionSet): RecommendationResult {
    const operations: PlanOperationInput[] = [];
    const escalations: Escalation[] = [];
    const unresolvedSubjects: string[] = [];
    let requestInformation = false;

    // Stable ordering: households → parents → children → leads → participation,
    // ref as tie-breaker, so the same set always yields the same plan.
    const roleOrder: Record<SubjectRole, number> = {
        household: 0,
        parent: 1,
        child: 2,
        lead: 3,
        participation: 4,
    };
    const subjects = ensureParticipationSubjects([...set.subjects]).sort(
        (a, b) => roleOrder[a.role] - roleOrder[b.role] || a.ref.localeCompare(b.ref),
    );

    for (const sub of subjects) {
        const evidenceRefs = sub.evidenceRefs ?? [];
        const resolutionRefs = sub.resolutionRef ? [sub.resolutionRef] : [];
        const common = { ref: refFor(sub), evidenceRefs, resolutionRefs, optional: sub.optional };

        if (sub.decision === "request_information") {
            requestInformation = true;
            unresolvedSubjects.push(sub.ref);
            continue;
        }
        if (sub.decision === "escalate_duplicate" || sub.decision === "propose_merge") {
            if (sub.duplicate) {
                escalations.push({
                    kind: sub.decision === "propose_merge" ? "merge_proposal" : "duplicate",
                    entityType: sub.duplicate.entityType,
                    survivorId: sub.duplicate.survivorId,
                    duplicateId: sub.duplicate.duplicateId,
                    reason: String(sub.values?.reason ?? "operator flagged duplicate"),
                    subjectRef: sub.ref,
                });
            }
            unresolvedSubjects.push(sub.ref);
            continue;
        }
        if (sub.decision === "no_op") {
            operations.push({
                ...common,
                opKind: "no_op",
                commandKey: updateKeyForRole(sub.role),
                targetId: sub.selectedRecordId ?? null,
                payload: { [idFieldForRole(sub.role)]: sub.selectedRecordId ?? "" },
                reason: "already up to date",
            });
            continue;
        }

        switch (sub.role) {
            case "household":
                if (sub.decision === "create") {
                    operations.push({ ...common, opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createHousehold, payload: { household_name: String(sub.values?.household_name ?? "Household") }, after: { name: sub.values?.household_name }, reason: "new household" });
                } else if (sub.decision === "link" && sub.selectedRecordId) {
                    operations.push({
                        ...common,
                        opKind: "no_op",
                        commandKey: IDENTITY_COMMAND_KEYS.createHousehold,
                        targetId: sub.selectedRecordId,
                        payload: { household_id: sub.selectedRecordId },
                        reason: "reuse existing household",
                    });
                }
                break;
            case "parent":
                if (sub.decision === "create") {
                    operations.push({ ...common, opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createPerson, payload: personPayload(sub), after: personPayload(sub), reason: "no candidate matched" });
                } else if (sub.decision === "update") {
                    operations.push({ ...common, opKind: "update", commandKey: IDENTITY_COMMAND_KEYS.updatePerson, targetId: sub.selectedRecordId ?? null, payload: { person_id: sub.selectedRecordId, ...personPayload(sub) }, before: {}, after: personPayload(sub), preconditionRecordVersion: sub.preconditionRecordVersion ?? null, reason: "update matched person" });
                } else if (sub.decision === "link" && sub.selectedRecordId) {
                    operations.push({
                        ...common,
                        opKind: "no_op",
                        commandKey: IDENTITY_COMMAND_KEYS.updatePerson,
                        targetId: sub.selectedRecordId,
                        payload: { person_id: sub.selectedRecordId, ...personPayload(sub) },
                        reason: "reuse matched person",
                    });
                }
                if (sub.householdRef) {
                    const personRef = sub.decision === "link" && sub.selectedRecordId ? sub.selectedRecordId : `@${sub.ref}`;
                    const parentSubjects = subjects.filter((entry) => entry.role === "parent");
                    const isPrimaryParent = parentSubjects[0]?.ref === sub.ref;
                    operations.push({
                        ref: `${sub.ref}:link`,
                        opKind: "link",
                        commandKey: IDENTITY_COMMAND_KEYS.linkPersonToHousehold,
                        payload: {
                            person_id: personRef,
                            household_id: `@${sub.householdRef}`,
                            role_type: isPrimaryParent ? "primary_contact" : "guardian",
                            primary: isPrimaryParent,
                        },
                        dependsOnRefs: dedupeRefs([sub.decision === "create" ? sub.ref : undefined, sub.householdRef]),
                        evidenceRefs,
                        resolutionRefs,
                        reason: isPrimaryParent
                            ? "link primary guardian to household"
                            : "link secondary guardian to household",
                    });
                    const lead = subjects.find((entry) => entry.role === "lead");
                    if (lead && !isPrimaryParent) {
                        const leadId =
                            lead.decision === "link" && lead.selectedRecordId
                                ? lead.selectedRecordId
                                : `@${lead.ref}`;
                        operations.push({
                            ref: `${sub.ref}:lead-link`,
                            opKind: "link",
                            commandKey: IDENTITY_COMMAND_KEYS.linkPersonToLead,
                            payload: {
                                person_id: personRef,
                                lead_id: leadId,
                                role_type: "guardian",
                                role: "secondary_guardian",
                            },
                            dependsOnRefs: dedupeRefs([
                                sub.decision === "create" ? sub.ref : undefined,
                                lead.decision === "create" ? lead.ref : undefined,
                            ]),
                            evidenceRefs,
                            resolutionRefs,
                            reason: "link secondary guardian to lead",
                        });
                    }
                }
                break;
            case "child":
                if (sub.decision === "create") {
                    // Persist split names — display_name alone leaves child:first_name / child:last_name
                    // readiness gaps even when the Children card shows the composed name.
                    operations.push({
                        ...common,
                        opKind: "create",
                        commandKey: IDENTITY_COMMAND_KEYS.createChild,
                        payload: {
                            household_id: `@${sub.householdRef}`,
                            display_name: String(sub.values?.display_name ?? "Child"),
                            first_name: sub.values?.first_name ?? null,
                            last_name: sub.values?.last_name ?? null,
                            dob: sub.values?.dob ?? null,
                            ...(typeof sub.values?.gender === "string" && sub.values.gender
                                ? { gender: sub.values.gender }
                                : {}),
                        },
                        after: {
                            display_name: sub.values?.display_name,
                            first_name: sub.values?.first_name,
                            last_name: sub.values?.last_name,
                            dob: sub.values?.dob,
                            ...(typeof sub.values?.gender === "string" && sub.values.gender
                                ? { gender: sub.values.gender }
                                : {}),
                        },
                        dependsOnRefs: sub.householdRef ? [sub.householdRef] : [],
                        reason: "new child",
                    });
                } else if (sub.decision === "update") {
                    operations.push({
                        ...common,
                        opKind: "update",
                        commandKey: IDENTITY_COMMAND_KEYS.updateChild,
                        targetId: sub.selectedRecordId ?? null,
                        payload: {
                            child_id: sub.selectedRecordId,
                            display_name: sub.values?.display_name,
                            first_name: sub.values?.first_name,
                            last_name: sub.values?.last_name,
                            dob: sub.values?.dob,
                        },
                        after: {
                            display_name: sub.values?.display_name,
                            first_name: sub.values?.first_name,
                            last_name: sub.values?.last_name,
                        },
                        preconditionRecordVersion: sub.preconditionRecordVersion ?? null,
                        reason: "update matched child",
                    });
                } else if (sub.decision === "link" && sub.selectedRecordId) {
                    operations.push({
                        ...common,
                        opKind: "no_op",
                        commandKey: IDENTITY_COMMAND_KEYS.updateChild,
                        targetId: sub.selectedRecordId,
                        payload: { child_id: sub.selectedRecordId },
                        reason: "reuse existing child",
                    });
                }
                break;
            case "lead":
                if (sub.decision === "create") {
                    // work_unit_id carries the lifecycle binding resolved at intake (create_lead_intake).
                    // Without it the opportunity is created with work_unit_id NULL, which the canonical
                    // Work-Unit lead membership predicate (workUnitLeadMembership.ts, `.eq(work_unit_id)`)
                    // excludes — so the new lead never appears in its Work Unit Work View.
                    const leadWorkUnitId =
                        typeof sub.values?.work_unit_id === "string" && sub.values.work_unit_id.trim()
                            ? sub.values.work_unit_id
                            : null;
                    const leadLocationId =
                        typeof sub.values?.location_id === "string" && sub.values.location_id.trim()
                            ? sub.values.location_id.trim()
                            : null;
                    operations.push({
                        ...common,
                        opKind: "create",
                        commandKey: IDENTITY_COMMAND_KEYS.createLead,
                        payload: {
                            household_id: `@${sub.householdRef}`,
                            primary_person_id: sub.values?.primary_person_id ?? `@${sub.dependsOn?.[0] ?? ""}`,
                            name: String(sub.values?.name ?? "Lead"),
                            ...(leadWorkUnitId ? { work_unit_id: leadWorkUnitId } : {}),
                            ...(leadLocationId ? { location_id: leadLocationId } : {}),
                        },
                        after: { name: sub.values?.name },
                        dependsOnRefs: sub.dependsOn ?? (sub.householdRef ? [sub.householdRef] : []),
                        reason: "new lead",
                    });
                } else if (sub.decision === "update") {
                    operations.push({ ...common, opKind: "update", commandKey: IDENTITY_COMMAND_KEYS.updateLead, targetId: sub.selectedRecordId ?? null, payload: { lead_id: sub.selectedRecordId, name: sub.values?.name }, after: { name: sub.values?.name }, preconditionRecordVersion: sub.preconditionRecordVersion ?? null, reason: "update lead" });
                }
                break;
            case "participation":
                operations.push({ ...common, opKind: "workflow", commandKey: IDENTITY_COMMAND_KEYS.createProcessParticipation, payload: { child_id: resolveEntityRef(subjects, sub.childRef), lead_id: resolveEntityRef(subjects, sub.leadRef), participation: sub.values ?? {} }, dependsOnRefs: dedupeRefs([sub.childRef, sub.leadRef]), reason: "enrollment participation" });
                break;
        }
    }

    return { operations, escalations, requestInformation, unresolvedSubjects };
}

function personPayload(sub: ResolvedSubject): Record<string, unknown> {
    const v = sub.values ?? {};
    return { first_name: v.first_name ?? null, last_name: v.last_name ?? null, email: v.email ?? null, phone: v.phone ?? null };
}

function updateKeyForRole(role: SubjectRole): string {
    switch (role) {
        case "child":
            return IDENTITY_COMMAND_KEYS.updateChild;
        case "lead":
            return IDENTITY_COMMAND_KEYS.updateLead;
        default:
            return IDENTITY_COMMAND_KEYS.updatePerson;
    }
}

function idFieldForRole(role: SubjectRole): string {
    switch (role) {
        case "child":
            return "child_id";
        case "lead":
            return "lead_id";
        default:
            return "person_id";
    }
}

function dedupeRefs(refs: (string | undefined)[]): string[] {
    return Array.from(new Set(refs.filter((r): r is string => Boolean(r))));
}

/**
 * Map a persisted resolution decision action (intake vocabulary) to a subject
 * decision. Only actionable decisions become executable subjects; review/reject/
 * undecided rows are intentionally left out (they produce no operation, so a plan
 * cannot be built until the operator resolves them).
 */
function decisionForAction(action: string | null): SubjectDecision | null {
    switch (action) {
        case "link_existing":
            return "link";
        case "create_new":
            return "create";
        case "update_existing":
            return "update";
        case "request_information":
            return "request_information";
        case "escalate_duplicate":
            return "escalate_duplicate";
        case "propose_merge":
            return "propose_merge";
        default:
            // reject / review_required / route_for_review / null → not actionable yet
            return null;
    }
}

function roleFromSubjectRole(role: string): SubjectRole {
    switch (role) {
        case "household":
        case "family":
            return "household";
        case "child":
            return "child";
        case "lead":
            return "lead";
        case "participation":
            return "participation";
        default:
            return "parent";
    }
}

export function pickLatestResolutionPerSubject(rows: ProcessingResolutionRow[]): ProcessingResolutionRow[] {
    const byRef = new Map<string, ProcessingResolutionRow>();
    for (const row of rows) {
        if (row.superseded_by) continue;
        const existing = byRef.get(row.subject_ref);
        if (!existing || row.created_at > existing.created_at) {
            byRef.set(row.subject_ref, row);
        }
    }
    return Array.from(byRef.values());
}

/**
 * Deterministically derive the recommendation input from durable resolution rows
 * (D3 §34). Household is linked to parents/children; the lead depends on the
 * household and the first parent. This is the canonical projection the operator
 * approves — it never invents arbitrary mutations, only registered semantic ops.
 */
export function deriveResolutionSetFromResolutions(
    rows: ProcessingResolutionRow[],
): IdentityResolutionSet {
    const activeRows = pickLatestResolutionPerSubject(rows);
    const householdRow = activeRows.find((r) => roleFromSubjectRole(r.subject_role) === "household");
    const householdRef = householdRow?.subject_ref;
    const parentRows = activeRows.filter((r) => roleFromSubjectRole(r.subject_role) === "parent");

    const subjects: ResolvedSubject[] = [];
    for (const row of activeRows) {
        const role = roleFromSubjectRole(row.subject_role);
        const decision = decisionForAction(row.decision_action);
        if (!decision) continue;

        const base: ResolvedSubject = {
            ref: row.subject_ref,
            role,
            decision,
            selectedRecordId: row.selected_candidate_id,
            values: row.provisional ?? {},
            resolutionRef: row.id,
        };

        if (role === "parent" || role === "child") {
            base.householdRef = householdRef;
        }
        subjects.push(base);
    }

    const actionableParentRef = subjects.find((s) => s.role === "parent")?.ref;
    for (const sub of subjects) {
        if (sub.role === "lead") {
            sub.householdRef = householdRef;
            sub.dependsOn = dedupeRefs([actionableParentRef, householdRef]);
        }
    }
    return { subjects };
}
