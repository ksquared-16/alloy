/**
 * D6 — the canonical Documents requirement service: loads the facts, asks the ONE evaluator, discloses per actor.
 *
 * Consumers (all through this module, never around it):
 *   - Focus Panel readiness        `buildSubjectReadiness`        GET /api/admin/documents/requirements/readiness
 *   - Processing → Work → Documents and Work Items
 *                                  `listRequirementWork`          GET /api/admin/documents/requirements/work
 *   - Business Process readiness   `evaluateDocumentTypeRequirementsForChild` (participant progress)
 *
 * SYSTEM VS ACTOR. Evaluation (`evaluateSubjects`) is system-level: it sees every document of the type, including ones
 * a given operator may not open, because "is the requirement met" must not depend on who asks. Disclosure is then
 * applied per actor, in the canonical order, before anything is returned or counted:
 *   1. organization — every read is org-bound;
 *   2. subject scope — a subject outside the actor's department/site scope is dropped with all its results;
 *   3. requirement clearance — a requirement whose Studio type carries a sensitive class (medical, safeguarding,
 *      personal identity, restricted) is shown only to an actor cleared for that class, so its state is never a
 *      side channel for a medical record the actor may not see;
 *   4. evidence — each document id is listed only if the actor may read that document (availability, owner scope,
 *      sensitivity). Quarantined evidence is never listed by id: the state says `blocked`, nothing more.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertEntityDrawerRecordReadable, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { filterDocumentRowsInActorScope } from "@/lib/documents/assertDocumentAccess";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import {
    actorMayReadSensitivity,
    classForDeclaredSensitivity,
    filterDocumentRowsBySensitivity,
    MEDICAL_DOCUMENT_TYPES,
    type DocumentSensitivityClass,
} from "@/lib/documents/documentSensitivity";
import { legacyEntityTypeForSubject } from "@/lib/documents/documentSubjects";
import { listPublishedDocumentTypePolicies, type PublishedDocumentTypePolicy } from "@/lib/documents/configuration/documentTypeEnforcement";
import { householdForAnchor, householdSubjects, type LibrarySubject, type LibrarySubjectRef } from "@/lib/documents/library/documentLibrary";
import { REQUIREMENT_VERSION_COLUMNS } from "@/lib/documents/requirements/documentRequirementConfigService";
import {
    evaluateDocumentRequirement,
    evaluationNeedsWork,
    type EvaluableRequirement,
    type EvaluableTypePolicy,
    type EvaluableWaiver,
    type EvaluationSubject,
    type EvidenceDocument,
    type RequirementEvaluation,
    type SubjectJourney,
} from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { RequirementSubjectType } from "@/lib/documents/requirements/documentRequirementPolicy";

export type RequirementActor = {
    orgId: string;
    scope: AdminAccessScopeDimensions | null;
    roleKeys: readonly string[];
    permissionKeys: readonly string[];
};
export type SubjectRef = { subject_type: RequirementSubjectType; subject_id: string };

const IN_CHUNK = 150;
/** Subjects one requirement may enumerate for the work queue in one read. */
export const REQUIREMENT_POPULATION_LIMIT = 1000;
/** Work rows in one response. */
export const REQUIREMENT_WORK_LIMIT = 500;
const CLOSED_OPPORTUNITY_STATUSES = new Set(["closed", "withdrawn", "lost", "archived"]);
const CLOSED_JOURNEY_STATES = new Set(["withdrawn", "not_enrolling"]);

const TABLE_FOR: Record<RequirementSubjectType, string> = {
    household: "customers",
    person: "persons",
    child: "customer_members",
    opportunity: "opportunities",
};

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const subjectKey = (r: { subject_type: string; subject_id: string }) => `${r.subject_type}:${r.subject_id}`;

