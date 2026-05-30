import { dispatchHouseholdPrimaryContactChanged } from "@/lib/admin/person/dispatchHouseholdPrimaryContactChanged";

/** Set household primary contact (customer_persons) — immediate persist. */
export async function patchHouseholdPrimaryContact(
    customerId: string,
    personId: string
): Promise<Record<string, unknown>> {
    const cid = customerId.trim();
    const pid = personId.trim();
    if (!cid || !pid) throw new Error("Customer and person id required");

    const res = await fetch(`/api/admin/customers/${encodeURIComponent(cid)}/household-primary-contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: pid }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
        throw new Error(String(json.error ?? "Save failed"));
    }

    const opportunityIds = Array.isArray(json.opportunity_ids)
        ? (json.opportunity_ids as unknown[]).map((id) => String(id).trim()).filter(Boolean)
        : [];

    dispatchHouseholdPrimaryContactChanged({
        customerId: cid,
        primaryPersonId: pid,
        opportunityIds,
    });

    return json;
}
