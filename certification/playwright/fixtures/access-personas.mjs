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
export const FIXTURE_ACTOR = "fixture:access-personas";
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
};

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
    ]);
    if (rdErr) throw new Error(`role_definitions: ${rdErr.message}`);

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

    for (const p of Object.values(P)) await principal(p);
    const { error: urErr } = await sb.from("user_roles").insert(
        Object.values(P).map((p) => ({ user_id: p.id, org_id: p.org ?? ORG, role: p.role })),
    );
    if (urErr) throw new Error(`user_roles: ${urErr.message}`);
    return sb;
}

export async function teardown() {
    const ids = Object.values(P).map((p) => p.id);
    await sb.from("user_site_access").delete().in("user_id", ids);
    await sb.from("user_access_profiles").delete().in("user_id", ids);
    await sb.from("user_roles").delete().in("user_id", ids);
    for (const rk of Object.values(CUSTOM)) {
        await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", rk);
        await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", rk);
    }
    for (const id of ids) await sb.auth.admin.deleteUser(id).catch(() => undefined);
}

export { sb };

if (process.argv[2] === "setup") { await setup(); console.log("personas ready"); }
if (process.argv[2] === "teardown") { await teardown(); console.log("personas removed"); }
