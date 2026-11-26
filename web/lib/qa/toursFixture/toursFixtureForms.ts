/**
 * THE TWO LEAD-CAPTURE FORMS of the Tours certification fixture (G-T5) — owned by the QA run, never borrowed.
 *
 * A freshly built isolated baseline seeds no form in `qa_shared` (packet §3: "G-T5 forms absent"), and a form someone
 * else left is not this run's evidence. So the fixture authors exactly two, in the verified persona org, through the
 * product's own Forms routes on the trusted preview, as the bound persona — the same seam as its links:
 *
 *   POST /api/admin/forms                                        definition (explicit run-owned key, marked metadata)
 *   POST /api/admin/forms/[formId]/versions                      one draft (one optional question, marked)
 *   POST /api/admin/forms/[formId]/versions/[versionId]/publish  publish (the route's own schema / question gates)
 *
 * The forms carry the stored operational intent `enrollment_lead`, so the public-links route merges the lead-capture
 * intake defaults into every link minted on them (`mergePublicLinkMetadataForCreate`) — the product decides that a
 * link is lead-capture, the fixture never writes `lead_capture` itself.
 *
 * OWNERSHIP. Run-owned keys and markers: `tours_cert_<role>_<sha256(qa_run_id)[0..12]>`, and
 * `{ qa_fixture: tours_location_only_v1, qa_fixture_key: <role>, qa_run: <qa_run_id> }` on the definition and on its
 * version. The run id is the VERIFIED authority's `qa_run_id`, never the environment's copy. Fail closed:
 *   · a row at a planned key that is not this run's (unmarked, another fixture, another run, another role) → refused;
 *   · a planned key present in ANOTHER organization → refused (the route acts in the session's org; a run-owned key
 *     elsewhere means that org was written to once already);
 *   · a run-marked form that is not one of the two planned ones → refused;
 *   · an inactive owned form, a form without the lead-capture intent, a version that is not this run's, or two
 *     published versions → refused;
 *   · after a create, the new id must be found in the verified org at the planned key, owned — otherwise
 *     `form_created_outside_fixture_org` (if it is visible in another org) or `form_create_unverified`.
 * Idempotent per run (found-or-created step by step, so an interrupted ensure completes on the next one: a definition
 * without a version gets one draft, an owned draft gets published), and never a second definition or published
 * version.
 *
 * DISPOSITION. The product has no form deletion and this fixture invents none: the two definitions and their two
 * published versions are RETAINED by reset (not archived, not deactivated) and counted on their own
 * (`retained_fixture_forms=<n>` / `retained_fixture_form_versions=<n>`), never inside `census count=`.
 */

import { createHash } from "node:crypto";

export const TOURS_FIXTURE_FORM_MARKER_KEY = "qa_fixture";
export const TOURS_FIXTURE_FORM_MARKER = "tours_location_only_v1";
export const TOURS_FIXTURE_FORM_ROLE_KEY = "qa_fixture_key";
/** The run key every run-owned row carries (the same name the Enrollment fixture uses). */
export const TOURS_FIXTURE_RUN_KEY = "qa_run";

/** The stored operational intent that makes the product mint lead-capture intake links on a form. */
export const TOURS_FIXTURE_FORM_INTENT = "enrollment_lead";

/** Exactly two forms, in this order: A (three links, one withdrawn) and B (one link). */
export const FORM_PLAN = [
    { role: "form_a", name: "Tours cert inquiry A (fixture)" },
    { role: "form_b", name: "Tours cert inquiry B (fixture)" },
] as const;
export type FormRole = (typeof FORM_PLAN)[number]["role"];

/** One optional question, so the publish route's "at least one question" gate holds. */
export const FIXTURE_FORM_SCHEMA = Object.freeze({
    schema_version: 1,
    title: "Tours certification inquiry (fixture)",
    sections: [{ id: "sec_inquiry", title: "Inquiry", field_ids: ["note"] }],
    fields: [{ id: "note", type: "text", label: "Synthetic certification note", required: false }],
});

const QA_RUN_RE = /^qar_[a-z0-9]{8,}$/i;

/** The run's key suffix: 12 hex of sha256(qa_run_id). No id is ever printed. */
export function runSuffix(qaRunId: string): string {
    if (!QA_RUN_RE.test(qaRunId)) throw new Error("fixture_run_required");
    return createHash("sha256").update(`tours_certification|${qaRunId}`).digest("hex").slice(0, 12);
}

