/**
 * Shared identity surface composition types.
 *
 * Evolves `NestedSurfaceGroupConfig` without a parallel persistence format.
 * Identity sections map 1:1 to nested surface evidence groups; field placements
 * extend per-field layout/policy metadata already stored on the group.
 */

import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type {
    IdentityFieldLabelMode,
    IdentityFieldPlacement,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";

export type {
    IdentityFieldLabelMode,
    IdentityFieldPlacement,
    IdentityFieldTier,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";

export type IdentitySectionSource =
    | { type: "record" }
    | { type: "relationship_role"; roleKeys: string[] }
    | { type: "related_entity"; entityType: string };

export type IdentitySectionConfig = {
    key: string;
    label: string;
    source: IdentitySectionSource;
    allowMultiple?: boolean;
    avatar?: {
        visible: boolean;
        source?: "photo_or_initials" | "initials";
        photoFieldRef?: string;
    };
    badge?: {
        source?: "relationship_label" | "field";
        fieldRef?: string;
        fallbackLabel?: string;
    };
    summaryFields: IdentityFieldPlacement[];
    expandedFields: IdentityFieldPlacement[];
    emptyState?: {
        label: string;
        actionRef?: string;
    };
};

export type IdentitySurfaceConfig = {
    surfaceKey: string;
    sections: IdentitySectionConfig[];
};

export type IdentityFieldCellVM = {
    fieldRef: string;
    label: string;
    value: string | null;
    icon?: string;
    labelMode: IdentityFieldLabelMode;
    policy: SurfaceFieldVisibility;
    editable: boolean;
    hideWhenEmpty: boolean;
    width: NestedSurfaceFieldLayoutWidth;
};

export type IdentityFieldRowVM = {
    row: number;
    cells: IdentityFieldCellVM[];
};

export type IdentityRecordVM = {
    id: string;
    title: string;
    avatar?: {
        imageUrl?: string | null;
        initials: string;
        visible: boolean;
    };
    badge?: string | null;
    summaryRows: IdentityFieldRowVM[];
    expandedRows: IdentityFieldRowVM[];
    canExpand: boolean;
};

export type IdentitySectionVM = {
    key: string;
    label: string;
    items: IdentityRecordVM[];
    emptyState?: {
        label: string;
    };
};

export type IdentityCardVM = {
    surfaceKey: string;
    sections: IdentitySectionVM[];
};
