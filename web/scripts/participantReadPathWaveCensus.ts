/**
 * READ-ONLY wave census for one participant turn's read path.
 *
 * `participantTurnLatency.ts` answers "how long did each stage take". This answers the question
 * that actually predicts the number: how many SERIAL round trips does a turn make? Against hosted
 * Supabase from a laptop one round trip is ~350 ms, so wall time is waves x RTT and the only lever
 * that matters is removing a wave — not making a query faster.
 *
 * Wraps global fetch so every PostgREST round trip is timed and attributed, then groups overlapping
 * requests into waves. Warms the immutable pinned-config memo first, because a cold process reports
 * a first-boot number no participant ever experiences.
 *
 * Writes nothing.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveParticipantEnrollmentObjectiveWithContext } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));

type Call = { table: string; start: number; end: number };
const calls: Call[] = [];
let collecting = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const start = performance.now();
    const res = await realFetch(input as RequestInfo, init);
    if (collecting && url.includes("/rest/v1/")) {
        const table = url.split("/rest/v1/")[1].split("?")[0];
        const qs = url.split("?")[1] ?? "";
        calls.push({ table: `${table}${qs ? ` (${qs.slice(0, 70)})` : ""}`, start, end: performance.now() });
    }
    return res;
}) as typeof fetch;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function report(label: string) {
    const sorted = [...calls].sort((a, b) => a.start - b.start);
    const waves: Call[][] = [];
    for (const c of sorted) {
        const last = waves[waves.length - 1];
        if (last && c.start < Math.max(...last.map((x) => x.end)) - 1) last.push(c);
        else waves.push([c]);
    }
    const total = sorted.length ? Math.max(...sorted.map((c) => c.end)) - Math.min(...sorted.map((c) => c.start)) : 0;
    console.log(`\n=== ${label}: ${sorted.length} queries in ${waves.length} serial waves, ${total.toFixed(0)} ms ===`);
    waves.forEach((w, i) => {
        const span = Math.max(...w.map((c) => c.end)) - Math.min(...w.map((c) => c.start));
        console.log(`  wave ${String(i + 1).padStart(2)}  ${span.toFixed(0).padStart(5)} ms  ${w.length} query(ies)`);
        w.forEach((c) => console.log(`            ${(c.end - c.start).toFixed(0).padStart(5)} ms  ${c.table}`));
    });
    calls.length = 0;
}

async function main() {
    const { data: link } = await supabase
        .from("form_public_links").select("metadata").eq("org_id", ORG)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const path = String((link as { metadata?: { share_embed_path?: string } } | null)?.metadata?.share_embed_path ?? "");
    const token = decodeURIComponent(path.replace("/forms/embed/", ""));

    // Warm exactly what a live server is warm: the immutable pinned-config memo (BP revision
    // payload, pinned form versions). Measuring a cold process would report a first-boot number no
    // participant ever experiences.
    {
        const warm = await resolveParticipantEnrollmentFromToken(supabase, token);
        if (warm.ok) {
            await resolveParticipantEnrollmentObjectiveWithContext(supabase, {
                orgId: warm.value.orgId,
                processInstanceId: warm.value.processInstanceId,
                preloadedSession: warm.value.session,
            });
        }
    }

    collecting = true;
    const t0 = performance.now();
    const access = await resolveParticipantEnrollmentFromToken(supabase, token);
    if (!access.ok) { console.log("refused", access.error.code); return; }
    const [canonical] = await Promise.all([
        resolveParticipantCanonicalContext(supabase, { orgId: access.value.orgId, processInstanceId: access.value.processInstanceId }),
        resolveParticipantEnrollmentObjectiveWithContext(supabase, {
            orgId: access.value.orgId,
            processInstanceId: access.value.processInstanceId,
            preloadedSession: access.value.session,
        }),
    ]);
    void canonical;
    const elapsed = performance.now() - t0;
    collecting = false;
    report(`FULL TURN READ PATH (${elapsed.toFixed(0)} ms wall)`);
}
void main();
