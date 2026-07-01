import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import type { IntakeRecordResolutionResult } from "@/lib/intake/resolve/types";

export async function fetchIntakeRecordResolution(input: {
    household: IntakeHouseholdCandidate;
    source_kind?: string;
    source_id?: string;
    location_id?: string | null;
}): Promise<IntakeRecordResolutionResult | null> {
    const res = await fetch("/api/admin/intake/record-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            household: input.household,
            source_kind: input.source_kind ?? "create_lead",
            source_id: input.source_id,
            location_id: input.location_id,
        }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: IntakeRecordResolutionResult };
    return json.result ?? null;
}