export function formKeyFor(role: FormRole, qaRunId: string): string {
    return `tours_cert_${role}_${runSuffix(qaRunId)}`;
}

export function runMarker(role: string, qaRunId: string): Record<string, string> {
    return { [TOURS_FIXTURE_FORM_MARKER_KEY]: TOURS_FIXTURE_FORM_MARKER, [TOURS_FIXTURE_FORM_ROLE_KEY]: role, [TOURS_FIXTURE_RUN_KEY]: qaRunId };
}

const meta = (m: unknown): Record<string, unknown> => (m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {});
export const isFixtureMarked = (m: unknown): boolean => meta(m)[TOURS_FIXTURE_FORM_MARKER_KEY] === TOURS_FIXTURE_FORM_MARKER;
export const runOf = (m: unknown): string => String(meta(m)[TOURS_FIXTURE_RUN_KEY] ?? "");
/** Owned by THIS run (marker and run), and — when given — in this role. */
export function ownedByRun(m: unknown, qaRunId: string, role?: string): boolean {
    const x = meta(m);
    return isFixtureMarked(m) && x[TOURS_FIXTURE_RUN_KEY] === qaRunId && (role === undefined || x[TOURS_FIXTURE_FORM_ROLE_KEY] === role);
}

export type FixtureFormRow = { id: string; org_id: string; key: string; name: string; is_active: boolean | null; metadata: Record<string, unknown> | null };
export type FixtureFormVersionRow = { id: string; org_id: string; form_definition_id: string; status: string; metadata: Record<string, unknown> | null };

export interface ToursFormPorts {
    /** Form definitions in the fixture org at any of `keys`, or carrying the fixture marker (any run). */
    findFixtureFormRows(keys: readonly string[]): Promise<FixtureFormRow[]>;
    /** How many form definitions OUTSIDE the fixture org sit at any of `keys`. */
    countFormKeysOutsideOrg(keys: readonly string[]): Promise<number>;
    /** Where a just-created id landed (any org): its org, or null when not visible at all. */
    findFormOrg(formId: string): Promise<string | null>;
    /** Every version of these definitions, in the fixture org. */
    listFormVersions(formIds: readonly string[]): Promise<FixtureFormVersionRow[]>;
    /** Through POST /api/admin/forms only. Returns the new definition's id. */
    createForm(input: { key: string; name: string; metadata: Record<string, unknown> }): Promise<string>;
    /** Through POST /api/admin/forms/[formId]/versions only. Returns the new draft's id. */
    createDraftVersion(input: { formId: string; schema: unknown; metadata: Record<string, unknown> }): Promise<string>;
    /** Through POST /api/admin/forms/[formId]/versions/[versionId]/publish only. */
    publishVersion(input: { formId: string; versionId: string }): Promise<void>;
}

export type OwnedForm = { id: string; title: string; role: FormRole; publishedVersionId: string };
export type FormsJudgement =
    | { ok: true; forms: (OwnedForm | null)[]; byRole: Map<FormRole, { row: FixtureFormRow | null; versions: FixtureFormVersionRow[] }> }
    | { ok: false; code: string };

/** Read-only: the run's two forms as they are now, or the first ownership refusal. Writes nothing. */
export async function judgeFixtureForms(p: ToursFormPorts, world: { orgId: string; runId: string }): Promise<FormsJudgement> {
    const keys = FORM_PLAN.map((f) => formKeyFor(f.role, world.runId));
    if ((await p.countFormKeysOutsideOrg(keys)) > 0) return { ok: false, code: "form_key_in_foreign_org" };
    const rows = await p.findFixtureFormRows(keys);
    if (rows.some((r) => r.org_id !== world.orgId)) return { ok: false, code: "form_foreign_org" };
    // A run-marked form that is not one of the two planned ones (another key, or a planned key in the wrong role).
    const planned = new Map(FORM_PLAN.map((f) => [formKeyFor(f.role, world.runId), f.role as string]));
    if (rows.some((r) => ownedByRun(r.metadata, world.runId) && planned.get(r.key) !== meta(r.metadata)[TOURS_FIXTURE_FORM_ROLE_KEY])) return { ok: false, code: "unexpected_run_form" };
    const byRole = new Map<FormRole, { row: FixtureFormRow | null; versions: FixtureFormVersionRow[] }>();
    const atKey = rows.filter((r) => planned.has(r.key));
    const versions = atKey.length ? await p.listFormVersions(atKey.map((r) => r.id)) : [];
    const forms: (OwnedForm | null)[] = [];
    for (const f of FORM_PLAN) {
        const hits = rows.filter((r) => r.key === formKeyFor(f.role, world.runId));
        if (hits.length > 1) return { ok: false, code: "form_key_ambiguous" };
        const row = hits[0] ?? null;
        if (row && !ownedByRun(row.metadata, world.runId, f.role)) return { ok: false, code: "form_key_not_owned" };
        if (row && row.is_active !== true) return { ok: false, code: "form_inactive" };
        if (row && meta(row.metadata).intake_intent !== TOURS_FIXTURE_FORM_INTENT) return { ok: false, code: "form_not_lead_capture" };
        const own = row ? versions.filter((v) => v.form_definition_id === row.id) : [];
        if (own.some((v) => v.org_id !== world.orgId || !ownedByRun(v.metadata, world.runId, f.role))) return { ok: false, code: "form_version_not_owned" };
        const published = own.filter((v) => v.status === "published");
        if (published.length > 1) return { ok: false, code: "form_published_twice" };
        byRole.set(f.role, { row, versions: own });
        forms.push(row && published[0] ? { id: row.id, title: row.name, role: f.role, publishedVersionId: published[0].id } : null);
    }
    return { ok: true, forms, byRole };
}

