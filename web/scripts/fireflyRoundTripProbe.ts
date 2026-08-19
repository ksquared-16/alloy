/**
 * READ-ONLY: isolate WHY a publish would change stages other than `enrolling`.
 *
 * Two candidate causes, and they need separating before anything is written to a live tenant:
 *   A. the Law 7 parse/serialize round trip the canonical save path performs
 *   B. D-97 normalization, which materializes `requirements_v1` on every stage at publish
 *
 * Writes nothing.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { normalizeBusinessProcessPayloadRequirements } from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

function env(): Record<string, string> {
    const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
    return Object.fromEntries(
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
}

const j = (v: unknown) => JSON.stringify(v);

/** Deep key-path diff, so "changed" can be attributed rather than guessed. */
function paths(before: unknown, after: unknown, at = "", out: string[] = []): string[] {
    if (j(before) === j(after)) return out;
    const ba = Array.isArray(before);
    const aa = Array.isArray(after);
    if (ba && aa) {
        const len = Math.max(before.length, after.length);
        for (let i = 0; i < len; i++) paths(before[i], after[i], `${at}[${i}]`, out);
        return out;
    }
    const bo = before && typeof before === "object" && !ba;
    const ao = after && typeof after === "object" && !aa;
    if (!bo || !ao) {
        out.push(`${at || "<root>"}: ${j(before)?.slice(0, 90)} -> ${j(after)?.slice(0, 90)}`);
        return out;
    }
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
    for (const k of keys) {
        paths((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], at ? `${at}.${k}` : k, out);
    }
    return out;
}

async function main() {
    const e = env();
    const supabase = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: draft } = await supabase
        .from("business_process_drafts")
        .select("payload")
        .eq("org_id", ORG)
        .eq("department_id", DEPT)
        .maybeSingle();
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("org_id", ORG)
        .eq("id", DEPT)
        .maybeSingle();

    const published = draft!.payload as Record<string, unknown>;

    // A. Round trip alone, no edits, no normalization.
    const roundTripped = serializeLifecycleBuilderV1(parseLifecycleBuilderV1(published)!);
    const rtDiff = paths(published, roundTripped);
    console.log(`=== A. Law 7 round trip alone ===`);
    console.log(`   lossless: ${rtDiff.length === 0}`);
    for (const d of rtDiff.slice(0, 25)) console.log(`     ${d}`);
    if (rtDiff.length > 25) console.log(`     …and ${rtDiff.length - 25} more`);

    // B. D-97 normalization on top of the round trip.
    const normalized = normalizeBusinessProcessPayloadRequirements({
        payload: roundTripped,
        departmentMetadata: dept?.metadata ?? null,
    });
    const normDiff = paths(roundTripped, normalized.payload);
    console.log(`\n=== B. D-97 normalization on top ===`);
    console.log(`   changed: ${normalized.changed}, diff paths: ${normDiff.length}`);
    for (const d of normDiff.slice(0, 12)) console.log(`     ${d.slice(0, 150)}`);
    if (normDiff.length > 12) console.log(`     …and ${normDiff.length - 12} more`);
}

void main();
