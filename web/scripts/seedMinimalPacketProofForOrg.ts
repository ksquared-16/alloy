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
 * **Dev/test reset:** `--reset-sessions` deletes `form_packet_session_items` + `form_packet_sessions` only for
 * this org’s minimal-proof packet definition rows that were started via the seeded public link(s)
 * (`metadata.seed === minimal_packet_proof_demo`). Does not delete definitions, packet items, or the link row.
 *
 * **Fresh embed URL:** `--fresh-token` bumps `metadata.fresh_token_revision` and rotates `token_hash` on that
 * seeded link (see `metadata.embed_plaintext_token`). Use with `--reset-sessions` for a clean Step 1 retest.
 *
 * **Browser note:** the embed client stores the draft submission id in **sessionStorage** under
 * `alloy_public_form_submission:` + `encodeURIComponent(<token from URL>)`. After `--reset-sessions` alone, clear
 * that key for your embed origin or use `--fresh-token` so the URL token changes and the key no longer matches.
 *
 * Run from `web/`:
 *   DEMO_RESET_ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedMinimalPacketProofForOrg.ts
 *   DEMO_RESET_ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedMinimalPacketProofForOrg.ts --reset-sessions
 *   DEMO_RESET_ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedMinimalPacketProofForOrg.ts --reset-sessions --fresh-token
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