export type FormsEnsured = { ok: true; forms: [OwnedForm, OwnedForm]; createdForms: number; createdVersions: number; publishedVersions: number } | { ok: false; code: string };

/**
 * ENSURE the two forms: judge, then for each planned form create what is missing through the product routes and
 * re-judge after every write (a create is accepted only once it is found, owned, in the verified org).
 */
export async function ensureFixtureForms(p: ToursFormPorts, world: { orgId: string; runId: string }): Promise<FormsEnsured> {
    let createdForms = 0;
    let createdVersions = 0;
    let publishedVersions = 0;
    for (const f of FORM_PLAN) {
        let j = await judgeFixtureForms(p, world);
        if (!j.ok) return j;
        let slot = j.byRole.get(f.role)!;
        if (!slot.row) {
            const id = await p.createForm({
                key: formKeyFor(f.role, world.runId),
                name: f.name,
                metadata: { ...runMarker(f.role, world.runId), intake_intent: TOURS_FIXTURE_FORM_INTENT },
            });
            createdForms += 1;
            // Where it landed first: a create in another org is that, not a later key collision.
            const landed = await p.findFormOrg(id);
            if (landed !== world.orgId) return { ok: false, code: landed ? "form_created_outside_fixture_org" : "form_create_unverified" };
            j = await judgeFixtureForms(p, world);
            if (!j.ok) return j;
            slot = j.byRole.get(f.role)!;
            if (!slot.row || slot.row.id !== id) return { ok: false, code: "form_create_unverified" };
        }
        const formId = slot.row.id;
        if (slot.versions.some((v) => v.status === "published")) continue;
        let draft = slot.versions.find((v) => v.status === "draft") ?? null;
        if (!draft) {
            const id = await p.createDraftVersion({ formId, schema: FIXTURE_FORM_SCHEMA, metadata: runMarker(f.role, world.runId) });
            createdVersions += 1;
            j = await judgeFixtureForms(p, world);
            if (!j.ok) return j;
            draft = j.byRole.get(f.role)!.versions.find((v) => v.id === id && v.status === "draft") ?? null;
            if (!draft) return { ok: false, code: "form_version_create_unverified" };
        }
        await p.publishVersion({ formId, versionId: draft.id });
        publishedVersions += 1;
        j = await judgeFixtureForms(p, world);
        if (!j.ok) return j;
        if (!j.byRole.get(f.role)!.versions.some((v) => v.id === draft!.id && v.status === "published")) return { ok: false, code: "form_publish_unverified" };
    }
    const done = await judgeFixtureForms(p, world);
    if (!done.ok) return done;
    const [a, b] = done.forms;
    if (!a || !b) return { ok: false, code: "form_publish_unverified" };
    return { ok: true, forms: [a, b], createdForms, createdVersions, publishedVersions };
}

/** Every fixture-marked form and version in the org (any run): what reset retains, counted on its own. */
export function retainedFormsOf(rows: readonly FixtureFormRow[], versions: readonly FixtureFormVersionRow[]): { forms: number; versions: number } {
    const marked = rows.filter((r) => isFixtureMarked(r.metadata));
    const ids = new Set(marked.map((r) => r.id));
    return { forms: marked.length, versions: versions.filter((v) => ids.has(v.form_definition_id)).length };
}
