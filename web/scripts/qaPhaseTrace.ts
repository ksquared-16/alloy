/** READ-ONLY: what phase and turn does each live QA session resolve to right now? */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { resolveParticipantCanonicalContext } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
    const { data: pis } = await supabase.from("process_instances").select("id, subject_id").eq("org_id", ORG).eq("process_key", "enrollment").order("created_at", { ascending: false }).limit(2);
    for (const pi of (pis ?? []) as { id: string; subject_id: string }[]) {
        const canonical = await resolveParticipantCanonicalContext(supabase, { orgId: ORG, processInstanceId: pi.id });
        const res = await resolveParticipantEnrollmentObjective(supabase, { orgId: ORG, processInstanceId: pi.id, canonicalValues: canonical.values });
        if (!res.ok) { console.log(pi.id, "REFUSED", res.refusal.code); continue; }
        const wire = participantObjectiveWireModel(res.value, { subjectDisplayName: canonical.subjectDisplayName });
        console.log(`\n${canonical.subjectDisplayName} (${pi.id.slice(0, 8)})`);
        console.log("  phase:", wire.phase, "| turn:", wire.next_turn.kind, "| things_remaining:", wire.things_remaining);
        console.log("  label:", wire.next_turn.label, "| input_type:", wire.next_turn.input_type, "| optional:", wire.next_turn.optional);
        console.log("  known_requiring_confirmation:", res.value.known_requiring_confirmation.length, "| missing:", res.value.missing.length, "| artifact_specific:", res.value.artifact_specific.length);
        for (const n of res.value.artifact_specific) {
            console.log(`    artifact need: ${n.occurrences[0]?.label} type=${n.occurrences[0]?.field_type} required=${n.occurrences[0]?.required}`);
        }
    }
}
void main();
