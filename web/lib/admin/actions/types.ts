export type ActionSurface =
    | "record_header"
    | "record_section"
    | "queue_row"
    | "work_unit"
    | "department"
    | "workspace"
    | "right_rail";

export type ActionSlot = "primary" | "secondary" | "overflow" | "right_rail" | "row_inline" | "header";

export type ResolvedActionForClient = {
    key: string;
    label: string;
    description: string | null;
    action_type: string;
    icon: string | null;
    style: string | null;
    display_style: string;
    payload: Record<string, unknown>;
    workflow_id: string | null;
};

export type ResolvedActionsBySlot = {
    primary: ResolvedActionForClient[];
    secondary: ResolvedActionForClient[];
    overflow: ResolvedActionForClient[];
    right_rail: ResolvedActionForClient[];
    row_inline: ResolvedActionForClient[];
    header: ResolvedActionForClient[];
};

export function emptyResolvedActionsBySlot(): ResolvedActionsBySlot {
    return {
        primary: [],
        secondary: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
        header: [],
    };
}
