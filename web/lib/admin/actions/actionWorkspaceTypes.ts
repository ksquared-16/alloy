/** Canonical operator action flow: Gather → Review → Execute → Success/Continue */
export type ActionWorkspaceStep = "gather" | "review" | "execute" | "success";

/** BOS-first gather sub-flow inside the Gather step. */
export type ActionWorkspaceGatherPhase = "paste" | "bos-results" | "details";

export const ACTION_WORKSPACE_STEPS: ReadonlyArray<{
    key: ActionWorkspaceStep;
    label: string;
}> = [
    { key: "gather", label: "Gather" },
    { key: "review", label: "Review" },
    { key: "execute", label: "Execute" },
    { key: "success", label: "Continue" },
] as const;

export type ActionWorkspaceBosSuggestion = {
    id: string;
    payload_key: string;
    field_label: string;
    suggested_value: string;
    confidence: "high" | "medium" | "low";
    selected: boolean;
};

export type ActionWorkspaceGatherField = {
    payload_key: string;
    field_label: string;
    section: string;
    section_label: string;
    tier: "required" | "optional";
    value_kind: "text" | "email" | "phone" | "date" | "select";
    option_set_key?: string | null;
    placement_select?: "site" | "site_program" | "site_room" | null;
    multiline?: boolean;
};
