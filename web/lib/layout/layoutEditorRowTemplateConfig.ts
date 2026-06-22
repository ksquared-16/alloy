/**
 * Layout editor — row template configuration (child row actions, layout, display).
 */

export const LAYOUT_EDITOR_ROW_TEMPLATE_METADATA_KEY = "layoutEditorRowTemplate" as const;

export const LAYOUT_EDITOR_ROW_LAYOUT_MODES = ["compact", "standard", "detailed"] as const;
export type LayoutEditorRowLayoutMode = (typeof LAYOUT_EDITOR_ROW_LAYOUT_MODES)[number];

export const LAYOUT_EDITOR_ROW_ACTIONS = [
    "open_child_drawer",
    "edit_enrollment",
    "open_schedule",
] as const;
export type LayoutEditorRowAction = (typeof LAYOUT_EDITOR_ROW_ACTIONS)[number];

export type LayoutEditorRowTemplateConfig = {
    layoutMode?: LayoutEditorRowLayoutMode;
    actions?: LayoutEditorRowAction[];
    display?: {
        avatar?: boolean;
        statusPill?: boolean;
        secondaryMetadata?: boolean;
    };
};

export const LAYOUT_EDITOR_ROW_LAYOUT_MODE_LABELS: Record<LayoutEditorRowLayoutMode, string> = {
    compact: "Compact",
    standard: "Standard",
    detailed: "Detailed",
};

export const LAYOUT_EDITOR_ROW_ACTION_LABELS: Record<LayoutEditorRowAction, string> = {
    open_child_drawer: "Open child drawer",
    edit_enrollment: "Show row action: Edit enrollment",
    open_schedule: "Open schedule (coming later)",
};

export const DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG: LayoutEditorRowTemplateConfig = {
    layoutMode: "standard",
    actions: ["open_child_drawer"],
    display: {
        avatar: true,
        statusPill: true,
        secondaryMetadata: true,
    },
};

export function readLayoutEditorRowTemplateConfig(
    metadata: Record<string, unknown> | undefined,
): LayoutEditorRowTemplateConfig {
    const raw = metadata?.[LAYOUT_EDITOR_ROW_TEMPLATE_METADATA_KEY];
    if (!raw || typeof raw !== "object") return { ...DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG };
    const bag = raw as Record<string, unknown>;
    const out: LayoutEditorRowTemplateConfig = { ...DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG };
    if (typeof bag.layoutMode === "string" && isRowLayoutMode(bag.layoutMode)) {
        out.layoutMode = bag.layoutMode;
    }
    if (Array.isArray(bag.actions)) {
        out.actions = bag.actions.filter((a): a is LayoutEditorRowAction => isRowAction(a));
    }
    if (bag.display && typeof bag.display === "object") {
        const display = bag.display as Record<string, unknown>;
        out.display = {
            avatar: display.avatar !== false,
            statusPill: display.statusPill !== false,
            secondaryMetadata: display.secondaryMetadata !== false,
        };
    }
    return out;
}

export function writeLayoutEditorRowTemplateConfig(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorRowTemplateConfig,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    next[LAYOUT_EDITOR_ROW_TEMPLATE_METADATA_KEY] = {
        layoutMode: patch.layoutMode ?? "standard",
        actions: patch.actions ?? ["open_child_drawer"],
        display: patch.display ?? DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG.display,
    };
    return next;
}

function isRowLayoutMode(v: string): v is LayoutEditorRowLayoutMode {
    return (LAYOUT_EDITOR_ROW_LAYOUT_MODES as readonly string[]).includes(v);
}

function isRowAction(v: unknown): v is LayoutEditorRowAction {
    return typeof v === "string" && (LAYOUT_EDITOR_ROW_ACTIONS as readonly string[]).includes(v);
}

export function validateLayoutEditorRowTemplateConfig(config: LayoutEditorRowTemplateConfig): string[] {
    const errors: string[] = [];
    if (config.layoutMode && !isRowLayoutMode(config.layoutMode)) {
        errors.push(`invalid row layoutMode "${config.layoutMode}"`);
    }
    for (const action of config.actions ?? []) {
        if (!isRowAction(action)) errors.push(`invalid row action "${String(action)}"`);
    }
    return errors;
}
