/**
 * Filter inquiry children to those relevant for a queue lane (disposition membership).
 * Active row subject is always listed first when it matches the lane.
 */

export type QueueRelevantInquiryChild = {
    subject_id: string;
    display_name: string;
    outcome_status_key: string | null;
    program_line?: string | null;
    person_id?: string | null;
    customer_member_id?: string | null;
};

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

function readInquiryChildrenFromRow(row: Record<string, unknown>): unknown[] {
    const direct = row._inquiry_children;
    if (Array.isArray(direct) && direct.length) {
        return direct.filter((x) => x != null && typeof x === "object");
    }
    const md = row.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const ic = (md as { inquiry_children?: unknown }).inquiry_children;
        if (Array.isArray(ic)) {
            return ic.filter((x) => x != null && typeof x === "object");
        }
    }
    return [];
}

function normalizeDispositionKeys(keys: readonly string[] | null | undefined): Set<string> {
    const out = new Set<string>();
    for (const key of keys ?? []) {
        const t = trimOrNull(key);
        if (t) out.add(t);
    }
    return out;
}

function childMatchesLane(statusKey: string | null, dispositionKeys: Set<string>): boolean {
    if (!dispositionKeys.size) return true;
    const sk = trimOrNull(statusKey);
    if (!sk) return false;
    return dispositionKeys.has(sk);
}

function mapInquiryChildRaw(raw: Record<string, unknown>): QueueRelevantInquiryChild | null {
    const subjectId =
        trimOrNull(raw.ocm_id) ?? trimOrNull(raw.id) ?? trimOrNull(raw.customer_member_id);
    if (!subjectId) return null;
    const displayName =
        trimOrNull(raw.display_name) ?? trimOrNull(raw.child_display_name) ?? "Child";
    const programParts = [
        trimOrNull(raw.desired_program_type),
        trimOrNull(raw.desired_schedule_type),
    ].filter(Boolean);
    return {
        subject_id: subjectId,
        display_name: displayName,
        outcome_status_key: trimOrNull(raw.outcome_status_key),
        program_line: programParts.length ? programParts.join(" · ") : null,
        person_id: trimOrNull(raw.person_id),
        customer_member_id: trimOrNull(raw.customer_member_id),
    };
}

/**
 * Returns inquiry children matching queue disposition keys, with active subject first.
 * When disposition keys are empty, returns only the active child (if known).
 */
export function filterQueueRelevantInquiryChildren(params: {
    row: Record<string, unknown>;
    activeSubjectId?: string | null;
    dispositionKeys?: readonly string[] | null;
}): QueueRelevantInquiryChild[] {
    const dispositionKeys = normalizeDispositionKeys(params.dispositionKeys);
    const activeId = trimOrNull(params.activeSubjectId);
    const inquiryChildren = readInquiryChildrenFromRow(params.row);

    const mapped: QueueRelevantInquiryChild[] = [];
    for (const raw of inquiryChildren) {
        const child = mapInquiryChildRaw(raw as Record<string, unknown>);
        if (!child) continue;
        const isActive = activeId != null && child.subject_id === activeId;
        if (isActive || childMatchesLane(child.outcome_status_key, dispositionKeys)) {
            mapped.push(child);
        }
    }

    if (!mapped.length && activeId) {
        const row = params.row;
        const activeDisplay = trimOrNull(row._child_display_name) ?? "Child";
        mapped.push({
            subject_id: activeId,
            display_name: activeDisplay,
            outcome_status_key:
                trimOrNull(row.child_lifecycle_status) ??
                trimOrNull(
                    (row._ocm_enrollment_track_row as { outcome_status_key?: unknown } | undefined)
                        ?.outcome_status_key
                ),
        });
    }

    if (!activeId || mapped.length <= 1) return mapped;

    const activeIdx = mapped.findIndex((c) => c.subject_id === activeId);
    if (activeIdx <= 0) return mapped;
    const active = mapped[activeIdx]!;
    const rest = mapped.filter((_, i) => i !== activeIdx);
    return [active, ...rest];
}

/** Build `_crm_compact_children` lines for a queue row from lane-relevant inquiry children. */
export function buildQueueRelevantCrmCompactChildren(params: {
    row: Record<string, unknown>;
    activeSubjectId?: string | null;
    activeDisplayName?: string | null;
    activeProgramLine?: string | null;
    dispositionKeys?: readonly string[] | null;
}): Array<{ primary: string; secondary: string | null; ocmId?: string | null; personId?: string | null }> {
    const relevant = filterQueueRelevantInquiryChildren({
        row: params.row,
        activeSubjectId: params.activeSubjectId,
        dispositionKeys: params.dispositionKeys,
    });

    if (relevant.length) {
        return relevant.map((c) => ({
            primary: c.display_name,
            secondary: c.program_line ?? params.activeProgramLine ?? null,
            ocmId: c.subject_id,
            personId: c.person_id ?? null,
        }));
    }

    const primary = trimOrNull(params.activeDisplayName) ?? trimOrNull(params.row._child_display_name);
    if (!primary) return [];
    return [
        {
            primary,
            secondary: params.activeProgramLine ?? null,
            ocmId: params.activeSubjectId ?? null,
        },
    ];
}
