/**
 * Diagnostic: does writing the D-97-normalized payload back to the draft actually fail, and why?
 *
 * `publishDraft` failed twice at exactly that write with a bare "TypeError: fetch failed", which is a
 * transport-level error carrying no PostgREST detail. A same-size no-op update to the same row
 * succeeded, so this narrows it to the normalized body specifically.
 *
 * Writes only the draft payload, and only the value publish would write anyway.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { normalizeBusinessProcessPayloadRequirements } from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(
    text
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .map((l) => {
            const i = l.indexOf("=");
            let v = l.slice(i + 1).trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            return [l.slice(0, i).trim(), v];
        }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

async function main() {
    const { data: draft } = await supabase
        .from("business_process_drafts")
        .select("id, draft_revision, payload")
        .eq("org_id", ORG)
        .eq("department_id", DEPT)
        .maybeSingle();
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("org_id", ORG)
        .eq("id", DEPT)
        .maybeSingle();

    const row = draft as { id: string; draft_revision: number; payload: Record<string, unknown> };
    const normalized = normalizeBusinessProcessPayloadRequirements({
        payload: row.payload,
        departmentMetadata: (dept as { metadata?: Record<string, unknown> } | null)?.metadata ?? null,
    });

    console.log("current payload bytes :", JSON.stringify(row.payload).length);
    console.log("normalized bytes      :", JSON.stringify(normalized.payload).length);
    console.log("changed               :", normalized.changed);

    try {
        const { data, error } = await supabase
            .from("business_process_drafts")
            .update({ payload: normalized.payload })
            .eq("id", row.id)
            .eq("org_id", ORG)
            .eq("draft_revision", row.draft_revision)
            .select("id, draft_revision")
            .maybeSingle();
        console.log("write result          :", error ? `ERR ${JSON.stringify(error)}` : `ok ${JSON.stringify(data)}`);
    } catch (e) {
        const err = e as { message?: string; cause?: { message?: string; code?: string } };
        console.log("write THREW           :", err.message, "| cause:", err.cause?.message, err.cause?.code);
    }
}

void main();
