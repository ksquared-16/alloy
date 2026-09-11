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
export const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
export const PASSWORD = "alloy-local-cert";

/** Custom roles the ORGANIZATION defines — created through the same RPC the Access editor calls. */
export const CUSTOM = {
    viewer: "mcert_fin_viewer",
    none: "mcert_front_desk",
    portalFinance: "mcert_portal_finance",
    portalOnly: "mcert_portal_only",
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
};

async function principal(p) {
    await sb.auth.admin.deleteUser(p.id).catch(() => undefined);
    const { error } = await sb.auth.admin.createUser({ id: p.id, email: p.email, password: PASSWORD, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw new Error(`${p.email}: ${error.message}`);
}

export async function setup() {
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
    ]);
    if (rdErr) throw new Error(`role_definitions: ${rdErr.message}`);

    for (const [rk, keys] of [
        [CUSTOM.viewer, ["fin.read"]],
        [CUSTOM.none, ["crm.customers.read"]],
        [CUSTOM.portalFinance, ["portal.access", "fin.read"]],
        [CUSTOM.portalOnly, ["portal.access"]],
    ]) {
        const { error } = await sb.rpc("replace_role_permission_grants", { p_org_id: ORG, p_role_key: rk, p_permission_keys: keys });
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
