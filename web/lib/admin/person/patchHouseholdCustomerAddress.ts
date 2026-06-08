export type HouseholdCustomerAddressPatch = {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    label?: string | null;
};

export async function patchHouseholdCustomerLocation(
    locationId: string,
    patch: HouseholdCustomerAddressPatch
): Promise<Record<string, unknown>> {
    const id = locationId.trim();
    if (!id) throw new Error("Location id required");

    const res = await fetch(`/api/admin/locations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
        throw new Error(String(json.error ?? "Save failed"));
    }
    return json;
}

export async function createHouseholdCustomerAddress(
    customerId: string,
    patch: HouseholdCustomerAddressPatch
): Promise<{ id: string } & Record<string, unknown>> {
    const cid = customerId.trim();
    if (!cid) throw new Error("Customer id required");

    const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customer_id: cid,
            location_type: "address",
            is_primary: true,
            ...patch,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
        throw new Error(String(json.error ?? "Create failed"));
    }
    const id = String(json.id ?? "").trim();
    if (!id) throw new Error("Create failed: missing location id");
    return { ...json, id };
}
