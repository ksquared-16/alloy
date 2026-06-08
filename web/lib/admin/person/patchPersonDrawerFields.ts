/** PATCH a single person field group from the child drawer summary. */
export async function patchPersonDrawerFields(
    personId: string,
    body: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const id = personId.trim();
    if (!id) throw new Error("Person id required");

    const res = await fetch(`/api/admin/persons/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
        throw new Error(String(json.error ?? "Save failed"));
    }
    return json;
}

export function personDrawerDobIsoFromRecord(record: Record<string, unknown>): string {
    const raw = record.date_of_birth ?? record.dob;
    if (raw == null || String(raw).trim() === "") return "";
    return String(raw).trim().slice(0, 10);
}
