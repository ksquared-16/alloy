/**
 * Household nested surface runtime — published config → household drill-in display.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { HouseholdEvidenceGroupKey } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    HOUSEHOLD_CONTACT_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    type NestedSurfaceGroupDisplayOptions,
    type NestedSurfaceFieldMode,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import {
    type NestedSurfaceConfig,
    type NestedSurfaceGroupConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    nestedSurfaceFieldKeysFromConfig,
    readNestedSurfaceConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";
import {
    readHouseholdNestedConfigFromDoc as readPublishedHouseholdNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";

export type HouseholdContactDisplay = {
    showPhone: boolean;
    showEmail: boolean;
};

export type HouseholdChildDisplay = {
    showDob: boolean;
    showAge: boolean;
};

export type HouseholdNestedDisplayView = {
    /** Groups explicitly hidden via config. */
    hiddenGroups: ReadonlySet<HouseholdEvidenceGroupKey>;
    contactDisplay: HouseholdContactDisplay;
    childDisplay: HouseholdChildDisplay;
    /** Contact edit surface — which fields operators can edit. */
    editableContactFields: ReadonlySet<string>;
    /** Contact edit surface — which fields operators see. */
    displayedContactFields: ReadonlySet<string>;
};

const DEFAULT_CONTACT_DISPLAY: HouseholdContactDisplay = { showPhone: true, showEmail: true };
const DEFAULT_CHILD_DISPLAY: HouseholdChildDisplay = { showDob: false, showAge: false };

const CONTACT_FIELD_KEYS = [
    "person.first_name",
    "person.last_name",
    "person.phone",
    "person.email",
    "person.date_of_birth",
    "person.address",
] as const;

function groupConfig(config: NestedSurfaceConfig | null, key: string): NestedSurfaceGroupConfig | null {
    return config?.groups.find((g) => g.key === key) ?? null;
}

function contactDisplayFromOptions(opts?: NestedSurfaceGroupDisplayOptions): HouseholdContactDisplay {
    return {
        showPhone: opts?.showPhone ?? DEFAULT_CONTACT_DISPLAY.showPhone,
        showEmail: opts?.showEmail ?? DEFAULT_CONTACT_DISPLAY.showEmail,
    };
}

function childDisplayFromOptions(opts?: NestedSurfaceGroupDisplayOptions): HouseholdChildDisplay {
    return {
        showDob: opts?.showDob ?? DEFAULT_CHILD_DISPLAY.showDob,
        showAge: opts?.showAge ?? DEFAULT_CHILD_DISPLAY.showAge,
    };
}

function fieldModesToSets(
    fieldModes: Record<string, NestedSurfaceFieldMode> | undefined,
    selectedKeys: readonly string[],
): { displayed: Set<string>; editable: Set<string> } {
    const displayed = new Set<string>();
    const editable = new Set<string>();
    for (const key of selectedKeys) {
        const mode = fieldModes?.[key];
        const show = mode?.displayed !== false;
        const edit = mode?.editable !== false;
        if (show) displayed.add(key);
        if (show && edit) editable.add(key);
    }
    return { displayed, editable };
}

/** Read published household detail surface config from the Focus Panel summary doc. */
export function readHouseholdNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    // Canonical identity path — do not use the generic nested reader here.
    return readPublishedHouseholdNestedConfigFromDoc(doc);
}

/** Read published household contact surface config. */
export function readHouseholdContactNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return readNestedSurfaceConfigFromDoc(doc, HOUSEHOLD_CONTACT_SURFACE_ID);
}

