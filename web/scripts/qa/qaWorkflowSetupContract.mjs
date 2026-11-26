/**
 * THE MINIMAL QA SETUP A WORKFLOW NEEDS — declared by the product, implemented by the platform, judged here.
 *
 * Measured on toolkit 2aa8b30d6dd8 (lib/qa-run-db.mjs, lib/qa-run-action.mjs): opening a frozen plan on a fresh
 * certification environment creates EVERY registry identity (11), assigns EVERY plan persona (bp_v2: 4, with a
 * derived custom role), and verifies each session by rendering `/workspace` in the preview — a 1,600-file page graph
 * whose effects cannot be enumerated and that statically reaches the messaging modules. A workflow that needs one
 * persona pays for all of it, and every lane inherits it.
 *
 * This contract states, per workflow, the smallest setup that proves it, and `judgeQaSetupRecord` refuses any setup
 * record that did more:
 *   · personas — exactly the declared keys, with exactly the declared roles and scope; no undeclared identity is
 *     created or leased (the org's actor is the one standing exception — every audited access change names it);
 *   · custom roles — none unless declared;
 *   · session verification — `auth_user_probe` (the platform asks the environment's own auth API who the session's
 *     token belongs to: `GET <api>/auth/v1/user`), NEVER an application page render; and only for personas whose
 *     workflow needs a session;
 *   · page renders during setup — none. The only pages a workflow renders are its adapter's routes, inside its own
 *     governed operation (`qaWorkflowVerifier.mjs`);
 *   · sends — zero: no email, SMS or messaging request, and magic links generated, never sent;
 *   · the fixture child receives `ALLOY_QA_IDENTITY_EMAIL` for every session persona (the verifier compares the
 *     page's own identity with it).
 *
 * The vectors (`tests/qa/fixtures/qa-workflow-setup.vectors.json`) are the platform's acceptance test: each
 * `accept` record must judge ok and each `refuse` record must refuse with its named code.
 */

export const QA_WORKFLOW_SETUP_SCHEMA = "alloy.qa_workflow_setup.v1";
export const SESSION_VERIFICATION_KINDS = Object.freeze(["none", "auth_user_probe"]);

export const QA_SETUP_REFUSALS = Object.freeze({
    UNKNOWN_WORKFLOW: "qa_setup_workflow_unknown",
    RECORD: "qa_setup_record_malformed",
    UNDECLARED_PERSONA: "qa_setup_undeclared_persona",
    MISSING_PERSONA: "qa_setup_declared_persona_missing",
    ROLES: "qa_setup_persona_roles_mismatch",
    SCOPE: "qa_setup_persona_scope_mismatch",
    IDENTITY: "qa_setup_undeclared_identity",
    CUSTOM_ROLE: "qa_setup_undeclared_custom_role",
    SESSION_KIND: "qa_setup_session_verification_not_minimal",
    SESSION_EXTRA: "qa_setup_undeclared_session",
    SESSION_MISSING: "qa_setup_declared_session_unverified",
    PAGE_RENDER: "qa_setup_page_render",
    SEND: "qa_setup_send",
    PREVIEW: "qa_setup_preview_mismatch",
    IDENTITY_EMAIL: "qa_setup_identity_email_not_bound",
});

const persona = (key, org, roles, session) => Object.freeze({ key, org, roles: Object.freeze([...roles]), scope: "all", session });

/** The setups Financials needs. Other lanes add their own entries (see the compatibility matrix in the handoff). */
export const QA_WORKFLOW_SETUPS = Object.freeze({
    /* Domain service suite: service credential, seed org; no browser, so no session and no preview. */
    financials_isolated_tests: Object.freeze({
        workflow: "financials_isolated_tests",
        operations: Object.freeze(["run"]),
        org_key: "qa_shared",
        personas: Object.freeze([persona("admin", "qa_shared", ["admin"], false)]),
        custom_roles: Object.freeze([]),
        session_verification: "none",
        preview: false,
    }),
    /* Persona fixture + rendered read-only proof: one admin session, one preview. */
    financials_historical_draft: Object.freeze({
        workflow: "financials_historical_draft",
        operations: Object.freeze(["count", "ensure", "verify", "ui-verify", "reset"]),
        org_key: "qa_shared",
        personas: Object.freeze([persona("admin", "qa_shared", ["admin"], true)]),
        custom_roles: Object.freeze([]),
        session_verification: "auth_user_probe",
        preview: true,
    }),
});

