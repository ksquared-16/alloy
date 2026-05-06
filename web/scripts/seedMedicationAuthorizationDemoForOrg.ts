#!/usr/bin/env npx tsx
/**
 * Idempotent medication authorization **demo** seed for a **single chosen org** (local/staging).
 *
 * **Why:** SQL migrations seed only `ALLY_BEND_STAGING_ORG_FORMS_DEMO_ID`. AdminV2 `/adminV2/forms`
 * lists `form_definitions` for the **logged-in user's resolved org** (`user_roles` / legacy paths),
 * which is often a different UUID on staging — so the hub shows "No forms in this org."
 *
 * **Org id** (first set wins):
 *   1. `--org=<uuid>` CLI flag
 *   2. `FORMS_MED_DEMO_ORG_ID`
 *   3. `DEMO_RESET_ORG_ID` (same as realistic staging reseed scripts)
 *
 * **Env:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
 *
 * **Optional:** `FORMS_MED_DEMO_EMBED_ORIGINS` — comma-separated extra `allowed_embed_origins`
 * (e.g. `https://your-staging.example.com`) in addition to localhost defaults.
 *
 * **Public link token:** Uses the canonical demo plaintext when its hash is unused, or when it is
 * already owned by this org. If another org owns that hash, uses an org-suffixed plaintext so
 * `token_hash` stays globally unique.
 *
 * Run from `web/`:
 *   DEMO_RESET_ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedMedicationAuthorizationDemoForOrg.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    MEDICATION_AUTHORIZATION_DEMO_FORM_KEY,
    MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA,
    MEDICATION_AUTHORIZATION_DEMO_OPERATOR_CONTEXT,
    MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING,
    MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN,
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
    MEDICATION_AUTHORIZATION_DEMO_VERSION_METADATA,
    MEDICATION_DEMO_ROUTE_ITEM_KEYS,
    MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOrgArg(argv: string[]): string | null {
    const raw = argv.find((a) => a.startsWith("--org="));
    const v = raw?.slice("--org=".length).trim();
    return v && UUID_RE.test(v) ? v : null;
}

function resolveOrgId(argv: string[]): string {
    return (
        parseOrgArg(argv) ??
        process.env.FORMS_MED_DEMO_ORG_ID?.trim() ??
        process.env.DEMO_RESET_ORG_ID?.trim() ??
        ""
    );
}

function parseEmbedExtras(): string[] {
    const raw = process.env.FORMS_MED_DEMO_EMBED_ORIGINS?.trim();
    if (!raw) return [];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function jsonClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

async function ensureOrgExists(orgId: string): Promise<void> {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("orgs").select("id").eq("id", orgId).maybeSingle();
    if (error) throw new Error(`orgs lookup failed: ${error.message}`);
    if (!data) throw new Error(`org not found: ${orgId}`);
}

async function seedOptionSets(orgId: string): Promise<void> {
    const supabase = createAdminClient();

    const { error: upsertSetsErr } = await supabase.from("option_sets").upsert(
        [
            { org_id: orgId, set_key: "med_demo_schedule", label: "Medication schedule (demo)", sort_order: 900 },
            { org_id: orgId, set_key: "med_demo_route", label: "Medication route (demo)", sort_order: 901 },
        ],
        { onConflict: "org_id,set_key" }
    );
    if (upsertSetsErr) throw new Error(`option_sets upsert: ${upsertSetsErr.message}`);

    const { data: scheduleSet, error: sErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", orgId)
        .eq("set_key", "med_demo_schedule")
        .maybeSingle();
    if (sErr || !scheduleSet) throw new Error(`med_demo_schedule row missing: ${sErr?.message ?? "?"}`);

    const { data: routeSet, error: rErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", orgId)
        .eq("set_key", "med_demo_route")
        .maybeSingle();
    if (rErr || !routeSet) throw new Error(`med_demo_route row missing: ${rErr?.message ?? "?"}`);

    const scheduleRows = MEDICATION_DEMO_SCHEDULE_ITEM_KEYS.flatMap((item_key, i) => {
        const labels = ["Daily", "Twice daily", "As needed", "Other"] as const;
        return [{ option_set_id: scheduleSet.id, item_key, label: labels[i] ?? item_key, sort_order: (i + 1) * 10 }];
    });
    const routeRows = MEDICATION_DEMO_ROUTE_ITEM_KEYS.flatMap((item_key, i) => {
        const labels = ["Oral", "Topical", "Inhaled", "Injection", "Other"] as const;
        return [{ option_set_id: routeSet.id, item_key, label: labels[i] ?? item_key, sort_order: (i + 1) * 10 }];
    });

    const { error: itemsScheduleErr } = await supabase.from("option_set_items").upsert(scheduleRows, {
        onConflict: "option_set_id,item_key",
    });
    if (itemsScheduleErr) throw new Error(`option_set_items (schedule): ${itemsScheduleErr.message}`);

    const { error: itemsRouteErr } = await supabase.from("option_set_items").upsert(routeRows, {
        onConflict: "option_set_id,item_key",
    });
    if (itemsRouteErr) throw new Error(`option_set_items (route): ${itemsRouteErr.message}`);
}

async function upsertFormDefinition(orgId: string): Promise<string> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_definitions")
        .upsert(
            {
                org_id: orgId,
                key: MEDICATION_AUTHORIZATION_DEMO_FORM_KEY,
                name: "Medication Authorization — Demo",
                description: "Demo/example-only schema — not an official state compliance form.",
                kind: "center",
                is_active: true,
                metadata: {
                    ...jsonClone(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA),
                    operator_context: jsonClone(MEDICATION_AUTHORIZATION_DEMO_OPERATOR_CONTEXT),
                },
            },
            { onConflict: "org_id,key" }
        )
        .select("id")
        .single();
    if (error || !data?.id) throw new Error(`form_definitions upsert: ${error?.message ?? "no id"}`);
    return data.id;
}

async function ensurePublishedVersion(orgId: string, formDefinitionId: string): Promise<string> {
    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("form_definition_versions")
        .select("id,status")
        .eq("form_definition_id", formDefinitionId)
        .eq("version_number", 1)
        .maybeSingle();
    if (exErr) throw new Error(`version lookup: ${exErr.message}`);
    if (existing?.id) {
        if (existing.status !== "published") {
            console.warn(
                "[seed-medication-demo] version 1 exists but is not published — leaving as-is (immutable if published elsewhere)."
            );
        }
        return existing.id;
    }

    const { data: inserted, error: insErr } = await supabase
        .from("form_definition_versions")
        .insert({
            form_definition_id: formDefinitionId,
            org_id: orgId,
            version_number: 1,
            status: "published",
            schema_json: jsonClone(MEDICATION_AUTHORIZATION_DEMO_SCHEMA),
            pdf_mapping_json: jsonClone(MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING),
            published_at: new Date().toISOString(),
            published_by_user_id: null,
            metadata: jsonClone(MEDICATION_AUTHORIZATION_DEMO_VERSION_METADATA),
        })
        .select("id")
        .single();
    if (insErr || !inserted?.id) throw new Error(`version insert: ${insErr?.message ?? "no id"}`);
    return inserted.id;
}

async function ensurePublicLink(
    orgId: string,
    formDefinitionId: string,
    versionId: string
): Promise<{ plaintext: string; reusedGlobalToken: boolean }> {
    const supabase = createAdminClient();

    const { data: verticalRow } = await supabase
        .from("verticals")
        .select("id")
        .eq("slug", "cleaning")
        .eq("is_active", true)
        .maybeSingle();
    const intakeMeta =
        verticalRow?.id != null
            ? {
                  lead_capture: true as const,
                  default_vertical_id: verticalRow.id as string,
                  auto_create_person: true as const,
                  auto_create_customer: true as const,
                  auto_create_customer_member: true as const,
                  auto_create_opportunity: true as const,
              }
            : {};

    const { data: alreadyForForm, error: linkErr } = await supabase
        .from("form_public_links")
        .select("id")
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .limit(1)
        .maybeSingle();
    if (linkErr) throw new Error(`public link lookup: ${linkErr.message}`);
    if (alreadyForForm?.id) {
        if (Object.keys(intakeMeta).length > 0) {
            const { data: metaRow, error: metaErr } = await supabase
                .from("form_public_links")
                .select("metadata")
                .eq("id", alreadyForForm.id)
                .maybeSingle();
            if (!metaErr && metaRow && typeof metaRow.metadata === "object" && metaRow.metadata) {
                const merged = {
                    ...(metaRow.metadata as Record<string, unknown>),
                    ...intakeMeta,
                };
                const { error: upErr } = await supabase
                    .from("form_public_links")
                    .update({ metadata: merged })
                    .eq("id", alreadyForForm.id);
                if (upErr) {
                    console.warn("[seed-medication-demo] could not merge lead_capture metadata:", upErr.message);
                }
            }
        } else {
            console.warn(
                "[seed-medication-demo] no active cleaning vertical — existing link left without lead_capture (document attach may fail until configured)."
            );
        }
        console.log("[seed-medication-demo] public link already exists for this form — skipping insert.");
        return { plaintext: "(existing link — token not printed)", reusedGlobalToken: true };
    }

    const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    const allowed_embed_origins = [...defaultOrigins, ...parseEmbedExtras()];
    const dedupe = [...new Set(allowed_embed_origins)];

    let plaintext: string = MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN;
    const canonicalHash = hashFormLinkToken(plaintext);
    const { data: hashOwner, error: hoErr } = await supabase
        .from("form_public_links")
        .select("org_id")
        .eq("token_hash", canonicalHash)
        .maybeSingle();
    if (hoErr) throw new Error(`token_hash probe: ${hoErr.message}`);
    if (hashOwner && hashOwner.org_id !== orgId) {
        plaintext = `${MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN}__org_${orgId}`;
        console.log(
            "[seed-medication-demo] canonical demo token_hash owned by another org — using org-specific plaintext."
        );
    }

    const token_hash = hashFormLinkToken(plaintext);
    const { error: insErr } = await supabase.from("form_public_links").insert({
        org_id: orgId,
        token_hash,
        token_prefix: "demo_med",
        form_definition_id: formDefinitionId,
        pinned_form_definition_version_id: versionId,
        is_active: true,
        allowed_embed_origins: dedupe,
        metadata: {
            demo: true,
            seed: "medication_authorization_demo",
            seeded_by: "seedMedicationAuthorizationDemoForOrg.ts",
            ...intakeMeta,
        },
    });
    if (insErr) throw new Error(`public link insert: ${insErr.message}`);

    return {
        plaintext,
        reusedGlobalToken: plaintext === MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN,
    };
}

async function main() {
    const argv = process.argv.slice(2);
    const orgId = resolveOrgId(argv);
    if (!orgId || !UUID_RE.test(orgId)) {
        console.error(
            "Missing or invalid org UUID. Set FORMS_MED_DEMO_ORG_ID or DEMO_RESET_ORG_ID, or pass --org=<uuid>."
        );
        process.exit(1);
    }

    console.log("[seed-medication-demo] org_id=", orgId);
    await ensureOrgExists(orgId);
    await seedOptionSets(orgId);
    const formId = await upsertFormDefinition(orgId);
    const versionId = await ensurePublishedVersion(orgId, formId);
    const link = await ensurePublicLink(orgId, formId, versionId);

    console.log("[seed-medication-demo] done.", {
        form_definition_id: formId,
        published_version_id: versionId,
        embed_plaintext_token: link.plaintext,
        note: "Use Admin UI to create a new public link if you need a fresh random token; this seed is for demo/embed smoke.",
    });
}

main().catch((e) => {
    console.error("[seed-medication-demo] failed:", e);
    process.exit(1);
});