/** Derive runtime household drill-in display view from published nested config. */
export function householdDisplayViewFromConfig(
    config: NestedSurfaceConfig | null,
    contactSurfaceConfig: NestedSurfaceConfig | null = null,
): HouseholdNestedDisplayView {
    const hiddenGroups = new Set<HouseholdEvidenceGroupKey>();
    if (config) {
        for (const group of config.groups) {
            if (group.displayOptions?.visible === false) {
                hiddenGroups.add(group.key as HouseholdEvidenceGroupKey);
            }
        }
    }

    // Merge contact display from all contact-shaped groups (any false wins).
    let contactDisplay = { ...DEFAULT_CONTACT_DISPLAY };
    let childDisplay = { ...DEFAULT_CHILD_DISPLAY };
    if (config) {
        for (const group of config.groups) {
            if (group.key === "children") {
                childDisplay = childDisplayFromOptions(group.displayOptions);
            } else if (group.key !== "address") {
                const gDisplay = contactDisplayFromOptions(group.displayOptions);
                contactDisplay = {
                    showPhone: contactDisplay.showPhone && gDisplay.showPhone,
                    showEmail: contactDisplay.showEmail && gDisplay.showEmail,
                };
            }
        }
    }

    const contactConfig = groupConfig(contactSurfaceConfig, "contact_fields");
    const contactKeys =
        contactConfig?.selectedFieldKeys.length
            ? contactConfig.selectedFieldKeys
            : [...CONTACT_FIELD_KEYS];
    const contactModes = fieldModesToSets(contactConfig?.fieldModes, contactKeys);

    return {
        hiddenGroups,
        contactDisplay,
        childDisplay,
        displayedContactFields: contactModes.displayed,
        editableContactFields: contactModes.editable,
    };
}

/** Flatten household nested config field keys (for evidence ordering when needed). */
export function householdDetailFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return nestedSurfaceFieldKeysFromConfig(config);
}

/** Default display options seed for a household evidence group. */
export function defaultHouseholdGroupDisplayOptions(groupKey: string): NestedSurfaceGroupDisplayOptions {
    if (groupKey === "children") {
        return { visible: true, showDob: false, showAge: false, showAvatar: true, useProfilePhotos: true };
    }
    if (groupKey === "address") {
        return { visible: true };
    }
    return {
        visible: true,
        showPhone: true,
        showEmail: true,
        showAvatar: true,
        useProfilePhotos: true,
    };
}

/** Default contact field modes for the contact drill-in surface. */
export function defaultContactFieldModes(): Record<string, NestedSurfaceFieldMode> {
    const modes: Record<string, NestedSurfaceFieldMode> = {};
    for (const key of CONTACT_FIELD_KEYS) {
        modes[key] = { displayed: true, editable: true };
    }
    return modes;
}

/** Apply published household nested-surface display view to assembled evidence. */
export function applyHouseholdDisplayView(
    evidence: import("@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence").HouseholdCardEvidence,
    view: HouseholdNestedDisplayView,
    childMetaById?: ReadonlyMap<string, { dob?: string | null; age?: string | null }>,
): import("@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence").HouseholdCardEvidence {
    const groups = evidence.groups
        .filter((g) => !view.hiddenGroups.has(g.key))
        .map((group) => {
            if (group.key === "children" && group.children.length > 0) {
                const children = group.children.map((child) => {
                    if (!view.childDisplay.showDob && !view.childDisplay.showAge) {
                        return { ...child, detailLine: null };
                    }
                    const meta = childMetaById?.get(child.id);
                    const parts: string[] = [];
                    if (view.childDisplay.showAge && meta?.age) parts.push(meta.age);
                    if (view.childDisplay.showDob && meta?.dob) parts.push(meta.dob);
                    return { ...child, detailLine: parts.length > 0 ? parts.join(" · ") : null };
                });
                return { ...group, children };
            }
            if (group.contacts.length > 0) {
                const contacts = group.contacts.map((contact) => {
                    const channelParts: string[] = [];
                    if (view.contactDisplay.showPhone && contact.phone) channelParts.push(contact.phone);
                    if (view.contactDisplay.showEmail && contact.email) channelParts.push(contact.email);
                    return {
                        ...contact,
                        phone: view.contactDisplay.showPhone ? contact.phone : null,
                        email: view.contactDisplay.showEmail ? contact.email : null,
                    };
                });
                return { ...group, contacts };
            }
            return group;
        });

    return { ...evidence, groups };
}

export { HOUSEHOLD_SURFACE_ID, HOUSEHOLD_CONTACT_SURFACE_ID };