const refuse = (code, detail) => ({ ok: false, code, detail });
const sameSet = (a, b) => {
    const x = [...new Set(a)].sort();
    const y = [...new Set(b)].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
};
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Judge what a platform setup DID (its record) against what the workflow declared. Record shape:
 * `{ workflow, personas: [{ key, identity, roles, scope, session, identity_email? }], identities_created: string[],
 *    org_actor: string, custom_roles: string[], session_verification: { kind, page_renders: string[] },
 *    sends: number, preview: boolean }`.
 * → `{ ok: true }` or `{ ok: false, code, detail }` (the FIRST violation, in a fixed order).
 */
export function judgeQaSetupRecord(record, { setups = QA_WORKFLOW_SETUPS } = {}) {
    const R = QA_SETUP_REFUSALS;
    const declared = setups[String(record?.workflow || "")];
    if (!declared) return refuse(R.UNKNOWN_WORKFLOW, String(record?.workflow || "(none)"));
    const r = record;
    const shapeOk = Array.isArray(r.personas) && Array.isArray(r.identities_created) && typeof r.org_actor === "string"
        && Array.isArray(r.custom_roles) && r.session_verification && typeof r.session_verification === "object"
        && Array.isArray(r.session_verification.page_renders) && Number.isInteger(r.sends) && r.sends >= 0 && typeof r.preview === "boolean"
        && r.personas.every((p) => p && typeof p.key === "string" && typeof p.identity === "string" && Array.isArray(p.roles) && typeof p.session === "boolean");
    if (!shapeOk) return refuse(R.RECORD, "the setup record is not the contract's shape");

    if (r.sends !== 0) return refuse(R.SEND, `sends=${r.sends}`);
    if (r.session_verification.page_renders.length) return refuse(R.PAGE_RENDER, `${r.session_verification.page_renders.length} page render(s) during setup`);
    const want = new Map(declared.personas.map((p) => [p.key, p]));
    const extra = r.personas.filter((p) => !want.has(p.key)).map((p) => p.key);
    if (extra.length) return refuse(R.UNDECLARED_PERSONA, extra.join(","));
    const missing = declared.personas.filter((p) => !r.personas.some((x) => x.key === p.key)).map((p) => p.key);
    if (missing.length) return refuse(R.MISSING_PERSONA, missing.join(","));
    for (const p of r.personas) {
        const d = want.get(p.key);
        if (!sameSet(p.roles, d.roles)) return refuse(R.ROLES, p.key);
        if (String(p.scope ?? "all") !== d.scope) return refuse(R.SCOPE, p.key);
    }
    const allowedIdentities = new Set([r.org_actor, ...r.personas.map((p) => p.identity)]);
    const strangers = r.identities_created.filter((i) => !allowedIdentities.has(i));
    if (strangers.length) return refuse(R.IDENTITY, `${strangers.length} undeclared identit${strangers.length === 1 ? "y" : "ies"}`);
    const roles = r.custom_roles.filter((k) => !declared.custom_roles.includes(k));
    if (roles.length) return refuse(R.CUSTOM_ROLE, roles.join(","));
    const kind = String(r.session_verification.kind || "");
    if (kind !== declared.session_verification) return refuse(R.SESSION_KIND, `${kind || "(none)"} — declared ${declared.session_verification}`);
    for (const p of r.personas) {
        const d = want.get(p.key);
        if (p.session && !d.session) return refuse(R.SESSION_EXTRA, p.key);
        if (!p.session && d.session) return refuse(R.SESSION_MISSING, p.key);
        if (d.session && !EMAIL.test(String(p.identity_email || ""))) return refuse(R.IDENTITY_EMAIL, p.key);
    }
    if (r.preview !== declared.preview) return refuse(R.PREVIEW, `preview=${r.preview} — declared ${declared.preview}`);
    return { ok: true };
}
