#!/usr/bin/env node
/**
 * The deterministic fixture behind the Developer Platform human QA walkthrough.
 *
 * WHY A FIXTURE SCRIPT AND NOT A SEED FILE. The walkthrough asks an operator to
 * judge whether a restricted installation can see a sibling campus. That question
 * only has an answer if the data underneath it is the same every time, so this is
 * `ensure`-shaped: run it twice and the second run restores the same state rather
 * than adding a second copy. An operator who breaks something mid-walkthrough runs
 * `reset` and starts the section again.
 *
 * WHAT IT CREATES. Three developer applications and three installations, each
 * shaped for one question the walkthrough asks:
 *
 *   qa-dp-orgwide      org-wide, context.read + locations.read   the happy path
 *   qa-dp-restricted   one site only                             the boundary gate
 *   qa-dp-noscope      context.read only, org-wide               scope ≠ boundary
 *
 * WHAT IT DOES NOT CREATE. Credentials. A credential's secret exists exactly once,
 * at issue, and the walkthrough's whole point in Section D is that the operator
 * issues it through the product and watches the one-time reveal. Seeding one here
 * would mean either storing a secret (which this fixture refuses to do) or handing
 * the operator a credential they cannot authenticate with.
 *
 * NOTHING REAL. Every identifier is synthetic and every name says "QA". The
 * locations are the existing certification campuses, which are themselves fixture
 * data.
 *
 * Usage:
 *   node scripts/qa/developerPlatformQaFixture.mjs ensure
 *   node scripts/qa/developerPlatformQaFixture.mjs status
 *   node scripts/qa/developerPlatformQaFixture.mjs reset
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..", "..");

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";

/** The three shapes, and the question each one exists to answer. */
const PLAN = [
    {
        key: "orgwide",
        slug: "qa-dp-orgwide",
        name: "QA Integration — Org-wide",
        scopes: ["context.read", "locations.read"],
        boundary: { mode: "org_wide", ids: [] },
        proves: "the happy path: every location in the organization",
    },
    {
        key: "restricted",
        slug: "qa-dp-restricted",
        name: "QA Integration — Single campus",
        scopes: ["context.read", "locations.read"],
        boundary: { mode: "locations", ids: [RIVERSIDE] },
        proves: "the boundary gate: one campus and its rooms, never a sibling",
    },
    {
        key: "noscope",
        slug: "qa-dp-noscope",
        name: "QA Integration — No location capability",
        scopes: ["context.read"],
        boundary: { mode: "org_wide", ids: [] },
        proves: "scope and boundary are different: org-wide reach, still refused",
    },
];

function certEnv() {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    const file = readFileSync(join(WEB, ".env.certification.local"), "utf8");
    const read = (key) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
    const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("No certification environment found.");
    return { url, serviceKey };
}

const env = certEnv();
const supabase = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });

async function remove() {
    for (const item of PLAN) {
        const { data: app } = await supabase.from("developer_applications").select("id").eq("slug", item.slug).maybeSingle();
        if (!app) continue;
        const { data: installs } = await supabase.from("app_installations").select("id").eq("application_id", app.id);
        for (const inst of installs ?? []) {
            await supabase.from("app_credentials").delete().eq("installation_id", inst.id);
            await supabase.from("app_api_activity").delete().eq("installation_id", inst.id);
            await supabase.from("app_security_audit").delete().eq("installation_id", inst.id);
            await supabase.from("app_installations").delete().eq("id", inst.id);
        }
        await supabase.from("app_security_audit").delete().eq("application_id", app.id);
        await supabase.from("developer_applications").delete().eq("id", app.id);
    }
}

async function ensure() {
    // Rebuild rather than patch: a half-edited installation from a previous
    // walkthrough is exactly the state that makes a boundary question unanswerable.
    await remove();

    const created = [];
    for (const item of PLAN) {
        // The catalog identity comes from the canonical registration authority,
        // never an INSERT — the same rule the product itself is held to.
        const { data, error } = await supabase.rpc("register_developer_application", {
            p_slug: item.slug,
            p_name: item.name,
            p_publisher: "Alloy QA",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "developer-platform-qa-fixture",
            p_metadata: { fixture: "developer-platform-qa" },
        });
        if (error) throw new Error(`register ${item.slug}: ${error.message}`);
        if (!data?.ok) throw new Error(`register ${item.slug}: ${data?.code} ${data?.detail ?? ""}`);
        const applicationId = data.application.id;

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId,
            org_id: ORG,
            producer_key: `qa-dp:${item.key}`,
            granted_scopes: item.scopes,
            boundary_mode: item.boundary.mode,
            location_boundary: item.boundary.ids,
            status: "active",
        }).select("id").single();
        if (inst.error) throw new Error(`install ${item.slug}: ${inst.error.message}`);

        created.push({ key: item.key, slug: item.slug, applicationId, installationId: inst.data.id, proves: item.proves });
    }
    return created;
}

async function status() {
    const rows = [];
    for (const item of PLAN) {
        const { data: app } = await supabase.from("developer_applications")
            .select("id, name, status").eq("slug", item.slug).maybeSingle();
        if (!app) { rows.push({ slug: item.slug, present: false }); continue; }
        const { data: installs } = await supabase.from("app_installations")
            .select("id, status, granted_scopes, boundary_mode, location_boundary").eq("application_id", app.id);
        const inst = (installs ?? [])[0] ?? null;
        const creds = inst
            ? await supabase.from("app_credentials").select("id, status", { count: "exact" }).eq("installation_id", inst.id)
            : { data: [] };
        rows.push({
            slug: item.slug,
            present: true,
            application_status: app.status,
            installation_id: inst?.id ?? null,
            installation_status: inst?.status ?? null,
            scopes: inst?.granted_scopes ?? null,
            boundary: inst ? { mode: inst.boundary_mode, locations: inst.location_boundary } : null,
            credentials: (creds.data ?? []).map((c) => c.status),
        });
    }
    return rows;
}

const op = process.argv[2] ?? "status";
try {
    if (op === "ensure") {
        const created = await ensure();
        console.log(JSON.stringify({ ok: true, op, created }, null, 2));
    } else if (op === "reset") {
        await remove();
        console.log(JSON.stringify({ ok: true, op, removed: PLAN.map((p) => p.slug) }, null, 2));
    } else if (op === "status") {
        console.log(JSON.stringify({ ok: true, op, fixtures: await status() }, null, 2));
    } else {
        console.error("usage: developerPlatformQaFixture.mjs ensure|status|reset");
        process.exit(2);
    }
} catch (err) {
    console.error(JSON.stringify({ ok: false, op, error: String(err?.message ?? err) }, null, 2));
    process.exit(1);
}
