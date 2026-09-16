/**
 * Mounted-certification persona fixtures on the certification stack.
 *
 * Real auth users with real passwords, because every persona must sign in through the product's own
 * login flow. Each is created idempotently and removed by the teardown.
 *
 * **This lives in the repository rather than in a session scratchpad, and W-13 is why.** The
 * Access & Identity mounted matrix ran once from a throwaway copy of this file; the personas it
 * created were cleaned up, the script went with the session, and the next run had nothing to
 * reproduce. A mounted proof whose subjects cannot be recreated is a screenshot.
 *
 * Every write is bounded to these six principals and the custom roles they hold. It touches no
 * seeded fixture and no other worktree's data, and `teardown` puts the stack back.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/*
 * Resolved from `web/package.json`, not from this file's own directory. `certification/` carries no
 * `node_modules` — it is a sibling of the app package, not a package — so a bare ESM import here
 * fails wherever it is invoked from. Anchoring the resolver to the app's manifest makes the fixture
 * runnable from the repository root, from `web/`, or from a Playwright worker, without a symlink
 * that has to be created and remembered.
 */
const require = createRequire(new URL("../../../web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const envFile = new URL("../../../web/.env.certification.local", import.meta.url).pathname;
const text = readFileSync(envFile, "utf8");
const read = (k) => text.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
const key = read("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("cert env incomplete");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

export const ORG = "00000000-0000-4000-8000-000000000001";

/**
 * WHO THIS FIXTURE IS, WHEN IT CHANGES ACCESS.
 *
 * D2 made every access producer refuse a change that does not name its actor. This fixture provisions
 * roles through the SAME canonical RPC the role editor calls — deliberately, because the alternative
 * is a second, unaudited way to grant capabilities, which is the exact hole `20260911220000` closed by
 * dropping the narrow signatures rather than keeping them as shims.
 *
 * So the fixture names itself. It is not a person and does not borrow one: attributing provisioning to
 * the seeded operator would put a change in an operator's history that the operator did not make, which
 * is the attribution lie D2 exists to prevent. `origin: "system"` is what makes the presenter render it
 * as a system actor rather than as a departed colleague.
 */
/*
 * W-18. THIS USED TO BE THE STRING "fixture:access-personas", AND THE DELEGATION CEILING REFUSED IT.
 *
 * Rightly. A synthetic actor holds no roles, so it holds no authority, so it may delegate none —
 * and provisioning a persona with `fin.read` is a delegation like any other. The fixture had been
 * relying on the unbounded grant path this slice closed.
 *
 * The fix is not an exemption. `p_origin` is a PARAMETER, so "trust me, I am the system" is
 * caller-selectable and would hand every caller the bypass. Instead the fixture now provisions as
 * the seeded organization administrator, which is what it has always been pretending to be: a human
 * with the authority to hand these capabilities out. D2 attributes the provisioning to that
 * principal, which is truer than attributing it to a script name.
 */
export const FIXTURE_ACTOR = "00000000-0000-4000-8000-000000000002";
export const FIXTURE_ORIGIN = "system";
export const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
export const PASSWORD = "alloy-local-cert";

/** Custom roles the ORGANIZATION defines — created through the same RPC the Access editor calls. */
export const CUSTOM = {
    viewer: "mcert_fin_viewer",
    none: "mcert_front_desk",
    portalFinance: "mcert_portal_finance",
    portalOnly: "mcert_portal_only",

    /*
     * ── THE FORMS THREE-CAPABILITY MODEL, ONE ROLE PER CLAIM ──
     *
     * Forms authority used to be the word "admin" in twenty-two route handlers. It is now three
     * capabilities, and the only way to show they are genuinely three — rather than one capability
     * wearing three names — is to give a different person each one and watch the product answer
     * differently for each.
     *
     * Every one of these also holds `portal.access`, because W-13 made admission its own
     * capability: a role carrying every Forms key and no admission would be refused at the front
     * door, and the refusal would look like a Forms defect. Admission is the precondition of the
     * question, not part of it.
     *
     * `formsTitular` is the control. Its LABEL is "Forms Administrator" and it holds no Forms
     * capability at all — so if any handler has quietly kept reading a job title, this is the
     * persona that passes when it should not.
     */
    /*
     * ── WORKFLOW AUTHORITY: AUTHORING AUTOMATION IS NOT FIRING IT ──
     *
     * `wfWriter` holds `ops.workflows.write` and NO privileged title, which is precisely the
     * principal the old `requireAdmin()` gate refused while admitting an admin whose package
     * withholds the key. `wfTitular` is the control: its LABEL is "Workflow Administrator" and it
     * holds no Workflow capability, so it passes only if a handler is still reading a job title.
     *
     * `wfAdjacent` carries a NEIGHBOURING configuration authority and no Workflow key. It exists
     * because the interesting failure is not "nobody gets in" but "somebody adjacent gets in":
     * Business Process configuration and Workflow configuration sit beside each other in the
     * product and must not imply one another.
     */
    /*
     * ── TOURS: SETTING THE HOURS IS NOT BOOKING THE FAMILY ──
     *
     * `tourConfigurer` sets when and where tours may be booked; `tourBooker` operates one family's
     * tour. Each holds ONE key, because the matrix is about what each CANNOT do — a configurer who
     * could cancel a family's tour, or a booker who could rewrite the organization's availability,
     * would mean the split exists only on paper.
     *
     * `tourTitular` is the control: labelled "Tour Administrator", granted only admission.
     * `tourScheduler` is the near-miss — it holds `scheduling.write`, the key most likely to be
     * mistaken for tour availability, and must open nothing.
     */
    /*
     * WORK. The two keys are deliberately split across two roles that each hold one half, because
     * the whole Director model is that defining work and doing work are different powers. A single
     * persona holding both would prove nothing about the boundary between them.
     *
     * `workTitular` is the control: labelled "Work Administrator", granted admission and nothing
     * else. `aiUser` is the adjacency control — real authority in another family, none here.
     */
    workConfigurer: "mcert_work_configurer",
    workOperator: "mcert_work_operator",
    workTitular: "mcert_work_titular",
    aiUser: "mcert_ai_user",
    tourConfigurer: "mcert_tour_configurer",
    tourBooker: "mcert_tour_booker",
    tourTitular: "mcert_tour_titular",
    tourScheduler: "mcert_tour_scheduler",

    wfWriter: "mcert_wf_writer",
    wfTitular: "mcert_wf_titular",
    wfAdjacent: "mcert_wf_adjacent",

    formsAuthor: "mcert_forms_author",
    formsReader: "mcert_forms_reader",
    formsConfirmer: "mcert_forms_confirmer",
    formsOperator: "mcert_forms_operator",
    formsBystander: "mcert_forms_bystander",
    formsTitular: "mcert_forms_titular",
    /*
     * The CRM contrast. `crm-entity-search` lives under /api/admin/forms and used to be gated on
     * the `admin` role, but what it returns is the CRM's data, so the authority that owns it is
     * `crm.customers.read`. This role holds admission and that key and NO Forms capability, which
     * is what makes the pair of probes specific: `formsOperator` holds all three Forms keys and is
     * refused here, this one holds none of them and is admitted.
     *
     * It exists rather than reusing `none`, which deliberately has no `portal.access`: a persona
     * missing admission is refused by W-13 before the CRM key is ever consulted, so a probe with
     * that subject varies two things at once and proves neither.
     */
    formsCrm: "mcert_forms_crm",

    /*
     * ── THE PROCESSING MATRIX ──
     *
     * Four capabilities that deliberately do not imply one another, so each gets a role holding
     * exactly one of them. The point of the matrix is the DENIALS: a processor must not be able to
     * archive, an archiver must not be able to work a case, and neither may touch a document.
     *
     * `procTitular` is the role-name control — labelled "Admin", holding nothing.
     *
     * `procPortalOnly` is the security control for the tightening half of this slice. Before it,
     * every Processing mutation listed under `processing.operate` was authorized by portal
     * admission alone, so this persona could commit them. It must now be refused, while the reads
     * that were open to it stay open.
     *
     * `procDocsWriter` is the reason `processing.documents.manage` exists at all: it holds the
     * general `documents.write` that ops holds in every organization, and must still be refused the
     * destructive Processing document operations.
     */
    procOperate: "mcert_proc_operate",
    procArchive: "mcert_proc_archive",
    procDocs: "mcert_proc_docs",
    procDevCleanup: "mcert_proc_devcleanup",
    procTitular: "mcert_proc_titular",
    procPortalOnly: "mcert_proc_portal_only",
    procDocsWriter: "mcert_proc_docs_writer",
    procFormsAuthor: "mcert_proc_forms_author",

    /*
     * ── SCHEDULES, JOBS, AND THE MONEY THEY POST ──
     *
     * Three capabilities that deliberately do not imply one another. The matrix exists for the
     * DENIALS: a schedule manager must not be able to post a cash receipt, a job manager must not
     * be able to raise a charge, and a financial poster must not be able to edit a schedule.
     *
     * `sjTitular` is the role-name control — labelled "Admin", holding nothing.
     * `sjFinWrite` is the reason fin.post exists: it holds the `fin.write` that ops holds in every
     * organization, and must still be refused all four money postings.
     */
    sjScheduler: "mcert_sj_scheduler",
    sjJobber: "mcert_sj_jobber",
    sjPoster: "mcert_sj_poster",
    sjTitular: "mcert_sj_titular",
    sjFinWrite: "mcert_sj_finwrite",
    finAdjuster: "mcert_fin_adjuster",
    ceilingActor: "mcert_ceiling_actor",
    ceilingSupply: "mcert_ceiling_supply",
    axUserAdmin: "mcert_ax_user_admin",
    axRoleAdmin: "mcert_ax_role_admin",
    axScopeAdmin: "mcert_ax_scope_admin",
    axDeviceAdmin: "mcert_ax_device_admin",
    axAuditor: "mcert_ax_auditor",

    /*
     * ── CONFIGURATION: THE SENSITIVITY SPLIT ──
     *
     * Six roles, one capability each, because the point of the split is what each one CANNOT do. A
     * manage key must not delete, and it must not publish. `cfgTitular` is labelled "Admin" and
     * holds nothing.
     */
    cfgOptionManager: "mcert_cfg_option_manager",
    cfgOptionDeleter: "mcert_cfg_option_deleter",
    cfgLayoutManager: "mcert_cfg_layout_manager",
    cfgLayoutLifecycle: "mcert_cfg_layout_lifecycle",
    cfgFieldManager: "mcert_cfg_field_manager",
    cfgFieldDeleter: "mcert_cfg_field_deleter",
    cfgTitular: "mcert_cfg_titular",
    cfgSectionManager: "mcert_cfg_section_manager",

    /*
     * DEPARTMENT PRODUCT RETIREMENT + BUSINESS PROCESS AUTHORITY CONVERGENCE V1.
     *
     * The four roles that prove the split is real. `bpConfigurer` may design a process and may not
     * switch the tenant onto it; `bpActivator` is the mirror; `bpComposed` holds both, which is how
     * an organization reconstructs the old admin-only behaviour out of capabilities; and `bpTitular`
     * is LABELLED Admin and holds nothing, which is the claim the whole program rests on.
     */
    bpConfigurer: "mcert_bp_configurer",
    bpActivator: "mcert_bp_activator",
    bpComposed: "mcert_bp_composed",
    bpTitular: "mcert_bp_titular",
    /*
     * The scope persona. Holds BOTH business process keys and is restricted to ONE operational
     * domain, which is the claim the Department convergence must not quietly break: the product
     * language stopped saying Department, and the scope dimension still binds.
     */
    bpScoped: "mcert_bp_scoped",

    /*
     * OPERATIONAL INTELLIGENCE AUTHORITY CONVERGENCE V1.
     *
     * The pair that proves read and write are genuinely separable after the ops default correction:
     * a reader who may open Operational Intelligence and change nothing, and a writer who may author
     * it. `oiTitular` is labelled Admin and holds neither.
     */
    oiWriter: "mcert_oi_writer",

    /*
     * ── THE FIVE COMMUNICATIONS AUTHORITIES, ONE ROLE PER CLAIM ──
     *
     * Communications had two capability keys and five materially different powers, and the gap was
     * filled by `requireAdminOrOps()` — portal admission wearing the name of a role check. The only
     * way to show the five are genuinely five, rather than one authority wearing five names, is to
     * give a different person each one alone and watch the product answer differently for each.
     *
     * `commsSender` deliberately does NOT hold `communications.read`. If sending implied reading,
     * this persona would see the organization's conversations, and the non-implication the model
     * claims would be false in the direction nobody checks.
     *
     * `commsTitular` is the control, and it is the one that would have caught the defect this
     * closed: its LABEL is "Communications Administrator" and it holds no Communications capability
     * at all. The send path really did open with `roleKeys.some(r => r === "admin" || r === "ops")`,
     * so a role whose TITLE claims authority is the thing worth pointing a persona at.
     *
     * `commsOperator` carries exactly the seeded `ops` package for this area. A custom role with the
     * same grants must behave identically to the system role — that is the whole promise of
     * configurable roles, and the role-title check broke it in both directions.
     */
    commsReader: "mcert_comms_reader",
    commsSender: "mcert_comms_sender",
    commsTemplates: "mcert_comms_templates",
    commsProvider: "mcert_comms_provider",
    commsBulk: "mcert_comms_bulk",
    commsOperator: "mcert_comms_operator",
    commsFull: "mcert_comms_full",
    commsTitular: "mcert_comms_titular",
    commsPortalOnly: "mcert_comms_portal_only",
    /* The union half: held ALONGSIDE commsReader, never alone. Carries no admission of its own. */
    commsUnionBulk: "mcert_comms_union_bulk",

    /*
     * THE CONVERSATION ASSIGNER — the persona that proves assignment is its own authority.
     *
     * It can route the organization's inbox and cannot answer a single message. If assignment had
     * been folded into `communications.send`, this role could not exist, and the scope-escalation
     * path would still be open: `claim` assigns a thread to the ACTOR, and an assigned thread
     * bypasses site scope, so every site-restricted sender could have helped themselves to any
     * conversation in the organization.
     */
    commsAssigner: "mcert_comms_assigner",

    /*
     * ── THE FAMILY RECORD, ONE ROLE PER CLAIM ──
     *
     * `crm.customers.read` and `crm.customers.write` were catalogued since the permission grid and
     * granted to admin and ops everywhere, while the routes they describe were decided by
     * `requireAdminOrOps()`, `ctx.role !== "admin"`, and in four places nothing at all. These four
     * roles are what makes the two keys mean something: each holds a different half.
     *
     * `crmTitular` is the control, and it is pointed at the defect that was actually here: nine
     * handlers gated on the WORD "admin". Its label says Customer Administrator and it holds
     * admission and nothing else.
     */
    crmReader: "mcert_crm_reader",
    crmWriter: "mcert_crm_writer",
    crmWriteOnly: "mcert_crm_write_only",
    crmTitular: "mcert_crm_titular",

    /*
     * ── ORGANIZATION VOCABULARY, AND THE NEIGHBOURS IT MUST NOT REACH ──
     *
     * `configuration.vocabulary.manage` exists because no adjacent Configuration authority truthfully
     * meant it. These roles are what turns that argument into a product answer: a vocabulary manager
     * who cannot touch fields or option sets, and a field manager and an option-set manager who
     * cannot touch vocabulary. `vocabTitular` is labelled Configuration Administrator and holds
     * nothing — eight of these mutations were gated on the word "admin".
     */
    vocabManager: "mcert_vocab_manager",
    vocabTitular: "mcert_vocab_titular",

    /*
     * ── PROGRAMS ──
     *
     * `settings.manage` is the authority Programs already declared, and until this slice it had
     * exactly one enforcement site. This role holds it ALONE, which is what makes it possible to ask
     * whether Programs authority is independently useful: it may publish a Program and distribute it
     * to Locations, and it may not touch fields, option sets, vocabulary, CRM records or money.
     */
    programManager: "mcert_program_manager",

    /*
     * ENROLLMENT RECORD AUTHORITY V1. Four roles, because the two keys must be shown to come
     * apart: a Record Manager who cannot decide, a Decision Manager who cannot edit the record,
     * the composition of both, and a role LABELLED "Enrollment Administrator" holding admission
     * and nothing else. A matrix with only the first two could not tell a real split from one key
     * wearing two names.
     */
    enrollRecord: "mcert_enroll_record",
    enrollDecide: "mcert_enroll_decide",
    enrollBoth: "mcert_enroll_both",
    enrollTitular: "mcert_enroll_titular",
    oiReader: "mcert_oi_reader",
    oiTitular: "mcert_oi_titular",
};

/** The two fixture operational domains the scope proof needs. Exported so the spec names them. */
export const BP_DEPT_ALLOWED = "c0000000-0000-4000-8000-0000000000a1";
export const BP_DEPT_DENIED = "c0000000-0000-4000-8000-0000000000a2";

export const P = {
    director:    { id: "c0000000-0000-4000-8000-00000000d001", email: "cert.director@northwind.invalid",   role: "school_director" },
    regional:    { id: "c0000000-0000-4000-8000-00000000d002", email: "cert.regional@northwind.invalid",   role: "regional_lead" },
    ops:         { id: "c0000000-0000-4000-8000-00000000d003", email: "cert.ops@northwind.invalid",        role: "ops" },
    viewer:      { id: "c0000000-0000-4000-8000-00000000d004", email: "cert.finviewer@northwind.invalid",  role: CUSTOM.viewer },
    noaccess:    { id: "c0000000-0000-4000-8000-00000000d005", email: "cert.frontdesk@northwind.invalid",  role: CUSTOM.none },
    portalFin:   { id: "c0000000-0000-4000-8000-00000000d007", email: "cert.portalfin@northwind.invalid",  role: CUSTOM.portalFinance },
    portalOnly:  { id: "c0000000-0000-4000-8000-00000000d008", email: "cert.portalonly@northwind.invalid", role: CUSTOM.portalOnly },
    otherOrg:    { id: "c0000000-0000-4000-8000-00000000d006", email: "cert.otherorg@adapter.invalid",     role: "admin", org: OTHER_ORG },

    formsAuthor:    { id: "c0000000-0000-4000-8000-00000000d009", email: "cert.formsauthor@northwind.invalid",    role: CUSTOM.formsAuthor },
    formsReader:    { id: "c0000000-0000-4000-8000-00000000d010", email: "cert.formsreader@northwind.invalid",    role: CUSTOM.formsReader },
    formsConfirmer: { id: "c0000000-0000-4000-8000-00000000d011", email: "cert.formsconfirm@northwind.invalid",   role: CUSTOM.formsConfirmer },
    formsOperator:  { id: "c0000000-0000-4000-8000-00000000d012", email: "cert.formsoperator@northwind.invalid",  role: CUSTOM.formsOperator },
    formsBystander: { id: "c0000000-0000-4000-8000-00000000d013", email: "cert.formsbystander@northwind.invalid", role: CUSTOM.formsBystander },
    formsTitular:   { id: "c0000000-0000-4000-8000-00000000d014", email: "cert.formstitular@northwind.invalid",   role: CUSTOM.formsTitular },
    formsCrm:       { id: "c0000000-0000-4000-8000-00000000d015", email: "cert.formscrm@northwind.invalid",       role: CUSTOM.formsCrm },

    procOperate:    { id: "c0000000-0000-4000-8000-00000000d016", email: "cert.procoperate@northwind.invalid",   role: CUSTOM.procOperate },
    procArchive:    { id: "c0000000-0000-4000-8000-00000000d017", email: "cert.procarchive@northwind.invalid",   role: CUSTOM.procArchive },
    procDocs:       { id: "c0000000-0000-4000-8000-00000000d018", email: "cert.procdocs@northwind.invalid",      role: CUSTOM.procDocs },
    procDevCleanup: { id: "c0000000-0000-4000-8000-00000000d019", email: "cert.procdevclean@northwind.invalid",  role: CUSTOM.procDevCleanup },
    procTitular:    { id: "c0000000-0000-4000-8000-00000000d020", email: "cert.proctitular@northwind.invalid",   role: CUSTOM.procTitular },
    procPortalOnly: { id: "c0000000-0000-4000-8000-00000000d021", email: "cert.procportal@northwind.invalid",    role: CUSTOM.procPortalOnly },
    procDocsWriter: { id: "c0000000-0000-4000-8000-00000000d022", email: "cert.procdocswriter@northwind.invalid",role: CUSTOM.procDocsWriter },
    procFormsAuthor:{ id: "c0000000-0000-4000-8000-00000000d023", email: "cert.procformsauthor@northwind.invalid",role: CUSTOM.procFormsAuthor },

    sjScheduler:    { id: "c0000000-0000-4000-8000-00000000d024", email: "cert.sjscheduler@northwind.invalid",   role: CUSTOM.sjScheduler },
    sjJobber:       { id: "c0000000-0000-4000-8000-00000000d025", email: "cert.sjjobber@northwind.invalid",      role: CUSTOM.sjJobber },
    sjPoster:       { id: "c0000000-0000-4000-8000-00000000d026", email: "cert.sjposter@northwind.invalid",      role: CUSTOM.sjPoster },
    finAdjuster:    { id: "c0000000-0000-4000-8000-00000000d045", email: "cert.finadjust@northwind.invalid",     role: CUSTOM.finAdjuster },
    ceilingActor:   { id: "c0000000-0000-4000-8000-00000000d046", email: "cert.ceiling@northwind.invalid",      role: CUSTOM.ceilingActor },
    axUserAdmin:    { id: "c0000000-0000-4000-8000-00000000d047", email: "cert.axuser@northwind.invalid",      role: CUSTOM.axUserAdmin },
    axRoleAdmin:    { id: "c0000000-0000-4000-8000-00000000d048", email: "cert.axrole@northwind.invalid",      role: CUSTOM.axRoleAdmin },
    axScopeAdmin:   { id: "c0000000-0000-4000-8000-00000000d049", email: "cert.axscope@northwind.invalid",     role: CUSTOM.axScopeAdmin },
    axDeviceAdmin:  { id: "c0000000-0000-4000-8000-00000000d050", email: "cert.axdevice@northwind.invalid",    role: CUSTOM.axDeviceAdmin },
    axAuditor:      { id: "c0000000-0000-4000-8000-00000000d051", email: "cert.axaudit@northwind.invalid",     role: CUSTOM.axAuditor },
    sjTitular:      { id: "c0000000-0000-4000-8000-00000000d027", email: "cert.sjtitular@northwind.invalid",     role: CUSTOM.sjTitular },
    sjFinWrite:     { id: "c0000000-0000-4000-8000-00000000d028", email: "cert.sjfinwrite@northwind.invalid",    role: CUSTOM.sjFinWrite },

    cfgOptionManager:   { id: "c0000000-0000-4000-8000-00000000d029", email: "cert.cfgoptmgr@northwind.invalid",   role: CUSTOM.cfgOptionManager },
    cfgOptionDeleter:   { id: "c0000000-0000-4000-8000-00000000d030", email: "cert.cfgoptdel@northwind.invalid",   role: CUSTOM.cfgOptionDeleter },
    cfgLayoutManager:   { id: "c0000000-0000-4000-8000-00000000d031", email: "cert.cfglaymgr@northwind.invalid",   role: CUSTOM.cfgLayoutManager },
    cfgLayoutLifecycle: { id: "c0000000-0000-4000-8000-00000000d032", email: "cert.cfglaylife@northwind.invalid",  role: CUSTOM.cfgLayoutLifecycle },
    cfgFieldManager:    { id: "c0000000-0000-4000-8000-00000000d033", email: "cert.cfgfldmgr@northwind.invalid",   role: CUSTOM.cfgFieldManager },
    cfgFieldDeleter:    { id: "c0000000-0000-4000-8000-00000000d034", email: "cert.cfgflddel@northwind.invalid",   role: CUSTOM.cfgFieldDeleter },
    cfgTitular:         { id: "c0000000-0000-4000-8000-00000000d035", email: "cert.cfgtitular@northwind.invalid",  role: CUSTOM.cfgTitular },
    cfgSectionManager:  { id: "c0000000-0000-4000-8000-00000000d044", email: "cert.cfgsecmgr@northwind.invalid",    role: CUSTOM.cfgSectionManager },
    bpConfigurer:       { id: "c0000000-0000-4000-8000-00000000d036", email: "cert.bpconfig@northwind.invalid",    role: CUSTOM.bpConfigurer },
    bpActivator:        { id: "c0000000-0000-4000-8000-00000000d037", email: "cert.bpactivate@northwind.invalid",  role: CUSTOM.bpActivator },
    bpComposed:         { id: "c0000000-0000-4000-8000-00000000d038", email: "cert.bpowner@northwind.invalid",     role: CUSTOM.bpComposed },
    bpTitular:          { id: "c0000000-0000-4000-8000-00000000d039", email: "cert.bptitular@northwind.invalid",   role: CUSTOM.bpTitular },
    bpScoped:           { id: "c0000000-0000-4000-8000-00000000d040", email: "cert.bpscoped@northwind.invalid",    role: CUSTOM.bpScoped },
    oiWriter:           { id: "c0000000-0000-4000-8000-00000000d041", email: "cert.oiwriter@northwind.invalid",    role: CUSTOM.oiWriter },
    oiReader:           { id: "c0000000-0000-4000-8000-00000000d042", email: "cert.oireader@northwind.invalid",    role: CUSTOM.oiReader },
    oiTitular:          { id: "c0000000-0000-4000-8000-00000000d043", email: "cert.oititular@northwind.invalid",   role: CUSTOM.oiTitular },
    defaultAdmin:       { id: "c0000000-0000-4000-8000-00000000d0c5", email: "cert.defaultadmin@northwind.invalid", role: "admin" },
    workConfigurer:     { id: "c0000000-0000-4000-8000-00000000d0c1", email: "cert.workconfig@northwind.invalid",   role: CUSTOM.workConfigurer },
    workOperator:       { id: "c0000000-0000-4000-8000-00000000d0c2", email: "cert.workoperate@northwind.invalid",  role: CUSTOM.workOperator },
    workTitular:        { id: "c0000000-0000-4000-8000-00000000d0c3", email: "cert.worktitular@northwind.invalid",  role: CUSTOM.workTitular },
    aiUser:             { id: "c0000000-0000-4000-8000-00000000d0c4", email: "cert.aiuser@northwind.invalid",       role: CUSTOM.aiUser },
    tourConfigurer:     { id: "c0000000-0000-4000-8000-00000000d0b1", email: "cert.tourconfig@northwind.invalid",  role: CUSTOM.tourConfigurer },
    tourBooker:         { id: "c0000000-0000-4000-8000-00000000d0b2", email: "cert.tourbooker@northwind.invalid",  role: CUSTOM.tourBooker },
    tourTitular:        { id: "c0000000-0000-4000-8000-00000000d0b3", email: "cert.tourtitular@northwind.invalid", role: CUSTOM.tourTitular },
    tourScheduler:      { id: "c0000000-0000-4000-8000-00000000d0b4", email: "cert.toursched@northwind.invalid",   role: CUSTOM.tourScheduler },
    wfWriter:           { id: "c0000000-0000-4000-8000-00000000d0a1", email: "cert.wfwriter@northwind.invalid",    role: CUSTOM.wfWriter },
    wfTitular:          { id: "c0000000-0000-4000-8000-00000000d0a2", email: "cert.wftitular@northwind.invalid",   role: CUSTOM.wfTitular },
    wfAdjacent:         { id: "c0000000-0000-4000-8000-00000000d0a3", email: "cert.wfadjacent@northwind.invalid",  role: CUSTOM.wfAdjacent },

    commsReader:     { id: "c0000000-0000-4000-8000-00000000d052", email: "cert.commsreader@northwind.invalid",    role: CUSTOM.commsReader },
    commsSender:     { id: "c0000000-0000-4000-8000-00000000d053", email: "cert.commssender@northwind.invalid",    role: CUSTOM.commsSender },
    commsTemplates:  { id: "c0000000-0000-4000-8000-00000000d054", email: "cert.commstemplates@northwind.invalid", role: CUSTOM.commsTemplates },
    commsProvider:   { id: "c0000000-0000-4000-8000-00000000d055", email: "cert.commsprovider@northwind.invalid",  role: CUSTOM.commsProvider },
    commsBulk:       { id: "c0000000-0000-4000-8000-00000000d056", email: "cert.commsbulk@northwind.invalid",      role: CUSTOM.commsBulk },
    commsOperator:   { id: "c0000000-0000-4000-8000-00000000d057", email: "cert.commsoperator@northwind.invalid",  role: CUSTOM.commsOperator },
    commsFull:       { id: "c0000000-0000-4000-8000-00000000d058", email: "cert.commsfull@northwind.invalid",      role: CUSTOM.commsFull },
    commsTitular:    { id: "c0000000-0000-4000-8000-00000000d059", email: "cert.commstitular@northwind.invalid",   role: CUSTOM.commsTitular },
    commsPortalOnly: { id: "c0000000-0000-4000-8000-00000000d060", email: "cert.commsportal@northwind.invalid",    role: CUSTOM.commsPortalOnly },
    /*
     * THE UNION PERSONA. Two roles, neither sufficient: `commsReader` carries admission and read,
     * `commsUnionBulk` carries bulk and no admission. Effective authority is the union, so this
     * person must reach both a read and a campaign route — and still be refused templates and
     * provider, which neither role holds. `also` is the second role; see the user_roles insert.
     */
    commsUnion:      { id: "c0000000-0000-4000-8000-00000000d061", email: "cert.commsunion@northwind.invalid",     role: CUSTOM.commsReader, also: [CUSTOM.commsUnionBulk] },
    commsAssigner:   { id: "c0000000-0000-4000-8000-00000000d062", email: "cert.commsassign@northwind.invalid",    role: CUSTOM.commsAssigner },
    crmReader:       { id: "c0000000-0000-4000-8000-00000000d063", email: "cert.crmreader@northwind.invalid",      role: CUSTOM.crmReader },
    crmWriter:       { id: "c0000000-0000-4000-8000-00000000d064", email: "cert.crmwriter@northwind.invalid",      role: CUSTOM.crmWriter },
    crmWriteOnly:    { id: "c0000000-0000-4000-8000-00000000d065", email: "cert.crmwriteonly@northwind.invalid",   role: CUSTOM.crmWriteOnly },
    crmTitular:      { id: "c0000000-0000-4000-8000-00000000d066", email: "cert.crmtitular@northwind.invalid",     role: CUSTOM.crmTitular },
    vocabManager:    { id: "c0000000-0000-4000-8000-00000000d067", email: "cert.vocabmgr@northwind.invalid",       role: CUSTOM.vocabManager },
    vocabTitular:    { id: "c0000000-0000-4000-8000-00000000d068", email: "cert.vocabtitular@northwind.invalid",   role: CUSTOM.vocabTitular },
    programManager:  { id: "c0000000-0000-4000-8000-00000000d069", email: "cert.programmgr@northwind.invalid",     role: CUSTOM.programManager },
    enrollRecord:    { id: "c0000000-0000-4000-8000-00000000d070", email: "cert.enrollrecord@northwind.invalid",   role: CUSTOM.enrollRecord },
    enrollDecide:    { id: "c0000000-0000-4000-8000-00000000d071", email: "cert.enrolldecide@northwind.invalid",   role: CUSTOM.enrollDecide },
    enrollBoth:      { id: "c0000000-0000-4000-8000-00000000d072", email: "cert.enrollboth@northwind.invalid",     role: CUSTOM.enrollBoth },
    enrollTitular:   { id: "c0000000-0000-4000-8000-00000000d073", email: "cert.enrolltitular@northwind.invalid",  role: CUSTOM.enrollTitular },
};

async function principal(p) {
    await sb.auth.admin.deleteUser(p.id).catch(() => undefined);
    const { error } = await sb.auth.admin.createUser({ id: p.id, email: p.email, password: PASSWORD, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw new Error(`${p.email}: ${error.message}`);
}

export async function setup() {
    const runCorrelationId = crypto.randomUUID();
    const ids = Object.values(P).map((p) => p.id);
    await sb.from("user_site_access").delete().in("user_id", ids);
    await sb.from("user_access_profiles").delete().in("user_id", ids);
    await sb.from("user_roles").delete().in("user_id", ids);
    for (const rk of Object.values(CUSTOM)) {
        await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", rk);
        await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", rk);
    }

    const { error: rdErr } = await sb.from("role_definitions").insert([
        { org_id: ORG, role_key: CUSTOM.viewer, role_label: "Financials viewer", description: "Reads the money, moves none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.none,   role_label: "Front desk",        description: "No financial access at all.",        is_system: false, is_active: true },
        /*
         * The two W-13 personas. Together they are the claim that portal admission and Financials
         * authorization are INDEPENDENT capabilities: one role holds both, one holds only the first,
         * and `mcert_fin_viewer` above holds only the second. Under the role literal the first two
         * could not exist at all — a custom role could hold every capability Alloy defines and still
         * be refused at the front door.
         */
        { org_id: ORG, role_key: CUSTOM.portalFinance, role_label: "Portal + financials reader", description: "Enters the portal and reads the money. Moves none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.portalOnly,    role_label: "Portal only",                description: "Enters the portal and sees no Financials.",                is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.formsAuthor,    role_label: "Forms designer",     description: "Designs forms. Never sees what people send back.",        is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.formsReader,    role_label: "Submission reader",  description: "Reads submissions. Cannot change a form.",                is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.formsConfirmer, role_label: "Linkage checker",    description: "Confirms a submission belongs to the record it claims.",   is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.formsOperator,  role_label: "Forms operator",     description: "All three Forms capabilities, and no admin role.",         is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.formsBystander, role_label: "Portal bystander",   description: "In the portal, holding no Forms capability.",              is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.formsTitular,   role_label: "Forms Administrator", description: "Named for Forms, granted none of it.",                    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.formsCrm,       role_label: "Customer lookup",     description: "Searches customers. Holds no Forms capability.",          is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.procOperate,    role_label: "Case processor",       description: "Works the processing queue. Cannot archive or delete.",   is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procArchive,    role_label: "Queue archiver",       description: "Archives cases. Cannot work one.",                        is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procDocs,       role_label: "Source doc manager",   description: "Renames and deletes source documents. Nothing else.",     is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procDevCleanup, role_label: "Test data resetter",   description: "Holds the reset capability. Production still refuses.",   is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.procTitular,    role_label: "Admin",                description: "Named Admin, granted no Processing capability.",          is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procPortalOnly, role_label: "Processing bystander", description: "In the portal, holding no Processing capability.",        is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procDocsWriter, role_label: "General doc writer",   description: "Holds documents.write, as ops does. Not a Processing authority.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.procFormsAuthor,role_label: "Packet author",        description: "Holds forms.author. Authors packets, works no case.",     is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.sjScheduler, role_label: "Schedule coordinator", description: "Manages schedules. Posts no money.",                is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.sjJobber,    role_label: "Job coordinator",      description: "Manages jobs. Raises no charges.",                  is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.sjPoster,    role_label: "Financial poster",     description: "Posts receipts, payouts, journals and charges.",    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.finAdjuster, role_label: "Financial adjuster", description: "Holds fin.adjust and nothing else in Financials.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.ceilingActor, role_label: "Ceiling actor", description: "Limited access administrator for the W-18 proof.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.ceilingSupply, role_label: "Ceiling supply", description: "Supplies fin.write for the multi-role union proof.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.axUserAdmin, role_label: "User administrator", description: "Manages users and role assignment only.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.axRoleAdmin, role_label: "Role administrator", description: "Defines roles and their packages only.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.axScopeAdmin, role_label: "Scope administrator", description: "Changes where a user may operate only.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.axDeviceAdmin, role_label: "Device administrator", description: "Manages attendance kiosks only.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.axAuditor, role_label: "Access auditor", description: "Reads users and roles; mutates nothing.", is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.sjTitular,   role_label: "Admin",                description: "Named Admin, granted no schedule, job or posting authority.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.sjFinWrite,  role_label: "Financials manager",   description: "Holds fin.write, as ops does. Not a posting authority.",      is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.cfgOptionManager,   role_label: "Option set editor",   description: "Edits option sets. Deletes none.",                    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgOptionDeleter,   role_label: "Option set remover",  description: "Deletes option sets. Edits none.",                    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgLayoutManager,   role_label: "Layout editor",       description: "Edits a draft layout. Publishes nothing.",            is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgLayoutLifecycle, role_label: "Layout publisher",    description: "Creates, duplicates, publishes, rolls back layouts.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgFieldManager,    role_label: "Field editor",        description: "Configures fields. Deletes none.",                    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgFieldDeleter,    role_label: "Field remover",       description: "Deletes field definitions. Configures none.",         is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.cfgTitular,         role_label: "Admin",               description: "Named Admin, granted no configuration authority.",    is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.cfgSectionManager, role_label: "Section manager",   description: "Manages field sections and nothing else in Configuration.", is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.bpConfigurer, role_label: "Process designer",   description: "Designs business processes. Activates none of them.",      is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.bpActivator,  role_label: "Process activator",  description: "Switches a process on and off. Designs none of them.",      is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.bpComposed,   role_label: "Process owner",      description: "Designs and activates. The old admin behaviour, composed.", is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.bpTitular,    role_label: "Admin",              description: "Named Admin, granted no Business Process capability.",      is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.bpScoped,     role_label: "Domain process owner", description: "Designs and activates, inside one operational domain only.", is_system: false, is_active: true },

        { org_id: ORG, role_key: CUSTOM.workConfigurer, role_label: "Work definition owner", description: "Defines what operational work exists. Performs none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.workOperator,   role_label: "Work operator",        description: "Performs work inside running processes. Defines none of it.",  is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.workTitular,    role_label: "Work Administrator",   description: "Named Work Administrator, granted no Work authority.",         is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.aiUser,         role_label: "AI enrichment user",   description: "Holds AI authority. Holds no Work authority.",                  is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.tourConfigurer, role_label: "Tour availability owner", description: "Sets when and where tours may be booked. Cannot touch a family booking.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.tourBooker,     role_label: "Tour front desk",        description: "Operates one family tour lifecycle. Cannot change availability.",      is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.tourTitular,    role_label: "Tour Administrator",     description: "Named Tour Administrator, granted no Tours authority.",               is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.tourScheduler,  role_label: "Scheduler",              description: "Holds scheduling.write only. The near-miss for tour availability.",   is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.wfWriter,  role_label: "Workflow author",       description: "Configures Workflow definitions, actions and conditions. No privileged title.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.wfTitular, role_label: "Workflow Administrator", description: "Named Workflow Administrator, granted no Workflow authority.",                 is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.wfAdjacent, role_label: "Process configurer",    description: "Adjacent configuration authority, deliberately without the Workflow key.",      is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.oiWriter,  role_label: "Intelligence author", description: "Authors Operational Intelligence - calculations, KPI targets, measurements.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.oiReader,  role_label: "Intelligence reader", description: "Reads Operational Intelligence. Changes none of it.",                    is_system: false, is_active: true },
        /* The label is the trap. It holds nothing. */
        { org_id: ORG, role_key: CUSTOM.oiTitular, role_label: "Admin",                description: "Named Admin, granted no Operational Intelligence authority.",           is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsReader,    role_label: "Communications reader",        description: "Reads the organization's communications. Sends nothing.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsSender,    role_label: "Communications sender",        description: "Sends an individual message. Deliberately cannot read the org's conversations.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsTemplates, role_label: "Template author",              description: "Authors templates. Delivers nothing.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsProvider,  role_label: "Delivery administrator",       description: "Configures delivery infrastructure. Messages nobody.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsBulk,      role_label: "Campaign sender",              description: "Addresses the whole organization. Authors no template.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsOperator,  role_label: "Communications operator",      description: "The seeded ops package for this area, as a CUSTOM role.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsFull,      role_label: "Communications administrator", description: "All five, as a custom role rather than by job title.", is_system: false, is_active: true },
        /* The title control. Named like an administrator, granted nothing. */
        { org_id: ORG, role_key: CUSTOM.commsTitular,   role_label: "Communications Administrator", description: "Titled for authority, holding none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsPortalOnly,role_label: "Portal only",                  description: "The census persona: admission and nothing else.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsUnionBulk, role_label: "Campaign sender (union half)", description: "Second role in the multi-role union proof.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.commsAssigner,  role_label: "Conversation assigner",       description: "Routes the inbox. Answers nothing.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.crmReader,      role_label: "Family record reader",        description: "Reads families and people. Changes none of them.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.crmWriter,      role_label: "Family record operator",      description: "Reads and maintains family records.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.crmWriteOnly,   role_label: "Family record writer (write only)", description: "Holds write and not read — the separation, from the other side.", is_system: false, is_active: true },
        /* The title control. Named for authority over customers, granted none of it. */
        { org_id: ORG, role_key: CUSTOM.crmTitular,     role_label: "Customer Administrator",      description: "Titled for authority, holding none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.vocabManager,   role_label: "Vocabulary manager",          description: "Defines the organization's words. Changes none of its records.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.vocabTitular,   role_label: "Configuration Administrator", description: "Titled for configuration authority, holding none of it.", is_system: false, is_active: true },
        { org_id: ORG, role_key: CUSTOM.programManager, role_label: "Program manager",             description: "Publishes Programs. Touches no records and no money.", is_system: false, is_active: true },
    ]);
    if (rdErr) throw new Error(`role_definitions: ${rdErr.message}`);

    /*
     * THE PROVISIONING ACTOR MUST HOLD WHAT IT HANDS OUT.
     *
     * W-18 bounds every grant to the actor's own effective authority, and this fixture provisions
     * through the same RPC an operator uses. It acts as the seeded organization administrator, so
     * that role has to actually carry the capabilities the personas below receive — and in this
     * tenant it had drifted: admin was missing `reports.write` (nine of ten orgs still had it),
     * left over from earlier fixture history, so provisioning the OI persona was refused.
     *
     * Restating the admin package from the ACTIVE catalog is the truthful repair rather than
     * patching whichever key is noticed next: a full administrator holds the catalog, and a fixture
     * that quietly provisions more than its actor holds is relying on the hole this program closed.
     * Deliberately not routed through the grants RPC — that call would be bounded by the very
     * authority it is repairing.
     */
    const { data: activeKeys, error: catalogErr } = await sb
        .from("permission_definitions")
        .select("key")
        .eq("is_active", true);
    if (catalogErr) throw new Error(`catalog read for admin package: ${catalogErr.message}`);
    const { error: adminPkgErr } = await sb.from("role_permission_grants").upsert(
        (activeKeys ?? []).map((row) => ({
            org_id: ORG,
            role_key: "admin",
            permission_key: row.key,
            allowed: true,
        })),
        { onConflict: "org_id,role_key,permission_key" },
    );
    if (adminPkgErr) throw new Error(`admin package restore: ${adminPkgErr.message}`);

    for (const [rk, keys] of [
        [CUSTOM.viewer, ["fin.read"]],
        [CUSTOM.none, ["crm.customers.read"]],
        [CUSTOM.portalFinance, ["portal.access", "fin.read"]],
        [CUSTOM.portalOnly, ["portal.access"]],

        [CUSTOM.formsAuthor, ["portal.access", "forms.author"]],
        [CUSTOM.formsReader, ["portal.access", "forms.submissions"]],
        [CUSTOM.formsConfirmer, ["portal.access", "forms.submissions.confirm"]],
        [CUSTOM.formsOperator, ["portal.access", "forms.author", "forms.submissions", "forms.submissions.confirm"]],
        [CUSTOM.formsBystander, ["portal.access"]],
        [CUSTOM.formsTitular, ["portal.access"]],
        [CUSTOM.formsCrm, ["portal.access", "crm.customers.read"]],

        [CUSTOM.procOperate, ["portal.access", "processing.operate"]],
        [CUSTOM.procArchive, ["portal.access", "processing.archive"]],
        [CUSTOM.procDocs, ["portal.access", "processing.documents.manage"]],
        [CUSTOM.procDevCleanup, ["portal.access", "processing.dev_cleanup"]],
        [CUSTOM.procTitular, ["portal.access"]],
        [CUSTOM.procPortalOnly, ["portal.access"]],
        [CUSTOM.procDocsWriter, ["portal.access", "documents.write", "documents.read"]],
        [CUSTOM.procFormsAuthor, ["portal.access", "forms.author"]],

        [CUSTOM.sjScheduler, ["portal.access", "scheduling.write"]],
        [CUSTOM.sjJobber, ["portal.access", "ops.jobs.write"]],
        [CUSTOM.sjPoster, ["portal.access", "fin.post"]],
        /* fin.adjust alone — the reduction family, deliberately without fin.write. */
        [CUSTOM.finAdjuster, ["portal.access", "fin.adjust"]],
        /*
         * W-18. A LIMITED access administrator: it may edit roles and holds nothing else worth
         * delegating. fin.post is deliberately absent — that is the capability the ceiling must
         * refuse it, and the one the pre-fix exploit granted itself. It holds admin.roles.write
         * rather than the retired umbrella: after the Access Administration Split that is the key
         * that authorizes editing a role's package, and therefore the key W-18 bounds.
         */
        [CUSTOM.ceilingActor, ["portal.access", "admin.roles.read", "admin.roles.write"]],
        /* The second role in the multi-role union proof. Supplies fin.write and nothing else. */
        [CUSTOM.ceilingSupply, ["fin.write"]],
        /*
         * The four Access-administration authorities, each held ALONE. The point of the matrix is
         * what each one CANNOT do: a user administrator who can also rewrite role packages, or a
         * device administrator who can create users, would mean the split exists only on paper.
         */
        [CUSTOM.axUserAdmin, ["portal.access", "admin.users.read", "admin.users.write"]],
        [CUSTOM.axRoleAdmin, ["portal.access", "admin.roles.read", "admin.roles.write"]],
        [CUSTOM.axScopeAdmin, ["portal.access", "admin.users.read", "admin.access_scope.write"]],
        [CUSTOM.axDeviceAdmin, ["portal.access", "attendance.devices.manage"]],
        [CUSTOM.axAuditor, ["portal.access", "admin.users.read", "admin.roles.read"]],
        [CUSTOM.sjTitular, ["portal.access"]],
        [CUSTOM.sjFinWrite, ["portal.access", "fin.write", "fin.read"]],

        [CUSTOM.cfgOptionManager, ["portal.access", "option_sets.manage"]],
        [CUSTOM.cfgOptionDeleter, ["portal.access", "option_sets.delete"]],
        [CUSTOM.cfgLayoutManager, ["portal.access", "layouts.manage"]],
        [CUSTOM.cfgLayoutLifecycle, ["portal.access", "layouts.lifecycle"]],
        [CUSTOM.cfgFieldManager, ["portal.access", "fields.manage"]],
        [CUSTOM.cfgFieldDeleter, ["portal.access", "fields.delete"]],
        [CUSTOM.cfgTitular, ["portal.access"]],
        /* sections.manage has always been catalogued and granted; this is the first persona to hold it alone. */
        [CUSTOM.cfgSectionManager, ["portal.access", "sections.manage"]],
        [CUSTOM.bpConfigurer, ["portal.access", "business_process.configure"]],
        [CUSTOM.bpActivator, ["portal.access", "business_process.activate"]],
        [CUSTOM.bpComposed, ["portal.access", "business_process.configure", "business_process.activate"]],
        [CUSTOM.bpTitular, ["portal.access"]],
        [CUSTOM.bpScoped, ["portal.access", "business_process.configure", "business_process.activate"]],
        [CUSTOM.workConfigurer, ["portal.access", "work.configure"]],
        [CUSTOM.workOperator, ["portal.access", "work.operate"]],
        [CUSTOM.workTitular, ["portal.access"]],
        [CUSTOM.aiUser, ["portal.access", "ai.enrichment.use"]],
        [CUSTOM.tourConfigurer, ["portal.access", "tours.configure"]],
        [CUSTOM.tourBooker, ["portal.access", "tours.book"]],
        /* The label says Tour Administrator; the package says nothing. */
        [CUSTOM.tourTitular, ["portal.access"]],
        /* The nearest key that is NOT Tours authority. */
        [CUSTOM.tourScheduler, ["portal.access", "scheduling.write"]],
        [CUSTOM.wfWriter, ["portal.access", "ops.workflows.write"]],
        /* The label says Workflow Administrator; the package says nothing. */
        [CUSTOM.wfTitular, ["portal.access"]],
        /* Adjacent configuration authority, deliberately without the Workflow key. */
        [CUSTOM.wfAdjacent, ["portal.access", "business_process.configure", "fields.manage"]],
        [CUSTOM.oiWriter, ["portal.access", "reports.read", "reports.write"]],
        [CUSTOM.oiReader, ["portal.access", "reports.read"]],
        [CUSTOM.oiTitular, ["portal.access"]],

        /*
         * Each of the five held ALONE, because the matrix is about what each one CANNOT do. A
         * template author who can also reconfigure delivery, or a campaign sender who can rewrite
         * every template, would mean the split exists only on paper.
         */
        [CUSTOM.commsReader, ["portal.access", "communications.read"]],
        /* No `communications.read`. Send must not imply read — that is the half nobody checks. */
        [CUSTOM.commsSender, ["portal.access", "communications.send"]],
        [CUSTOM.commsTemplates, ["portal.access", "communications.templates.manage"]],
        [CUSTOM.commsProvider, ["portal.access", "communications.provider.configure"]],
        [CUSTOM.commsBulk, ["portal.access", "communications.bulk.send"]],
        /* Exactly the seeded ops package for this area, carried by a custom role. */
        [CUSTOM.commsOperator, ["portal.access", "communications.read", "communications.send"]],
        [CUSTOM.commsFull, ["portal.access", "communications.read", "communications.send",
                            "communications.templates.manage", "communications.provider.configure",
                            "communications.bulk.send"]],
        /* Titled "Communications Administrator". Holds admission and nothing else. */
        [CUSTOM.commsTitular, ["portal.access"]],
        [CUSTOM.commsPortalOnly, ["portal.access"]],
        /* Supplies bulk to the union persona and carries no admission of its own. */
        [CUSTOM.commsUnionBulk, ["communications.bulk.send"]],
        /* Assignment ALONE. No send, no read, no management — the separation, held by a person. */
        [CUSTOM.commsAssigner, ["portal.access", "communications.assign"]],

        /*
         * Read without write, write without read, and both. The middle one exists because the
         * catalog has always had two keys here and nothing ever checked either: if a mutation
         * quietly accepted the read key, only a reader could prove it.
         */
        [CUSTOM.crmReader, ["portal.access", "crm.customers.read"]],
        [CUSTOM.crmWriter, ["portal.access", "crm.customers.read", "crm.customers.write"]],
        [CUSTOM.crmWriteOnly, ["portal.access", "crm.customers.write"]],
        /* Labelled "Customer Administrator". Holds admission and nothing else. */
        [CUSTOM.crmTitular, ["portal.access"]],

        /* Vocabulary ALONE: no fields, no option sets, no CRM records, no assignment execution. */
        [CUSTOM.vocabManager, ["portal.access", "configuration.vocabulary.manage"]],
        /* Labelled "Configuration Administrator". Holds admission and nothing else. */
        [CUSTOM.vocabTitular, ["portal.access"]],
        /* settings.manage ALONE — no fields, no option sets, no vocabulary, no CRM, no money. */
        [CUSTOM.programManager, ["portal.access", "settings.manage"]],

        /*
         * ENROLLMENT. Each role holds admission plus exactly the key under certification, so a
         * refusal cannot be blamed on a missing neighbour. The titular role is the control: its
         * label says Enrollment Administrator and it holds admission alone.
         */
        [CUSTOM.enrollRecord, ["portal.access", "enrollment.record.manage"]],
        [CUSTOM.enrollDecide, ["portal.access", "enrollment.decide"]],
        [CUSTOM.enrollBoth, ["portal.access", "enrollment.record.manage", "enrollment.decide"]],
        /* Labelled "Enrollment Administrator". Holds admission and nothing else. */
        [CUSTOM.enrollTitular, ["portal.access"]],
    ]) {
        const { error } = await sb.rpc("replace_role_permission_grants", {
            p_org_id: ORG,
            p_role_key: rk,
            p_permission_keys: keys,
            p_actor_user_id: FIXTURE_ACTOR,
            p_origin: FIXTURE_ORIGIN,
            // One provisioning run is one correlated action, the same way one operator save is.
            p_correlation_id: runCorrelationId,
        });
        if (error) throw new Error(`${rk}: ${error.message}`);
    }

    /*
     * THE SEEDED ops ROLE MUST REFLECT THE CORRECTED DEFAULT PACKAGE.
     *
     * `20260915120000` removes `reports.write` from the ops default, but it preserves any grant an
     * organization touched deliberately — and this tenant carries three mutation events naming that
     * key, every one generated by certification fixtures calling
     * `replace_role_permission_grants`. The migration therefore classified it B_DELIBERATE and
     * correctly left it alone. That is the predicate working, not failing.
     *
     * It does mean the cert tenant's ops role is not representative of a default org, which is
     * exactly what the ops compatibility phase needs to measure. So the fixture states the default
     * it intends to certify rather than inheriting fixture history: ops keeps `reports.read` and
     * does not hold `reports.write`.
     *
     * NOTE FOR WHOEVER RUNS THIS NEXT: this deletes the row directly, which does NOT invalidate the
     * server's access-bundle cache the way a change through /organization/access would. A cert run
     * immediately after a fresh setup can therefore still see the old permission set and report ops
     * as able to author. Restart the cert server after setup, or make the change through the
     * canonical route. The symptom looks exactly like a failed authority migration and is not one.
     */
    const { error: opsErr } = await sb.from("role_permission_grants")
        .delete()
        .eq("org_id", ORG)
        .eq("role_key", "ops")
        .eq("permission_key", "reports.write");
    if (opsErr) throw new Error(`ops reports.write normalization: ${opsErr.message}`);

    for (const p of Object.values(P)) await principal(p);

    /*
     * TWO OPERATIONAL DOMAINS, so "restricted" can mean something.
     *
     * The certification tenant ships one department. A scope proof needs a domain the principal MAY
     * reach and one it may not, so the fixture provisions both and grants access to exactly one.
     * They are plain grouping rows — no lifecycle marker — because the point is the scope dimension,
     * not the process they would carry.
     */
    const { error: deptErr } = await sb.from("departments").upsert(
        [
            { id: BP_DEPT_ALLOWED, org_id: ORG, key: "mcert_bp_allowed", name: "Cert domain — allowed", sort_order: 900, is_active: true, metadata: { scaffold_note: "access cert fixture" } },
            { id: BP_DEPT_DENIED, org_id: ORG, key: "mcert_bp_denied", name: "Cert domain — denied", sort_order: 901, is_active: true, metadata: { scaffold_note: "access cert fixture" } },
        ],
        { onConflict: "id" },
    );
    if (deptErr) throw new Error(`departments: ${deptErr.message}`);

    const { error: apErr } = await sb.from("user_access_profiles").insert({
        user_id: P.bpScoped.id, org_id: ORG, department_scope: "restricted", site_scope: "all", attendance_capture_scope: "site",
    });
    if (apErr) throw new Error(`user_access_profiles: ${apErr.message}`);

    const { error: udaErr } = await sb.from("user_department_access").insert({
        user_id: P.bpScoped.id, org_id: ORG, department_id: BP_DEPT_ALLOWED,
    });
    if (udaErr) throw new Error(`user_department_access: ${udaErr.message}`);
    /*
     * One row per role a persona holds, not one per persona. Multi-role is not an edge case here:
     * effective authority is the UNION of a person's roles, and a matrix that only ever gives
     * someone one role cannot tell a union from a single grant.
     */
    const { error: urErr } = await sb.from("user_roles").insert(
        Object.values(P).flatMap((p) =>
            [p.role, ...(p.also ?? [])].map((role) => ({ user_id: p.id, org_id: p.org ?? ORG, role })),
        ),
    );
    if (urErr) throw new Error(`user_roles: ${urErr.message}`);
    return sb;
}

export async function teardown() {
    const ids = Object.values(P).map((p) => p.id);
    await sb.from("user_department_access").delete().in("user_id", ids);
    await sb.from("user_site_access").delete().in("user_id", ids);
    await sb.from("user_access_profiles").delete().in("user_id", ids);
    await sb.from("user_roles").delete().in("user_id", ids);
    for (const rk of Object.values(CUSTOM)) {
        await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", rk);
        await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", rk);
    }
    await sb.from("departments").delete().in("id", [BP_DEPT_ALLOWED, BP_DEPT_DENIED]);
    for (const id of ids) await sb.auth.admin.deleteUser(id).catch(() => undefined);
}

export { sb };

if (process.argv[2] === "setup") { await setup(); console.log("personas ready"); }
if (process.argv[2] === "teardown") { await teardown(); console.log("personas removed"); }