function parseSeedFlags(argv: string[]): { resetSessions: boolean; freshToken: boolean } {
    return {
        resetSessions: argv.includes("--reset-sessions"),
        freshToken: argv.includes("--fresh-token"),
    };
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

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Deletes runtime packet sessions for minimal-proof seeded link(s) only (scoped by org + packet def + link seed). */
async function deleteMinimalProofPacketSessions(orgId: string, packetDefinitionId: string): Promise<{
    sessionsDeleted: number;
    itemsDeleted: number;
}> {
    const supabase = createAdminClient();
    const { data: links, error: linkErr } = await supabase
        .from("form_public_links")
        .select("id")
        .eq("org_id", orgId)
        .eq("metadata->>seed", MINIMAL_PACKET_PROOF_METADATA_SEED);
    if (linkErr) throw new Error(`reset-sessions: list seeded links: ${linkErr.message}`);

    const linkIds = (links ?? []).map((r) => r.id).filter(Boolean);
    if (linkIds.length === 0) {
        console.log(
            "[seed-minimal-packet-proof] reset-sessions: no form_public_links matched metadata.seed — deleted 0 sessions, 0 session items."
        );
        return { sessionsDeleted: 0, itemsDeleted: 0 };
    }

    const { data: sessions, error: sessErr } = await supabase
        .from("form_packet_sessions")
        .select("id")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .in("started_via_public_link_id", linkIds);
    if (sessErr) throw new Error(`reset-sessions: list sessions: ${sessErr.message}`);

    const sessionIds = (sessions ?? []).map((s) => s.id).filter(Boolean);
    if (sessionIds.length === 0) {
        console.log("[seed-minimal-packet-proof] reset-sessions: deleted 0 packet sessions, 0 session items.");
        return { sessionsDeleted: 0, itemsDeleted: 0 };
    }

    const { count: itemCount, error: cntErr } = await supabase
        .from("form_packet_session_items")
        .select("id", { count: "exact", head: true })
        .in("packet_session_id", sessionIds);
    if (cntErr) throw new Error(`reset-sessions: count session items: ${cntErr.message}`);

    const { error: delErr } = await supabase.from("form_packet_sessions").delete().in("id", sessionIds);
    if (delErr) throw new Error(`reset-sessions: delete sessions: ${delErr.message}`);

    const itemsDeleted = itemCount ?? 0;
    const sessionsDeleted = sessionIds.length;
    console.log(
        `[seed-minimal-packet-proof] reset-sessions: deleted ${sessionsDeleted} packet session(s), ${itemsDeleted} session item row(s).`
    );
    return { sessionsDeleted, itemsDeleted };
}

async function ensurePacketPublicLink(
    orgId: string,
    packetDefinitionId: string,
    childFormId: string,
    childVersionId: string,
    opts?: { freshToken?: boolean }
): Promise<{ plaintext: string; embedPath: string }> {
    const supabase = createAdminClient();
    const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    const allowed_embed_origins = [...new Set([...defaultOrigins, ...parseEmbedExtras()])];

    const { data: seedLinks, error: slErr } = await supabase
        .from("form_public_links")
        .select("id, metadata, token_hash, created_at")
        .eq("org_id", orgId)
        .eq("metadata->>seed", MINIMAL_PACKET_PROOF_METADATA_SEED)
        .order("created_at", { ascending: true });
    if (slErr) throw new Error(`public link seed lookup: ${slErr.message}`);
    if ((seedLinks?.length ?? 0) > 1) {
        console.warn(
            `[seed-minimal-packet-proof] multiple form_public_links share metadata.seed for this org (${seedLinks!.length}); using oldest row id=${seedLinks![0].id}.`
        );
    }
    const existingSeedLink = seedLinks?.[0] ?? null;
    const meta = asRecord(existingSeedLink?.metadata);

    const compactOrg = orgId.replace(/-/g, "");
    let freshRevision = Number(meta.fresh_token_revision);
    if (!Number.isFinite(freshRevision)) freshRevision = 0;

    let plaintext: string;
    if (opts?.freshToken) {
        freshRevision += 1;
        plaintext = `${MINIMAL_PACKET_PROOF_PUBLIC_TOKEN}__fresh_r${freshRevision}_${compactOrg}`;
        console.log(`[seed-minimal-packet-proof] --fresh-token: revision=${freshRevision}`);
    } else if (typeof meta.embed_plaintext_token === "string" && meta.embed_plaintext_token.length > 0) {
        plaintext = meta.embed_plaintext_token;
    } else {
        plaintext = MINIMAL_PACKET_PROOF_PUBLIC_TOKEN;
        const probeHash = hashFormLinkToken(plaintext);
        const { data: hashOwner, error: hoErr } = await supabase
            .from("form_public_links")
            .select("org_id")
            .eq("token_hash", probeHash)
            .maybeSingle();
        if (hoErr) throw new Error(`token_hash probe: ${hoErr.message}`);
        if (hashOwner && hashOwner.org_id !== orgId) {
            plaintext = `${MINIMAL_PACKET_PROOF_PUBLIC_TOKEN}__org_${orgId}`;
            console.log("[seed-minimal-packet-proof] canonical token owned by another org — using org-suffixed plaintext.");
        }
    }

    let token_hash = hashFormLinkToken(plaintext);
    const { data: hashOwnerGlobal, error: hogErr } = await supabase
        .from("form_public_links")
        .select("id, org_id")
        .eq("token_hash", token_hash)
        .maybeSingle();
    if (hogErr) throw new Error(`token_hash global probe: ${hogErr.message}`);
    const hashTakenByOtherRow =
        hashOwnerGlobal != null &&
        (!existingSeedLink?.id || hashOwnerGlobal.id !== existingSeedLink.id);
    if (hashTakenByOtherRow) {
        plaintext = `${plaintext}__collide_${orgId}`;
        token_hash = hashFormLinkToken(plaintext);
        console.warn("[seed-minimal-packet-proof] token_hash already used by another link row — appended collide suffix.");
    }

    const nextMeta: Record<string, unknown> = {
        demo: true,
        seed: MINIMAL_PACKET_PROOF_METADATA_SEED,
        seeded_by: "seedMinimalPacketProofForOrg.ts",
        label: "Minimal Packet Proof (demo)",
        form_context_mode: "packet",
        packet_definition_id: packetDefinitionId,
        lead_capture: false,
        intake: false,
        embed_plaintext_token: plaintext,
        ...(opts?.freshToken ? { fresh_token_revision: freshRevision } : {}),
    };

    const token_prefix = plaintext.length > 12 ? plaintext.slice(0, 12) : plaintext;

    if (existingSeedLink?.id) {
        const mergedMeta = { ...meta, ...nextMeta };
        const { error: upErr } = await supabase
            .from("form_public_links")
            .update({
                token_hash,
                token_prefix,
                form_definition_id: childFormId,
                pinned_form_definition_version_id: childVersionId,
                is_active: true,
                allowed_embed_origins,
                metadata: mergedMeta,
            })
            .eq("id", existingSeedLink.id)
            .eq("org_id", orgId);
        if (upErr) throw new Error(`public link update: ${upErr.message}`);
        return { plaintext, embedPath: buildPublicFormEmbedPath(plaintext) };
    }

    const { error: insErr } = await supabase.from("form_public_links").insert({
        org_id: orgId,
        token_hash,
        token_prefix,
        form_definition_id: childFormId,
        pinned_form_definition_version_id: childVersionId,
        is_active: true,
        allowed_embed_origins,
        metadata: nextMeta,
    });
    if (insErr) throw new Error(`public link insert: ${insErr.message}`);

    return { plaintext, embedPath: buildPublicFormEmbedPath(plaintext) };
}

async function main() {
    const argv = process.argv.slice(2);
    const { resetSessions, freshToken } = parseSeedFlags(argv);
    const orgId = resolveOrgId(argv);
    if (!orgId || !UUID_RE.test(orgId)) {
        console.error(
            "Missing or invalid org UUID. Set FORMS_MINIMAL_PACKET_PROOF_ORG_ID or DEMO_RESET_ORG_ID, or pass --org=<uuid>."
        );
        process.exit(1);
    }

    console.log("[seed-minimal-packet-proof] org_id=", orgId, { resetSessions, freshToken });
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

    if (resetSessions) {
        await deleteMinimalProofPacketSessions(orgId, packetDefId);
    }

    const { plaintext, embedPath } = await ensurePacketPublicLink(orgId, packetDefId, childFormId, childVersionId, {
        freshToken,
    });

    const appBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
        process.env.VERCEL_URL?.trim().replace(/\/$/, "") ||
        "http://localhost:3000";
    const absoluteUrl = `${appBase.startsWith("http") ? appBase : `https://${appBase}`}${embedPath}`;

    console.log("[seed-minimal-packet-proof] embed URL (open in browser):", absoluteUrl);

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
