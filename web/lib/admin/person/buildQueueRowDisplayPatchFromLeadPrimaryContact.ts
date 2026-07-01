import { formatPhoneUS } from "@/lib/adminFormatters";
import type { OpportunityQueueRowDisplayPatch } from "@/lib/admin/opportunityQueueRowDisplayPatch";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** Display-only queue row patch after lead household primary contact reassignment. */
export function buildQueueRowDisplayPatchFromLeadPrimaryContact(
    record: Record<string, unknown>
): OpportunityQueueRowDisplayPatch {
    const name = trimOrNull(record["person.primary_contact_name"] ?? record._primary_contact_name);
    const phoneRaw = trimOrNull(record["person.primary_phone"] ?? record._primary_contact_phone);
    const email = trimOrNull(record["person.primary_email"] ?? record._primary_contact_email);

    const out: OpportunityQueueRowDisplayPatch = {};
    if (name) out.primary_contact_line = name;
    if (phoneRaw) out.primary_phone = formatPhoneUS(phoneRaw) || phoneRaw;
    if (email) out.primary_email = email;
    return out;
}
