/**
 * Backfill person_id / customer_member_id on metadata inquiry_children using OCM-linked members.
 */

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function normalizeChildNameKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export type QueueRowOcmChildPersonLine = {
    personId: string | null;
    customerMemberId: string | null;
    displayName: string | null;
    dob: string | null;
};

export function displayNameFromOcmChildLine(line: QueueRowOcmChildPersonLine): string | null {
    return trimId(line.displayName);
}

/** Build name-keyed lookup from OCM child person lines (first wins per normalized name). */
export function indexOcmChildPersonLinesByName(
    lines: QueueRowOcmChildPersonLine[],
): Map<string, QueueRowOcmChildPersonLine> {
    const byName = new Map<string, QueueRowOcmChildPersonLine>();
    for (const line of lines) {
        const name = displayNameFromOcmChildLine(line);
        if (!name) continue;
        const key = normalizeChildNameKey(name);
        if (!key || byName.has(key)) continue;
        byName.set(key, line);
    }
    return byName;
}

/** Merge OCM person/member ids onto inquiry child blocks when metadata rows lack person_id. */
export function hydrateQueueRowInquiryChildrenPersonIds(
    inquiryChildren: unknown[],
    ocmChildLines: QueueRowOcmChildPersonLine[],
): unknown[] {
    if (!Array.isArray(inquiryChildren) || inquiryChildren.length === 0) return inquiryChildren;
    if (!ocmChildLines.length) return inquiryChildren;

    const byName = indexOcmChildPersonLinesByName(ocmChildLines);

    return inquiryChildren.map((raw, index) => {
        if (!raw || typeof raw !== "object") return raw;
        const row = raw as Record<string, unknown>;
        if (trimId(row.person_id)) return raw;

        const displayName = trimId(row.display_name)
            ?? [trimId(row.first_name), trimId(row.last_name)].filter(Boolean).join(" ");
        const ocmMatch = displayName ? byName.get(normalizeChildNameKey(displayName)) : null;
        const indexMatch = index >= 0 && index < ocmChildLines.length ? ocmChildLines[index] : null;
        const hit = ocmMatch ?? (indexMatch?.personId || indexMatch?.customerMemberId ? indexMatch : null);
        if (!hit) return raw;

        const personId = trimId(row.person_id) ?? trimId(hit.personId);
        const memberId = trimId(row.customer_member_id) ?? trimId(hit.customerMemberId);
        const dob = trimId(row.dob) ?? trimId(row.date_of_birth) ?? trimId(hit.dob);
        if (!personId && !memberId && !dob) return raw;

        return {
            ...row,
            ...(personId ? { person_id: personId } : {}),
            ...(memberId ? { customer_member_id: memberId } : {}),
            ...(dob ? { dob } : {}),
        };
    });
}

/** Parse OCM batch rows with nested customer_members into person lines per opportunity. */
export function parseOcmChildPersonLinesFromBatchRow(raw: Record<string, unknown>): QueueRowOcmChildPersonLine | null {
    const memberId = trimId(raw.customer_member_id);
    const nested = raw.customer_members;
    const member =
        nested && typeof nested === "object" && !Array.isArray(nested)
            ? (nested as Record<string, unknown>)
            : Array.isArray(nested) && nested[0] && typeof nested[0] === "object"
              ? (nested[0] as Record<string, unknown>)
              : null;
    if (!memberId && !member) return null;

    const personId = trimId(member?.person_id);
    const first = trimId(member?.first_name);
    const last = trimId(member?.last_name);
    const composedName = [first, last].filter(Boolean).join(" ");
    const displayName = trimId(member?.display_name) ?? (composedName || null);
    const dobRaw = member?.dob ?? member?.date_of_birth;
    const dob = dobRaw != null ? String(dobRaw).trim().slice(0, 10) : null;

    if (!personId && !memberId && !displayName) return null;

    return {
        personId,
        customerMemberId: memberId ?? trimId(member?.id),
        displayName,
        dob,
    };
}
