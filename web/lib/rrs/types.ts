export type RecordSurface = "drawer" | "overview" | "full";

export type FieldValueSource = "system" | "custom" | "computed" | "relationship";

/** One presentable field with explicit edit ownership (RRS doctrine). */
export type ResolvedFieldDescriptor = {
    key: string;
    label: string;
    value: unknown;
    source: FieldValueSource;
    editable: boolean;
    /** e.g. jobs, field_values — required when editable */
    editable_entity: string | null;
    /** Column name or field_definition_id for custom */
    editable_key: string | null;
    provenance?: string;
};

export type ResolvedRelationshipGroup = {
    group_key: string;
    label: string;
    items: Record<string, unknown>[];
};

export type ResolvedActionDescriptor = {
    key: string;
    label: string | null;
    surfaces_allowed: ("queue" | "drawer" | "full_record")[];
    requires_capability: string | null;
};

export type ResolvedSignalDescriptor = {
    key: string;
    severity: "info" | "warning" | "critical";
    message: string | null;
};

export type RecordOverviewLayoutRow = {
    id: string;
    org_id: string;
    entity_type: string;
    surface: string;
    template_key: string;
    config: unknown;
    is_active: boolean;
};

export type ResolvedRecordPayload = {
    meta: {
        rrs_version: string;
        entity_type: string;
        entity_id: string;
        surface: RecordSurface;
    };
    fields: ResolvedFieldDescriptor[];
    relationship_groups: ResolvedRelationshipGroup[];
    financial: Record<string, unknown> | null;
    overview_layout: RecordOverviewLayoutRow | null;
    actions: ResolvedActionDescriptor[];
    signals: ResolvedSignalDescriptor[];
};

export type ResolveRecordInput = {
    org_id: string;
    entity_type: string;
    entity_id: string;
    surface: RecordSurface;
};

export class UnsupportedEntityTypeError extends Error {
    readonly entityType: string;

    constructor(entityType: string) {
        super(`RRS: unsupported entity_type "${entityType}"`);
        this.name = "UnsupportedEntityTypeError";
        this.entityType = entityType;
    }
}