/** Today in UTC as YYYY-MM-DD; the evaluator itself never reads a clock. */
export function todayIso(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

// ── configuration reads ─────────────────────────────────────────────────────────────────────────────────────────
/** Every active requirement's published version. Null when it could not be read (callers fail closed). */
export async function loadLiveRequirements(supabase: SupabaseClient, orgId: string): Promise<EvaluableRequirement[] | null> {
    const { data: reqs, error } = await supabase
        .from("document_requirements")
        .select("id, key, published_version_id")
        .eq("org_id", orgId)
        .eq("status", "active");
    if (error) return null;
    const rows = ((reqs ?? []) as Array<{ id: string; key: string; published_version_id: string | null }>).filter(
        (r): r is { id: string; key: string; published_version_id: string } => Boolean(r.published_version_id),
    );
    if (rows.length === 0) return [];
    const reads = await Promise.all(
        chunks(rows.map((r) => r.published_version_id)).map((ids) =>
            supabase.from("document_requirement_versions").select(REQUIREMENT_VERSION_COLUMNS).eq("org_id", orgId).in("id", ids),
        ),
    );
    if (reads.some((r) => r.error)) return null;
    const keyById = new Map(rows.map((r) => [r.id, r.key]));
    const out: EvaluableRequirement[] = [];
    for (const v of reads.flatMap((r) => (r.data ?? []) as Array<Record<string, unknown>>)) {
        const requirementId = String(v.requirement_id);
        if (v.status !== "published" || !keyById.has(requirementId)) continue;
        out.push({
            requirement_id: requirementId,
            requirement_key: keyById.get(requirementId)!,
            version_id: String(v.id),
            label: String(v.label ?? ""),
            document_type_key: String(v.document_type_key ?? ""),
            subject_type: v.subject_type as RequirementSubjectType,
            scope: (v.scope ?? { kind: "all" }) as EvaluableRequirement["scope"],
            timing: (v.timing ?? { kind: "immediate" }) as EvaluableRequirement["timing"],
            policy: v.policy === "optional" ? "optional" : "required",
            waivable: v.waivable === true,
            effective_from: str(v.effective_from),
            effective_until: str(v.effective_until),
        });
    }
    return out.sort((a, b) => a.requirement_key.localeCompare(b.requirement_key));
}

export type RequirementTypeCatalog = Map<string, PublishedDocumentTypePolicy>;

export async function loadRequirementTypes(supabase: SupabaseClient, orgId: string): Promise<RequirementTypeCatalog | null> {
    const policies = await listPublishedDocumentTypePolicies(supabase, orgId);
    if (!policies) return null;
    return new Map(policies.map((p) => [p.key, p]));
}

function evaluableType(types: RequirementTypeCatalog, key: string): EvaluableTypePolicy {
    const t = types.get(key);
    return t ? { key: t.key, label: t.label, subject_types: t.subject_types, review_required: t.review_required } : null;
}

/** The sensitive classes a requirement's type carries: its default class, and medical for the medical type keys. */
export function requirementTypeClasses(types: RequirementTypeCatalog, key: string): Set<DocumentSensitivityClass> {
    const classes = new Set<DocumentSensitivityClass>();
    const t = types.get(key);
    const declared = t ? classForDeclaredSensitivity(t.default_sensitivity) : null;
    if (declared) classes.add(declared);
    if (MEDICAL_DOCUMENT_TYPES.includes(key)) classes.add("medical");
    return classes;
}

/** May this actor see this requirement's results at all? (requirement clearance, step 3) */
export function actorMaySeeRequirement(actor: Pick<RequirementActor, "roleKeys" | "permissionKeys">, types: RequirementTypeCatalog, key: string): boolean {
    return actorMayReadSensitivity(actor, requirementTypeClasses(types, key));
}

// ── facts ───────────────────────────────────────────────────────────────────────────────────────────────────────
type EvidenceRow = EvidenceDocument & { doc_type: string | null; entity_type: string | null; entity_id: string | null };

type SubjectFacts = {
    subjects: Map<string, EvaluationSubject>;
    evidence: Map<string, EvidenceRow[]>;
    waivers: EvaluableWaiver[];
};

type JourneyRow = { subject_id: string; process_key: string; stage_key: string | null; state: string | null; close_reason_key: string | null; context_type: string | null; context_id: string | null; created_at: string };

const journeyOpen = (j: JourneyRow) => !j.close_reason_key && !CLOSED_JOURNEY_STATES.has(String(j.state ?? ""));
const toJourney = (j: JourneyRow): SubjectJourney => ({ process_key: j.process_key, stage_key: j.stage_key, started_at: j.created_at });

async function readIn<T>(
    supabase: SupabaseClient,
    ids: string[],
    build: (ids: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[] | null> {
    const results = await Promise.all(chunks([...new Set(ids)]).map((c) => build(c)));
    if (results.some((r) => r.error)) return null;
    return results.flatMap((r) => (r.data ?? []) as T[]);
}

/** Open journeys reaching each subject: a child's own, a household's children's, a case's. */
async function loadJourneys(supabase: SupabaseClient, orgId: string, refs: SubjectRef[]): Promise<Map<string, SubjectJourney[]> | null> {
    const out = new Map<string, SubjectJourney[]>();
    const push = (k: string, j: SubjectJourney) => out.set(k, [...(out.get(k) ?? []), j]);
    const cols = "subject_id, process_key, stage_key, state, close_reason_key, context_type, context_id, created_at";
    const childIds = refs.filter((r) => r.subject_type === "child").map((r) => r.subject_id);
    const householdIds = refs.filter((r) => r.subject_type === "household").map((r) => r.subject_id);
    const caseIds = refs.filter((r) => r.subject_type === "opportunity").map((r) => r.subject_id);

    let householdChildren: Array<{ id: string; customer_id: string }> = [];
    if (householdIds.length) {
        const rows = await readIn<{ id: string; customer_id: string }>(supabase, householdIds, (ids) =>
            supabase.from("customer_members").select("id, customer_id").eq("org_id", orgId).in("customer_id", ids),
        );
        if (!rows) return null;
        householdChildren = rows;
    }
    const allChildIds = [...childIds, ...householdChildren.map((c) => c.id)];
    if (allChildIds.length) {
        const rows = await readIn<JourneyRow>(supabase, allChildIds, (ids) =>
            supabase.from("process_instances").select(cols).eq("org_id", orgId).in("subject_id", ids),
        );
        if (!rows) return null;
        const householdOf = new Map(householdChildren.map((c) => [c.id, c.customer_id]));
        const childSet = new Set(childIds);
        for (const j of rows.filter(journeyOpen)) {
            if (childSet.has(j.subject_id)) push(`child:${j.subject_id}`, toJourney(j));
            const h = householdOf.get(j.subject_id);
            if (h) push(`household:${h}`, toJourney(j));
        }
    }
    if (caseIds.length) {
        const rows = await readIn<JourneyRow>(supabase, caseIds, (ids) =>
            supabase.from("process_instances").select(cols).eq("org_id", orgId).eq("context_type", "opportunity").in("context_id", ids),
        );
        if (!rows) return null;
        for (const j of rows.filter(journeyOpen)) if (j.context_id) push(`opportunity:${j.context_id}`, toJourney(j));
    }
    return out;
}

async function loadSubjectFacts(supabase: SupabaseClient, orgId: string, refs: SubjectRef[], typeKeys: string[]): Promise<SubjectFacts | null> {
    const subjects = new Map<string, EvaluationSubject>();
    const evidence = new Map<string, EvidenceRow[]>();
    if (refs.length === 0) return { subjects, evidence, waivers: [] };

    // Subjects resolve in this organization, or they are not evaluated at all.
    for (const t of Object.keys(TABLE_FOR) as RequirementSubjectType[]) {
        const ids = refs.filter((r) => r.subject_type === t).map((r) => r.subject_id);
        if (!ids.length) continue;
        const rows = await readIn<{ id: string; created_at: string | null }>(supabase, ids, (c) => supabase.from(TABLE_FOR[t]).select("id, created_at").eq("org_id", orgId).in("id", c));
        if (!rows) return null;
        for (const r of rows) subjects.set(`${t}:${r.id}`, { subject_type: t, subject_id: r.id, created_at: str(r.created_at), journeys: [] });
    }
    const journeys = await loadJourneys(supabase, orgId, refs);
    if (!journeys) return null;
    for (const [k, s] of subjects) subjects.set(k, { ...s, journeys: journeys.get(k) ?? [] });

    // Evidence: documents of the requirement types OWNED by the subject (D2 owner associations, primary or not).
    const ownerLinks: Array<{ document_id: string; subject_type: string; subject_id: string }> = [];
    for (const t of Object.keys(TABLE_FOR) as RequirementSubjectType[]) {
        const ids = refs.filter((r) => r.subject_type === t && subjects.has(subjectKey(r))).map((r) => r.subject_id);
        if (!ids.length) continue;
        const rows = await readIn<{ document_id: string; subject_type: string; subject_id: string }>(supabase, ids, (c) =>
            supabase
                .from("document_subjects")
                .select("document_id, subject_type, subject_id")
                .eq("org_id", orgId)
                .eq("subject_type", t)
                .eq("association", "owner")
                .is("ended_at", null)
                .in("subject_id", c),
        );
        if (!rows) return null;
        ownerLinks.push(...rows);
    }
    const docIds = [...new Set(ownerLinks.map((l) => l.document_id))];
    if (docIds.length && typeKeys.length) {
        const docs = await readIn<{ id: string; doc_type: string | null; status: string | null; entity_type: string | null; entity_id: string | null; created_at: string | null; current_version_id: string | null }>(
            supabase,
            docIds,
            (c) => supabase.from("documents").select("id, doc_type, status, entity_type, entity_id, created_at, current_version_id").eq("org_id", orgId).in("id", c).in("doc_type", typeKeys),
        );
        if (!docs) return null;
        const versionIds = docs.map((d) => d.current_version_id).filter((v): v is string => Boolean(v));
        const versions = versionIds.length
            ? await readIn<{ id: string; review_status: string | null }>(supabase, versionIds, (c) => supabase.from("document_versions").select("id, review_status").eq("org_id", orgId).in("id", c))
            : [];
        if (!versions) return null;
        const reviewByVersion = new Map(versions.map((v) => [v.id, v.review_status]));
        const docById = new Map(docs.map((d) => [d.id, d]));
        for (const l of ownerLinks) {
            const d = docById.get(l.document_id);
            if (!d) continue;
            const review = d.current_version_id ? reviewByVersion.get(d.current_version_id) ?? null : null;
            const row: EvidenceRow = {
                document_id: d.id,
                status: d.status,
                review_status: review === "pending" || review === "accepted" || review === "rejected" ? review : null,
                received_at: d.created_at,
                doc_type: d.doc_type,
                entity_type: d.entity_type,
                entity_id: d.entity_id,
            };
            const k = `${l.subject_type}:${l.subject_id}`;
            evidence.set(k, [...(evidence.get(k) ?? []), row]);
        }
    }

    const waivers: EvaluableWaiver[] = [];
    for (const t of Object.keys(TABLE_FOR) as RequirementSubjectType[]) {
        const ids = refs.filter((r) => r.subject_type === t).map((r) => r.subject_id);
        if (!ids.length) continue;
        const rows = await readIn<EvaluableWaiver & { id: string }>(supabase, ids, (c) =>
            supabase
                .from("document_requirement_waivers")
                .select("id, requirement_id, subject_type, subject_id, state, effective_until")
                .eq("org_id", orgId)
                .eq("subject_type", t)
                .eq("state", "active")
                .in("subject_id", c),
        );
        if (!rows) return null;
        waivers.push(...rows.map((w) => ({ ...w, waiver_id: (w as { id: string }).id })));
    }
    return { subjects, evidence, waivers };
}

export type SystemEvaluation = { evaluations: RequirementEvaluation[]; evidence: Map<string, EvidenceRow[]> };

/**
 * System-level evaluation of the given requirements for the given subjects. No actor; callers disclose.
 * Null when any fact could not be read: an unreadable fact never reads as satisfied.
 */
export async function evaluateSubjects(
    supabase: SupabaseClient,
    orgId: string,
    refs: SubjectRef[],
    input: { requirements: EvaluableRequirement[]; types: RequirementTypeCatalog; today: string },
): Promise<SystemEvaluation | null> {
    const typeKeys = [...new Set(input.requirements.map((r) => r.document_type_key))];
    const facts = await loadSubjectFacts(supabase, orgId, refs, typeKeys);
    if (!facts) return null;
    const evaluations: RequirementEvaluation[] = [];
    for (const ref of refs) {
        const subject = facts.subjects.get(subjectKey(ref));
        if (!subject) continue;
        const docs = facts.evidence.get(subjectKey(ref)) ?? [];
        for (const requirement of input.requirements) {
            if (requirement.subject_type !== subject.subject_type) continue;
            const e = evaluateDocumentRequirement({
                requirement,
                type: evaluableType(input.types, requirement.document_type_key),
                subject,
                documents: docs.filter((d) => d.doc_type === requirement.document_type_key),
                waivers: facts.waivers,
                today: input.today,
            });
            if (e) evaluations.push(e);
        }
    }
    return { evaluations, evidence: facts.evidence };
}

// ── disclosure ──────────────────────────────────────────────────────────────────────────────────────────────────
export type DisclosedEvaluation = Omit<RequirementEvaluation, "evidence"> & {
    /** Only documents this actor may read. Quarantined evidence is never listed. */
    evidence: { accepted: string[]; pending: string[]; rejected: string[] };
};

/** The ids among `rows` this actor may read: available, owner in scope, cleared for the sensitivity. */
async function readableEvidenceIds(supabase: SupabaseClient, actor: RequirementActor, rows: EvidenceRow[]): Promise<Set<string>> {
    const unique = [...new Map(rows.map((r) => [r.document_id, r])).values()].filter((r) => !isDocumentUnavailable(r.status));
    const asDocs = unique.map((r) => ({ id: r.document_id, doc_type: r.doc_type, entity_type: r.entity_type, entity_id: r.entity_id }));
    const inScope = await filterDocumentRowsInActorScope(supabase, actor.orgId, actor.scope, asDocs);
    const cleared = await filterDocumentRowsBySensitivity(supabase, actor.orgId, actor, inScope);
    return new Set(cleared.map((d) => d.id));
}

function disclose(e: RequirementEvaluation, readable: Set<string>): DisclosedEvaluation {
    return {
        ...e,
        evidence: {
            accepted: e.evidence.accepted.filter((id) => readable.has(id)),
            pending: e.evidence.pending.filter((id) => readable.has(id)),
            rejected: e.evidence.rejected.filter((id) => readable.has(id)),
        },
    };
}

/** Keep the subjects inside the actor's department/site scope (step 2). */
async function subjectsInActorScope(supabase: SupabaseClient, actor: RequirementActor, refs: SubjectRef[]): Promise<SubjectRef[]> {
    const rows = refs.map((r) => ({ ...r, entity_type: legacyEntityTypeForSubject(r.subject_type), entity_id: r.subject_id }));
    const kept = await filterDocumentRowsInActorScope(supabase, actor.orgId, actor.scope, rows);
    return kept.map((r) => ({ subject_type: r.subject_type, subject_id: r.subject_id }));
}

// ── Focus Panel readiness ───────────────────────────────────────────────────────────────────────────────────────
export type ReadinessCounts = { required: number; on_file: number; missing: number; pending_review: number; waived: number; blocked: number; satisfied: number };
export type SubjectReadiness = {
    subject: { subject_type: RequirementSubjectType; subject_id: string; label: string; role: LibrarySubject["role"] };
    requirements: DisclosedEvaluation[];
    counts: ReadinessCounts;
};
export type ReadinessResult =
    | { ok: true; value: { household: { id: string; label: string } | null; subjects: SubjectReadiness[]; totals: ReadinessCounts; today: string } }
    | { ok: false; status: 404 | 500; code: string };

export function readinessCounts(list: ReadonlyArray<Pick<RequirementEvaluation, "state" | "policy"> & { evidence: { accepted: string[]; pending: string[] } }>): ReadinessCounts {
    const c: ReadinessCounts = { required: 0, on_file: 0, missing: 0, pending_review: 0, waived: 0, blocked: 0, satisfied: 0 };
    for (const e of list) {
        if (e.policy === "required") c.required += 1;
        if (e.state === "missing") c.missing += 1;
        else if (e.state === "pending_review") c.pending_review += 1;
        else if (e.state === "waived") c.waived += 1;
        else if (e.state === "blocked") c.blocked += 1;
        else c.satisfied += 1;
        c.on_file += e.evidence.accepted.length + e.evidence.pending.length;
    }
    return c;
}

/**
 * Readiness for the household graph around `anchor` (household, adults, children, cases), or for `focus` alone.
 * The same admission as the D4 library: the anchor must be a record the actor may open, else 404.
 */
export async function buildSubjectReadiness(
    supabase: SupabaseClient,
    actor: RequirementActor,
    input: { anchor: LibrarySubjectRef; focus?: LibrarySubjectRef | null; today?: string },
): Promise<ReadinessResult> {
    const { orgId } = actor;
    const today = input.today ?? todayIso();
    if (!actor.scope) return { ok: false, status: 404, code: "NOT_FOUND" };
    if (!(await assertEntityDrawerRecordReadable(supabase, orgId, actor.scope, TABLE_FOR[input.anchor.subject_type], input.anchor.subject_id))) {
        return { ok: false, status: 404, code: "NOT_FOUND" };
    }
    const resolved = await householdForAnchor(supabase, orgId, input.anchor);
    if (!resolved.ok) return { ok: false, status: resolved.status === 404 ? 404 : 500, code: resolved.code };
    let household: { id: string; label: string } | null = null;
    let graph: LibrarySubject[] = [];
    if (resolved.householdId) {
        const g = await householdSubjects(supabase, orgId, resolved.householdId);
        if (!g) return { ok: false, status: 404, code: "NOT_FOUND" };
        household = g.household;
        graph = g.subjects;
    }
    if (!graph.some((s) => subjectKey(s) === subjectKey(input.anchor))) {
        graph.push({ ...input.anchor, label: "Selected record", role: input.anchor.subject_type === "child" ? "child" : input.anchor.subject_type === "opportunity" ? "case" : "adult", is_primary_contact: false, active: true });
    }
    if (input.focus) {
        const f = input.focus;
        if (!graph.some((s) => subjectKey(s) === subjectKey(f))) return { ok: false, status: 404, code: "NOT_FOUND" };
        graph = graph.filter((s) => subjectKey(s) === subjectKey(f));
    }
    const [requirements, types] = await Promise.all([loadLiveRequirements(supabase, orgId), loadRequirementTypes(supabase, orgId)]);
    if (!requirements || !types) return { ok: false, status: 500, code: "READINESS_UNAVAILABLE" };
    const visible = requirements.filter((r) => actorMaySeeRequirement(actor, types, r.document_type_key));

    const refs = await subjectsInActorScope(supabase, actor, graph.map((s) => ({ subject_type: s.subject_type, subject_id: s.subject_id })));
    const system = await evaluateSubjects(supabase, orgId, refs, { requirements: visible, types, today });
    if (!system) return { ok: false, status: 500, code: "READINESS_UNAVAILABLE" };
    const readable = await readableEvidenceIds(supabase, actor, [...system.evidence.values()].flat());

    const inScope = new Set(refs.map(subjectKey));
    const subjects: SubjectReadiness[] = [];
    for (const s of graph) {
        if (!inScope.has(subjectKey(s))) continue;
        const list = system.evaluations.filter((e) => subjectKey(e) === subjectKey(s)).map((e) => disclose(e, readable));
        if (list.length === 0) continue;
        subjects.push({ subject: { subject_type: s.subject_type, subject_id: s.subject_id, label: s.label, role: s.role }, requirements: list, counts: readinessCounts(list) });
    }
    return { ok: true, value: { household, subjects, totals: readinessCounts(subjects.flatMap((s) => s.requirements)), today } };
}

// ── operational work (Processing → Work → Documents, Work Items) ───────────────────────────────────────────────
export type RequirementWorkRow = {
    /** Stable, derived: `document_requirement:<requirement id>:<subject type>:<subject id>`. Never a stored task. */
    id: string;
    requirement_id: string;
    requirement_key: string;
    requirement_label: string;
    document_type_key: string;
    document_type_label: string | null;
    subject_type: RequirementSubjectType;
    subject_id: string;
    subject_label: string;
    household_id: string | null;
    state: "missing" | "pending_review" | "blocked";
    blocked_reason: RequirementEvaluation["blocked_reason"];
    due_on: string | null;
    overdue: boolean;
    waivable: boolean;
    /** Readable evidence awaiting review (ids only; the library opens them). */
    pending_document_ids: string[];
};

export function requirementWorkId(requirementId: string, subject: { subject_type: string; subject_id: string }): string {
    return `document_requirement:${requirementId}:${subject.subject_type}:${subject.subject_id}`;
}

/** Subjects a requirement reaches in the organization, bounded. */
async function requirementPopulation(
    supabase: SupabaseClient,
    orgId: string,
    r: EvaluableRequirement,
): Promise<{ refs: SubjectRef[]; truncated: boolean } | null> {
    const cap = REQUIREMENT_POPULATION_LIMIT;
    const ids = (rows: unknown[] | null, col = "id") => ((rows ?? []) as Array<Record<string, unknown>>).map((x) => str(x[col])).filter((x): x is string => Boolean(x));
    const done = (list: string[]) => ({ refs: [...new Set(list)].slice(0, cap).map((id) => ({ subject_type: r.subject_type, subject_id: id })), truncated: new Set(list).size > cap });

    if (r.scope.kind === "business_process") {
        let q = supabase
            .from("process_instances")
            .select("subject_id, stage_key, state, close_reason_key, context_type, context_id")
            .eq("org_id", orgId)
            .eq("process_key", r.scope.process_key)
            .is("close_reason_key", null);
        if (r.scope.stage_keys && r.scope.stage_keys.length) q = q.in("stage_key", r.scope.stage_keys);
        const { data, error } = await q.limit(cap * 2);
        if (error) return null;
        const open = ((data ?? []) as JourneyRow[]).filter(journeyOpen);
        if (r.subject_type === "child") return done(open.map((j) => j.subject_id));
        if (r.subject_type === "opportunity") return done(open.filter((j) => j.context_type === "opportunity" && j.context_id).map((j) => j.context_id!));
        if (r.subject_type === "household") {
            const children = await readIn<{ customer_id: string }>(supabase, open.map((j) => j.subject_id), (c) => supabase.from("customer_members").select("customer_id").eq("org_id", orgId).in("id", c));
            if (!children) return null;
            return done(ids(children, "customer_id"));
        }
        return { refs: [], truncated: false };
    }
    switch (r.subject_type) {
        case "child": {
            const { data, error } = await supabase.from("customer_members").select("id, is_active").eq("org_id", orgId).neq("is_active", false).limit(cap + 1);
            return error ? null : done(ids(data));
        }
        case "household": {
            const { data, error } = await supabase.from("customers").select("id, status_key").eq("org_id", orgId).limit(cap * 2);
            if (error) return null;
            return done(((data ?? []) as Array<{ id: string; status_key: string | null }>).filter((h) => !h.status_key || h.status_key === "active").map((h) => h.id));
        }
        case "person": {
            // People of households (guardians and contacts) — never staff or unrelated persons.
            const { data, error } = await supabase.from("customer_persons").select("person_id, status, end_date").eq("org_id", orgId).limit(cap * 2);
            if (error) return null;
            return done(((data ?? []) as Array<{ person_id: string; status: string | null; end_date: string | null }>).filter((p) => !p.end_date && (p.status ?? "active") === "active").map((p) => p.person_id));
        }
        case "opportunity": {
            const { data, error } = await supabase.from("opportunities").select("id, status_key").eq("org_id", orgId).limit(cap * 2);
            if (error) return null;
            return done(((data ?? []) as Array<{ id: string; status_key: string | null }>).filter((o) => !CLOSED_OPPORTUNITY_STATUSES.has(String(o.status_key ?? ""))).map((o) => o.id));
        }
    }
}

async function subjectLabels(supabase: SupabaseClient, orgId: string, refs: SubjectRef[]): Promise<Map<string, { label: string; household_id: string | null }>> {
    const out = new Map<string, { label: string; household_id: string | null }>();
    const by = (t: RequirementSubjectType) => refs.filter((r) => r.subject_type === t).map((r) => r.subject_id);
    const name = (p: Record<string, unknown>) => str(p.display_name) ?? str(p.full_name) ?? ([str(p.first_name), str(p.last_name)].filter(Boolean).join(" ") || null);
    const children = await readIn<Record<string, unknown>>(supabase, by("child"), (c) => supabase.from("customer_members").select("id, display_name, first_name, last_name, customer_id").eq("org_id", orgId).in("id", c));
    for (const c of children ?? []) out.set(`child:${c.id}`, { label: name(c) ?? "Child", household_id: str(c.customer_id) });
    const households = await readIn<Record<string, unknown>>(supabase, by("household"), (c) => supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", c));
    for (const h of households ?? []) out.set(`household:${h.id}`, { label: str(h.name) ?? "Household", household_id: String(h.id) });
    const people = await readIn<Record<string, unknown>>(supabase, by("person"), (c) => supabase.from("persons").select("id, full_name, first_name, last_name").eq("org_id", orgId).in("id", c));
    for (const p of people ?? []) out.set(`person:${p.id}`, { label: name(p) ?? "Person", household_id: null });
    const cases = await readIn<Record<string, unknown>>(supabase, by("opportunity"), (c) => supabase.from("opportunities").select("id, title, name, customer_id").eq("org_id", orgId).in("id", c));
    for (const o of cases ?? []) out.set(`opportunity:${o.id}`, { label: str(o.title) ?? str(o.name) ?? "Enrollment case", household_id: str(o.customer_id) });
    return out;
}

export type RequirementWorkResult = { ok: true; rows: RequirementWorkRow[]; truncated: boolean; today: string } | { ok: false; code: string };

/**
 * The unmet, required document requirements this actor may see, as derived work rows. Satisfying the requirement
 * (accepted evidence) or an applicable waiver makes the row disappear on the next read; nothing is stored or closed.
 */
export async function listRequirementWork(supabase: SupabaseClient, actor: RequirementActor, input: { today?: string } = {}): Promise<RequirementWorkResult> {
    const { orgId } = actor;
    const today = input.today ?? todayIso();
    if (!actor.scope) return { ok: true, rows: [], truncated: false, today };
    const [requirements, types] = await Promise.all([loadLiveRequirements(supabase, orgId), loadRequirementTypes(supabase, orgId)]);
    if (!requirements || !types) return { ok: false, code: "WORK_UNAVAILABLE" };
    const visible = requirements.filter((r) => r.policy === "required" && actorMaySeeRequirement(actor, types, r.document_type_key));

    let truncated = false;
    const evaluations: RequirementEvaluation[] = [];
    const evidenceRows: EvidenceRow[] = [];
    for (const r of visible) {
        const population = await requirementPopulation(supabase, orgId, r);
        if (!population) return { ok: false, code: "WORK_UNAVAILABLE" };
        truncated = truncated || population.truncated;
        const refs = await subjectsInActorScope(supabase, actor, population.refs);
        const system = await evaluateSubjects(supabase, orgId, refs, { requirements: [r], types, today });
        if (!system) return { ok: false, code: "WORK_UNAVAILABLE" };
        evaluations.push(...system.evaluations.filter(evaluationNeedsWork));
        for (const list of system.evidence.values()) evidenceRows.push(...list);
    }
    const readable = await readableEvidenceIds(supabase, actor, evidenceRows);
    const labels = await subjectLabels(supabase, orgId, evaluations.map((e) => ({ subject_type: e.subject_type, subject_id: e.subject_id })));
    const rows: RequirementWorkRow[] = evaluations
        .map((e) => {
            const l = labels.get(subjectKey(e));
            return {
                id: requirementWorkId(e.requirement_id, e),
                requirement_id: e.requirement_id,
                requirement_key: e.requirement_key,
                requirement_label: e.label,
                document_type_key: e.document_type_key,
                document_type_label: types.get(e.document_type_key)?.label ?? null,
                subject_type: e.subject_type,
                subject_id: e.subject_id,
                subject_label: l?.label ?? "Record",
                household_id: l?.household_id ?? null,
                state: e.state as RequirementWorkRow["state"],
                blocked_reason: e.blocked_reason,
                due_on: e.due_on,
                overdue: Boolean(e.due_on && e.due_on < today),
                waivable: e.waivable,
                pending_document_ids: e.evidence.pending.filter((id) => readable.has(id)),
            };
        })
        .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.subject_label.localeCompare(b.subject_label) || a.id.localeCompare(b.id));
    if (rows.length > REQUIREMENT_WORK_LIMIT) truncated = true;
    return { ok: true, rows: rows.slice(0, REQUIREMENT_WORK_LIMIT), truncated, today };
}

// ── Business Process readiness ──────────────────────────────────────────────────────────────────────────────────
/**
 * For a Business Process stage that requires documents of the given types for a journey's child, the Documents answer
 * per type key. When a live Documents requirement for the type reaches the child, its evaluation is the answer (its
 * waivers included). When none does, the stage requirement is evaluated as a required, non-waivable requirement for
 * the child through the SAME evaluator — Business Process never decides document satisfaction itself.
 *
 * System-level: Business Process readiness is not an actor-facing disclosure. Null when facts could not be read.
 */
export async function evaluateDocumentTypeRequirementsForChild(
    supabase: SupabaseClient,
    input: { orgId: string; childId: string; typeKeys: string[]; today?: string },
): Promise<Map<string, RequirementEvaluation> | null> {
    const today = input.today ?? todayIso();
    const keys = [...new Set(input.typeKeys.filter(Boolean))];
    if (keys.length === 0) return new Map();
    const [requirements, types] = await Promise.all([loadLiveRequirements(supabase, input.orgId), loadRequirementTypes(supabase, input.orgId)]);
    if (!requirements || !types) return null;
    const ref: SubjectRef = { subject_type: "child", subject_id: input.childId };
    const live = requirements.filter((r) => r.subject_type === "child" && keys.includes(r.document_type_key));
    const stage: EvaluableRequirement[] = keys.map((k) => ({
        requirement_id: `stage:${k}`,
        requirement_key: `stage_${k}`,
        version_id: `stage:${k}`,
        label: types.get(k)?.label ?? k,
        document_type_key: k,
        subject_type: "child",
        scope: { kind: "all" },
        timing: { kind: "immediate" },
        policy: "required",
        waivable: false,
        effective_from: null,
        effective_until: null,
    }));
    const system = await evaluateSubjects(supabase, input.orgId, [ref], { requirements: [...live, ...stage], types, today });
    if (!system) return null;
    const out = new Map<string, RequirementEvaluation>();
    for (const k of keys) {
        const fromLive = system.evaluations.find((e) => e.document_type_key === k && !e.requirement_id.startsWith("stage:"));
        const fromStage = system.evaluations.find((e) => e.requirement_id === `stage:${k}`);
        const chosen = fromLive ?? fromStage;
        if (chosen) out.set(k, chosen);
    }
    return out;
}
