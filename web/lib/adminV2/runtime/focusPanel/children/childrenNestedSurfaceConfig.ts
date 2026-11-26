/**
 * Narrow adapter: PUBLISHED Children Surface config → runtime children detail fields.
 *
 * Delegates persistence read + flatten to the shared nested-surface reader.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
    enabledEvidenceSections,
    fieldLayoutWidthForNestedGroup,
    fieldPresentationLabel,
    groupDefsFor,
    nestedGroupLabel,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { fieldIsSaveable, fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { identityLayerFieldKeysFromGroup } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import {
    isChildFocusFieldSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import { resolvePublishedIdentitySurfaceConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/identity/resolvePublishedIdentitySurfaceConfig";
import { nestedSurfaceFieldKeysFromConfig } from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";

/** Configurable groups that render on the operational child Focus surface (not archive). */
export const CHILDREN_FOCUS_GROUP_KEYS = ["identity", "placement", "readiness"] as const;

export type ChildrenFocusFieldRow = {
    fieldKey: string;
    label: string;
    groupKey: (typeof CHILDREN_FOCUS_GROUP_KEYS)[number];
    displayed: boolean;
    editable: boolean;
    layoutWidth: NestedSurfaceFieldLayoutWidth;
};

export type ChildrenEvidenceSectionView = {
    key: string;
    label: string;
    fieldKeys: string[];
};

/**
 * Read + reconcile the PUBLISHED Children Surface config from a Focus Panel summary doc.
 *
 * Returns null when the tenant has authored nothing. Authoring surfaces need that distinction —
 * "nothing published" is a real state the Surface Builder must be able to see. Card RUNTIMES should
 * read {@link effectiveChildrenNestedConfig} instead.
 */
export function readChildrenNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return resolvePublishedIdentitySurfaceConfigFromDoc(CHILDREN_SURFACE_ID, doc);
}

/**
 * THE EFFECTIVE Children Surface config: published configuration, else the platform default.
 *
 * ── WHY THIS EXISTS ──
 *
 * The Children card is VISIBLE in the code-owned default composition
 * (`FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION`), so every tenant gets it whether or not they have ever
 * opened the Surface Builder. But `FOCUS_PANEL_SUMMARY_DEFAULT_DOC` carries no `metadata`
 * `nestedSurfaces`, nothing in the seed or any migration authors one, and
 * `reconcileIdentityNestedConfigFromDocMetadata` returns null when nothing is authored. The card
 * then gated its focused-child body on a config that could not exist:
 *
 *     focusedIdentityRecord = (focused && childrenSurfaceConfig) ? … : null
 *
 * The result on any tenant that had not authored a surface — which is every newly seeded org — was a
 * Children card that composes, elevates, and SELECTS the child (disclosure reaches `details`, the
 * footer offers "← All children"), and then silently re-renders the roster instead of the child.
 * Clicking a child did nothing observable, from Search or by hand.
 *
 * Default composition without default drill-in is not a coherent baseline: the platform must not ship
 * a card whose normal interaction is impossible until an operator configures something. Configuration
 * OVERRIDES the default here; it is not a precondition for the card working at all — the same
 * contract `nestedSurfaceConfigReader` already documents ("caller treats empty as no override").
 *
 * The published/absent distinction is preserved above for the authoring surfaces that need it.
 */
export function effectiveChildrenNestedConfig(doc: LayoutDoc | null): NestedSurfaceConfig {
    return readChildrenNestedConfigFromDoc(doc) ?? defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
}

function catalogLabelForGroupField(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): string {
    return fieldPresentationLabel(
        config,
        groupKey,
        fieldKey,
        resolveCanonicalIdentityFieldLabel(fieldKey),
    );
}

