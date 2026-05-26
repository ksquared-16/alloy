/**
 * Packet orchestration presentation helpers (OW-4).
 */

export type PacketOrchestrationListRow = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    is_active: boolean;
    updated_at: string | null;
    step_count: number;
    session_count: number;
    all_steps_published: boolean;
};

export type PacketStepDisplayRow = {
    sequence_index: number;
    form_name: string;
    step_label: string | null;
    step_has_published: boolean;
    form_definition_id: string;
};

export function packetOrchestrationStatusLabel(row: Pick<PacketOrchestrationListRow, "is_active" | "step_count" | "all_steps_published">): string {
    if (!row.is_active) return "Inactive";
    if (row.step_count === 0) return "Needs steps";
    if (!row.all_steps_published) return "Publish forms";
    return "Ready to launch";
}

export function packetOrchestrationStatusTone(
    row: Pick<PacketOrchestrationListRow, "is_active" | "step_count" | "all_steps_published">
): "success" | "warning" | "info" | "neutral" {
    if (!row.is_active) return "neutral";
    if (row.step_count === 0 || !row.all_steps_published) return "warning";
    return "success";
}

export function packetStepReadinessLabel(stepHasPublished: boolean): string {
    return stepHasPublished ? "Published" : "Needs publish";
}

function joinedFormDisplayName(
    raw: { name?: string } | { name?: string }[] | null | undefined
): string {
    const row =
        raw == null ? null
        : Array.isArray(raw) ? (raw[0] ?? null)
        : raw;
    return row?.name?.trim() || "Form";
}

export function buildPacketStepDisplayRows(
    items: {
        sequence_index: number;
        form_definition_id: string;
        metadata?: Record<string, unknown>;
        step_has_published_version?: boolean;
        form_definitions?: { name?: string } | { name?: string }[] | null;
    }[]
): PacketStepDisplayRow[] {
    return items.map((item) => {
        const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
        const stepLabel = typeof meta.step_label === "string" && meta.step_label.trim() ? meta.step_label.trim() : null;
        return {
            sequence_index: item.sequence_index,
            form_name: joinedFormDisplayName(item.form_definitions),
            step_label: stepLabel,
            step_has_published: item.step_has_published_version === true,
            form_definition_id: item.form_definition_id,
        };
    });
}

export function countSessionsByPacketDefinition(
    sessions: { packet_definition_id?: string | null }[]
): Record<string, number> {
    const map: Record<string, number> = {};
    for (const s of sessions) {
        const id = s.packet_definition_id;
        if (!id) continue;
        map[id] = (map[id] ?? 0) + 1;
    }
    return map;
}
