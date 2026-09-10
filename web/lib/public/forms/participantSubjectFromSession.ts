import type { PacketSessionRow } from "@/lib/forms/packets/formPacketService";

/**
 * The child a packet session was launched for, from its own CRM snapshot.
 *
 * A journey names its subject on the process instance. A packet launched at a family names the same
 * child here, seeded at mint time from `launch_from_entity`. Reading it is what lets a
 * packet-anchored participant receive canonical prefill and be addressed by their child's name.
 */
export function participantSubjectFromSession(session: PacketSessionRow | null | undefined): string | null {
    const snap = (session as { crm_snapshot?: unknown } | null | undefined)?.crm_snapshot;
    if (!snap || typeof snap !== "object") return null;
    const id = String((snap as { customer_member_id?: unknown }).customer_member_id ?? "").trim();
    return id || null;
}