/** Focus-tier field rows — identity + placement + readiness on the child operational surface. */
export function childrenFocusRowsFromNestedConfig(config: NestedSurfaceConfig | null): ChildrenFocusFieldRow[] {
    if (!config) return [];
    const rows: ChildrenFocusFieldRow[] = [];
    const seen = new Set<string>();

    for (const groupKey of CHILDREN_FOCUS_GROUP_KEYS) {
        const group = config.groups.find((g) => g.key === groupKey);
        if (!group) continue;
        const layers = identityLayerFieldKeysFromGroup(group);
        const fieldKeys = [...layers.summary, ...layers.contextFacts, ...layers.details];
        for (const fieldKey of fieldKeys) {
            if (seen.has(fieldKey)) continue;
            if (
                !fieldShouldRender(
                    resolveIdentityFieldPolicy({
                        config,
                        groupKey,
                        fieldRef: fieldKey,
                        editGroupKey: "child_edit",
                    }),
                )
            ) {
                continue;
            }
            seen.add(fieldKey);
            const visibility = resolveIdentityFieldPolicy({
                config,
                groupKey,
                fieldRef: fieldKey,
                editGroupKey: "child_edit",
            });
            const displayed = fieldShouldRender(visibility);
            const editable =
                displayed
                && isChildFocusFieldSaveSupported(fieldKey)
                && fieldIsSaveable(visibility);
            rows.push({
                fieldKey,
                label: catalogLabelForGroupField(config, groupKey, fieldKey),
                groupKey,
                displayed,
                editable,
                layoutWidth: fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey),
            });
        }
    }

    return rows.filter((row) => row.displayed);
}

/** Evidence-tier sections — archive groups behind View all evidence. */
export function childrenEvidenceSectionsFromNestedConfig(
    config: NestedSurfaceConfig | null,
): ChildrenEvidenceSectionView[] {
    if (!config) return [];
    return enabledEvidenceSections(config).map((group) => ({
        key: group.key,
        label:
            nestedGroupLabel(config, group.key)
            ?? groupDefsFor(CHILDREN_SURFACE_ID).find((g) => g.key === group.key)?.label
            ?? group.key,
        fieldKeys: group.selectedFieldKeys.filter((fieldKey) =>
            fieldShouldRender(
                resolveIdentityFieldPolicy({
                    config,
                    groupKey: group.key,
                    fieldRef: fieldKey,
                    editGroupKey: "child_edit",
                }),
            ),
        ),
    }));
}

/** Flatten placement + identity groups for child detail line ordering. */
export function childrenDetailFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    if (!config) return [];
    return [
        ...selectedFieldKeys(config, "identity"),
        ...selectedFieldKeys(config, "placement"),
    ];
}

/** Keys always shown on the primary roster row — never in collapsed details. */
const ROSTER_PRIMARY_ROW_FIELD_KEYS = new Set(["child.name", "child.status"]);

/** Roster collapsed-detail field order (omits hidden + primary-row keys). */
export function childrenRosterCollapsedFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    if (!config) return [];
    return selectedFieldKeys(config, "roster").filter(
        (fieldKey) =>
            !ROSTER_PRIMARY_ROW_FIELD_KEYS.has(fieldKey)
            && fieldShouldRender(
                resolveIdentityFieldPolicy({
                    config,
                    groupKey: "roster",
                    fieldRef: fieldKey,
                    editGroupKey: "child_edit",
                }),
            ),
    );
}

/** Roster row field order from the published config (omits hidden fields). @deprecated Use collapsed keys for detail region. */
export function childrenRosterFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return childrenRosterCollapsedFieldKeysFromNestedConfig(config);
}

/** All configured field keys (legacy flatten). */
export function childrenAllFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return nestedSurfaceFieldKeysFromConfig(config);
}

/** Emergency Contacts optional section on focused child drill-in. */
export function childrenEmergencyContactsSectionFromConfig(
    config: NestedSurfaceConfig | null,
): ChildrenEvidenceSectionView | null {
    if (!config) return null;
    const sections = childrenEvidenceSectionsFromNestedConfig(config);
    return sections.find((s) => s.key === "emergency_contacts") ?? null;
}
