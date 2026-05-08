#!/usr/bin/env npx tsx
/**
 * Idempotent **demo/proof** seed: two simple forms + one two-step packet + one public packet link.
 *
 * **Org id** (first set wins):
 *   1. `--org=<uuid>`
 *   2. `FORMS_MINIMAL_PACKET_PROOF_ORG_ID`
 *   3. `DEMO_RESET_ORG_ID`
 *
 * **Env:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
 *
 * **Optional:** `FORMS_MINIMAL_PACKET_PROOF_EMBED_ORIGINS` — comma-separated origins (default includes localhost).
 *
 * Run from `web/`:
 *   DEMO_RESET_ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedMinimalPacketProofForOrg.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";
import {
    MINIMAL_PACKET_PROOF_CHILD_FORM_KEY,
    MINIMAL_PACKET_PROOF_CHILD_SCHEMA,
    MINIMAL_PACKET_PROOF_DEFINITION_METADATA,
    MINIMAL_PACKET_PROOF_GUARDIAN_FORM_KEY,
    MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA,
    MINIMAL_PACKET_PROOF_METADATA_SEED,
    MINIMAL_PACKET_PROOF_PACKET_KEY,
    MINIMAL_PACKET_PROOF_PUBLIC_TOKEN,
    MINIMAL_PACKET_PROOF_STEP_KEYS,
} from "@/lib/forms/seeds/minimalPacketProofDemo";

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
        process.env.FORMS_MINIMAL_PACKET_PROOF_ORG_ID?.trim() ??
        process.env.DEMO_RESET_ORG_ID?.trim() ??
        ""
    );
}

function parseEmbedExtras(): string[] {
    const raw = process.env.FORMS_MINIMAL_PACKET_PROOF_EMBED_ORIGINS?.trim();
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

async function upsertFormDefinition(orgId: string, key: string, name: string): Promise<string> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_definitions")
        .upsert(
            {
                org_id: orgId,
                key,
                name,
                description: "Demo/proof only — not production enrollment.",
                kind: "center",
                is_active: true,
                metadata: {
                    ...jsonClone(MINIMAL_PACKET_PROOF_DEFINITION_METADATA),
                    proof_form_key: key,
                },
            },
            { onConflict: "org_id,key" }
        )
        .select("id")
        .single();
    if (error || !data?.id) throw new Error(`form_definitions upsert (${key}): ${error?.message ?? "no id"}`);
    return data.id;
}

async function ensurePublishedVersion(
    orgId: string,
    formDefinitionId: string,
    schema: unknown,
    versionLabel: string
): Promise<string> {
    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("form_definition_versions")
        .select("id,status")
        .eq("form_definition_id", formDefinitionId)
        .eq("version_number", 1)
        .maybeSingle();
    if (exErr) throw new Error(`version lookup (${versionLabel}): ${exErr.message}`);
    if (existing?.id) {
        if (existing.status !== "published") {
            console.warn(`[seed-minimal-packet-proof] ${versionLabel}: version 1 exists but is not published — leaving as-is.`);
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
            schema_json: jsonClone(schema),
            pdf_mapping_json: null,
            published_at: new Date().toISOString(),
            published_by_user_id: null,
            metadata: { demo: true, proof_packet: true },
        })
        .select("id")
        .single();
    if (insErr || !inserted?.id) throw new Error(`version insert (${versionLabel}): ${insErr?.message ?? "no id"}`);
    return inserted.id;
}

async function ensurePacketDefinition(orgId: string): Promise<string> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_definitions")
        .upsert(
            {
                org_id: orgId,
                key: MINIMAL_PACKET_PROOF_PACKET_KEY,
                name: "Minimal Packet Proof",
                description: "Demo only — Test Child Basics → Test Guardian Basics.",
                is_active: true,
                metadata: jsonClone(MINIMAL_PACKET_PROOF_DEFINITION_METADATA),
            },
            { onConflict: "org_id,key" }
        )
        .select("id")
        .single();
    if (error || !data?.id) throw new Error(`form_packet_definitions upsert: ${error?.message ?? "no id"}`);
    return data.id;
}

async function ensurePacketItems(
    orgId: string,
    packetDefinitionId: string,
    childFormId: string,
    childVersionId: string,
    guardianFormId: string,
    guardianVersionId: string
): Promise<void> {
    const supabase = createAdminClient();
    const { error } = await supabase.from("form_packet_items").upsert(
        [
            {
                org_id: orgId,
                packet_definition_id: packetDefinitionId,
                sequence_index: 0,
                form_definition_id: childFormId,
                pinned_form_definition_version_id: childVersionId,
                metadata: { demo_step: MINIMAL_PACKET_PROOF_STEP_KEYS[0] },
            },
            {
                org_id: orgId,
                packet_definition_id: packetDefinitionId,
                sequence_index: 1,
                form_definition_id: guardianFormId,
                pinned_form_definition_version_id: guardianVersionId,
                metadata: { demo_step: MINIMAL_PACKET_PROOF_STEP_KEYS[1] },
            },
        ],
        { onConflict: "packet_definition_id,sequence_index" }
    );
    if (error) throw new Error(`form_packet_items upsert: ${error.message}`);
}

async function ensurePacketPublicLink(
    orgId: string,
    packetDefinitionId: string,
    childFormId: string,
    childVersionId: string
): Promise<{ plaintext: string; embedPath: string }> {
    const supabase = createAdminClient();
    const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    const allowed_embed_origins = [...new Set([...defaultOrigins, ...parseEmbedExtras()])];

    let plaintext: string = MINIMAL_PACKET_PROOF_PUBLIC_TOKEN;
    let token_hash = hashFormLinkToken(plaintext);

    const { data: hashOwner, error: hoErr } = await supabase
        .from("form_public_links")
        .select("id, org_id, metadata")
        .eq("token_hash", token_hash)
        .maybeSingle();
    if (hoErr) throw new Error(`token_hash probe: ${hoErr.message}`);

    if (hashOwner && hashOwner.org_id !== orgId) {
        plaintext = `${MINIMAL_PACKET_PROOF_PUBLIC_TOKEN}__org_${orgId}`;
        token_hash = hashFormLinkToken(plaintext);
        console.log("[seed-minimal-packet-proof] canonical token owned by another org — using org-suffixed plaintext.");
    }

    const metadata: Record<string, unknown> = {
        demo: true,
        seed: MINIMAL_PACKET_PROOF_METADATA_SEED,
        seeded_by: "seedMinimalPacketProofForOrg.ts",
        label: "Minimal Packet Proof (demo)",
        form_context_mode: "packet",
        packet_definition_id: packetDefinitionId,
        lead_capture: false,
        intake: false,
    };

    const { data: existingByHash, error: exHashErr } = await supabase
        .from("form_public_links")
        .select("id, metadata")
        .eq("token_hash", token_hash)
        .eq("org_id", orgId)
        .maybeSingle();
    if (exHashErr) throw new Error(`public link by hash: ${exHashErr.message}`);

    if (existingByHash?.id) {
        const { error: upErr } = await supabase
            .from("form_public_links")
            .update({
                form_definition_id: childFormId,
                pinned_form_definition_version_id: childVersionId,
                is_active: true,
                allowed_embed_origins,
                metadata: { ...(typeof existingByHash.metadata === "object" && existingByHash.metadata ? existingByHash.metadata : {}), ...metadata },
            })
            .eq("id", existingByHash.id)
            .eq("org_id", orgId);
        if (upErr) throw new Error(`public link update: ${upErr.message}`);
        return { plaintext, embedPath: buildPublicFormEmbedPath(plaintext) };
    }

    const token_prefix = plaintext.length > 12 ? plaintext.slice(0, 12) : plaintext;

    const { error: insErr } = await supabase.from("form_public_links").insert({
        org_id: orgId,
        token_hash,
        token_prefix,
        form_definition_id: childFormId,
        pinned_form_definition_version_id: childVersionId,
        is_active: true,
        allowed_embed_origins,
        metadata,
    });
    if (insErr) throw new Error(`public link insert: ${insErr.message}`);

    return { plaintext, embedPath: buildPublicFormEmbedPath(plaintext) };
}

async function main() {
    const argv = process.argv.slice(2);
    const orgId = resolveOrgId(argv);
    if (!orgId || !UUID_RE.test(orgId)) {
        console.error(
            "Missing or invalid org UUID. Set FORMS_MINIMAL_PACKET_PROOF_ORG_ID or DEMO_RESET_ORG_ID, or pass --org=<uuid>."
        );
        process.exit(1);
    }

    console.log("[seed-minimal-packet-proof] org_id=", orgId);
    await ensureOrgExists(orgId);

    const childFormId = await upsertFormDefinition(orgId, MINIMAL_PACKET_PROOF_CHILD_FORM_KEY, "Test Child Basics");
    const guardianFormId = await upsertFormDefinition(
        orgId,
        MINIMAL_PACKET_PROOF_GUARDIAN_FORM_KEY,
        "Test Guardian Basics"
    );

    const childVersionId = await ensurePublishedVersion(orgId, childFormId, MINIMAL_PACKET_PROOF_CHILD_SCHEMA, "child");
    const guardianVersionId = await ensurePublishedVersion(
        orgId,
        guardianFormId,
        MINIMAL_PACKET_PROOF_GUARDIAN_SCHEMA,
        "guardian"
    );

    const packetDefId = await ensurePacketDefinition(orgId);
    await ensurePacketItems(orgId, packetDefId, childFormId, childVersionId, guardianFormId, guardianVersionId);

    const { plaintext, embedPath } = await ensurePacketPublicLink(orgId, packetDefId, childFormId, childVersionId);

    const appBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
        process.env.VERCEL_URL?.trim().replace(/\/$/, "") ||
        "http://localhost:3000";
    const absoluteUrl = `${appBase.startsWith("http") ? appBase : `https://${appBase}`}${embedPath}`;

    console.log("[seed-minimal-packet-proof] done.", {
        packet_definition_id: packetDefId,
        child_form_definition_id: childFormId,
        guardian_form_definition_id: guardianFormId,
        child_version_id: childVersionId,
        guardian_version_id: guardianVersionId,
        embed_plaintext_token: plaintext,
        embed_path: embedPath,
        open_in_browser: absoluteUrl,
        adminV2_packets: "/adminV2/forms/packets",
        workflow_event_sql_hint:
            "select id, event_type, occurred_at, payload->>'packet_session_id' as packet_session_id from workflow_events where org_id = '<ORG>' and event_type = 'form_packet_completed' order by occurred_at desc limit 10;",
    });
}

main().catch((e) => {
    console.error("[seed-minimal-packet-proof] failed:", e);
    process.exit(1);
});
