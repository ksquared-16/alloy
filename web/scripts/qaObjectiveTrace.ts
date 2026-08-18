/** READ-ONLY: what does the live QA session's objective actually resolve to, and why? */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalValues } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
    const { data: kids } = await supabase.from("customer_members").select("id, display_name, dob, first_name, last_name, metadata").eq("org_id", ORG).eq("relationship", "child").order("created_at", { ascending: false }).limit(2);
    console.log("=== QA children, canonical fields ===");
    for (const k of kids as Record<string, unknown>[]) console.log(" ", JSON.stringify(k));

    const { data: pis } = await supabase.from("process_instances").select("id, subject_id").eq("org_id", ORG).eq("process_key", "enrollment").order("created_at", { ascending: false }).limit(2);
    for (const pi of (pis ?? []) as { id: string; subject_id: string }[]) {
        const canonicalValues = await resolveParticipantCanonicalValues(supabase, { orgId: ORG, processInstanceId: pi.id });
        console.log("  canonical keys:", Object.keys(canonicalValues).join(", ") || "(none)");
        const res = await resolveParticipantEnrollmentObjective(supabase, { orgId: ORG, processInstanceId: pi.id, canonicalValues });
        console.log(`\n=== objective for ${pi.id} (child ${pi.subject_id}) ===`);
        if (!res.ok) { console.log("  REFUSED:", JSON.stringify(res.refusal)); continue; }
        const v = res.value;
        console.log("  stage:", v.stage_key, "| session:", v.session_id);
        console.log("  progress:", JSON.stringify(v.progress.requirements?.map((r) => ({ kind: r.kind, status: r.status }))));
        console.log("  needs:", v.needs.total_needs, "requiring action:", v.needs.needs_requiring_action);
        for (const n of v.needs.needs) {
            console.log(`    - ${n.identity.canonical_key ?? n.identity.key} state=${n.state} value=${JSON.stringify(n.current_value)} occurrences=${n.occurrence_count} labels=${JSON.stringify(n.occurrences.map((o) => o.label))}`);
        }
        console.log("  next_turn:", JSON.stringify(v.next_turn, null, 2).slice(0, 700));
    }
}
void main();
