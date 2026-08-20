/**
 * READ-ONLY latency trace for one deterministic participant turn.
 *
 * The brief asks for the latency OWNER before any optimistic UX is added. Each stage of the turn is
 * timed separately against the live QA session, so the answer is measured rather than assumed.
 * Nothing is written: the apply step is deliberately excluded and the read path is repeated instead.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    const out = await fn();
    console.log(`  ${label.padEnd(34)} ${(performance.now() - t0).toFixed(0)} ms`);
    return out;
}

async function main() {
    const { data: link } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("org_id", ORG)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const path = String((link as { metadata?: { share_embed_path?: string } } | null)?.metadata?.share_embed_path ?? "");
    const token = decodeURIComponent(path.replace("/forms/embed/", ""));

    for (let run = 1; run <= 3; run++) {
        console.log(`\nrun ${run}`);
        const access = await time("token → anchored session", () => resolveParticipantEnrollmentFromToken(supabase, token));
        if (!access.ok) { console.log("  refused:", access.error.code); return; }
        const canonical = await time("canonical record", () =>
            resolveParticipantCanonicalContext(supabase, { orgId: access.value.orgId, processInstanceId: access.value.processInstanceId }));
        await time("objective recompute", () =>
            resolveParticipantEnrollmentObjective(supabase, {
                orgId: access.value.orgId,
                processInstanceId: access.value.processInstanceId,
                canonicalValues: canonical.values,
            }));
    }
}
void main();
