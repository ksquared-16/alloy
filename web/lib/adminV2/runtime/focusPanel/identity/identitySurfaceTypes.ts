/**
 * Shared identity surface composition types.
 *
 * Runtime disclosure: Summary → Context → Details → Evidence
 * Configuration: Summary Fields → Context Facts → Detail Fields → Evidence Collections
 *
 * Context runtime rows are projected from Summary + Context Facts — not configured twice.
 */

import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type {
    IdentityFieldLabelMode,
    IdentityFieldPlacement,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import type {
    IdentityDisclosureLayer,
    IdentityEvidenceCollectionConfig,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

export type {
    IdentityFieldLabelMode,
    IdentityFieldPlacement,
    IdentityFieldTier,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";

export type {
    IdentityDisclosureLayer,
    IdentityEvidenceCollectionConfig,
    IdentityConfigurationPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

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
    summary: {
        fields: IdentityFieldPlacement[];
    };
    context: {
        /** Incremental facts only — Summary inherits automatically at runtime. */
        facts: IdentityFieldPlacement[];
    };
    details: {
        fields: IdentityFieldPlacement[];
    };
    evidence: {
        collections: IdentityEvidenceCollectionConfig[];
    };
    /** @deprecated Use `summary.fields`. */
    summaryFields: IdentityFieldPlacement[];
    /** @deprecated Use `context.facts`. */
    contextFields: IdentityFieldPlacement[];
    /** @deprecated Use `details.fields`. */
    detailsFields: IdentityFieldPlacement[];
    /** @deprecated Use `details.fields`. */
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

/** Inline edit control resolved from the field's published type (not hardcoded text). */
export type IdentityFieldEditControlVM =
    | { kind: "text"; inputType: "text" | "email" | "tel" }
    | { kind: "date" }
    | { kind: "select"; optionSetKey: string }
    | { kind: "placement_select"; placement: "program"; siteLocationId?: string | null; programCategoryId?: string | null };

export type IdentityFieldCellVM = {
    fieldRef: string;
    label: string;
    value: string | null;
    icon?: string;
    labelMode: IdentityFieldLabelMode;
    policy: SurfaceFieldVisibility;
    editable: boolean;
    linked?: boolean;
    linkLabel?: string | null;
    linkDestination?: FocusPanelCardKey | null;
    linkTarget?: import("@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract").IdentityFieldLinkTarget | null;
    /** Operator explanation when value is derived (e.g. Program from primary classroom). */
    derivedSourceLabel?: string | null;
    hideWhenEmpty: boolean;
    width: NestedSurfaceFieldLayoutWidth;
    /** Control type for inline edit — select/date/text from field definition. */
    editControl?: IdentityFieldEditControlVM;
};

export type IdentityFieldRowVM = {
    row: number;
    cells: IdentityFieldCellVM[];
};

/** Runtime disclosure depth for one identity record. */
export type IdentityDisclosureDepth = "summary" | "context" | "details" | "evidence";

export type IdentityEvidenceCollectionVM = {
    key: string;
    label: string;
    enabled: boolean;
    itemCount?: number;
};

export type IdentityRecordVM = {
    id: string;
    title: string;
    avatar?: {
        imageUrl?: string | null;
        initials: string;
        visible: boolean;
        /** Semantic identity role for avatar tokens (not gender/status). */
        role?: "primary_contact" | "other_parent_guardian" | "contact" | "child";
    };
    badge?: string | null;
    /** Summary Fields — recognition. */
    summaryRows: IdentityFieldRowVM[];
    /** Context Facts — incremental configuration only. */
    contextFactRows: IdentityFieldRowVM[];
    /** Context runtime projection = Summary + Context Facts (shared VM owns merge). */
    contextRows: IdentityFieldRowVM[];
    /** Detail Fields — inspect one identity after selection. */
    detailRows: IdentityFieldRowVM[];
    /** @deprecated Use `detailRows`. */
    detailsRows: IdentityFieldRowVM[];
    /** @deprecated Use `detailRows`. */
    expandedRows: IdentityFieldRowVM[];
    canShowDetails: boolean;
    /** @deprecated Use `canShowDetails`. */
    canExpand: boolean;
    evidenceCollections?: IdentityEvidenceCollectionVM[];
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

export type IdentityDisclosureVM = {
    surfaceKey: string;
    depth: IdentityDisclosureDepth;
    sections: IdentitySectionVM[];
    focusedRecordId?: string | null;
};
