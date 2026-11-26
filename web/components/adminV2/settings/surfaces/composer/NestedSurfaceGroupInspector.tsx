"use client";

import type { NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceGroupDef } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    HOUSEHOLD_CONTACT_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    CHILD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { defaultContactFieldModes } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import { defaultChildFieldModes } from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";

function fieldLabel(surfaceId: string, key: string, tenantFieldDefinitions: ReturnType<typeof useTenantFieldDefinitions>["tenantFieldDefinitions"]): string {
    void surfaceId;
    return resolveCanonicalIdentityFieldLabel(key, tenantFieldDefinitions);
}

type Props = {
    surfaceId: string;
    groupDef: NestedSurfaceGroupDef;
    groupConfig: NestedSurfaceGroupConfig;
    onChange: (next: NestedSurfaceGroupConfig) => void;
    onOpenLibrary: () => void;
};

export default function NestedSurfaceGroupInspector({
    surfaceId,
    groupDef,
    groupConfig,
    onChange,
    onOpenLibrary,
}: Props) {
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const opts = groupConfig.displayOptions ?? {};

    function patchDisplayOptions(patch: Partial<NonNullable<NestedSurfaceGroupConfig["displayOptions"]>>) {
        onChange({
            ...groupConfig,
            displayOptions: { ...opts, ...patch },
        });
    }

    function patchFieldMode(fieldKey: string, patch: { displayed?: boolean; editable?: boolean }) {
        const defaultModes =
            surfaceId === CHILD_SURFACE_ID ? defaultChildFieldModes()
            : surfaceId === HOUSEHOLD_CONTACT_SURFACE_ID ? defaultContactFieldModes()
            : {};
        const modes = { ...(groupConfig.fieldModes ?? defaultModes) };
        modes[fieldKey] = { ...modes[fieldKey], ...patch };
        onChange({ ...groupConfig, fieldModes: modes });
    }

    const isContactSurface = surfaceId === HOUSEHOLD_CONTACT_SURFACE_ID && groupDef.key === "contact_fields";
    const isChildSurface = surfaceId === CHILD_SURFACE_ID;
    const isChildrenSurface = surfaceId === CHILDREN_SURFACE_ID;
    const isChildrenGroup = groupDef.key === "children";
    const isChildIdentity = isChildSurface && groupDef.key === "identity";
    const isChildrenIdentityOrRoster =
        isChildrenSurface && (groupDef.key === "identity" || groupDef.key === "roster");
    const isHouseholdContactGroup =
        surfaceId === HOUSEHOLD_SURFACE_ID && !isChildrenGroup && groupDef.key !== "address";
    const isChildFieldGroup = isChildSurface && !isChildIdentity && groupDef.key !== "readiness";
    const showAvatarControls =
        isChildIdentity || isChildrenIdentityOrRoster || isHouseholdContactGroup || isChildrenGroup;

    return (
        <div className="process-config-setup-card space-y-4 p-4" data-nested-group-inspector={groupDef.key}>
            <div>
                <h3 className="text-sm font-semibold text-alloy-midnight">{groupDef.label}</h3>
                {groupDef.purpose ?
                    <p className="config-typo-sublabel mt-1">{groupDef.purpose}</p>
                :   null}
            </div>

            {surfaceId === HOUSEHOLD_SURFACE_ID ?
                <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                    <input
                        type="checkbox"
                        checked={opts.visible !== false}
                        onChange={(e) => patchDisplayOptions({ visible: e.target.checked })}
                        data-nested-group-visible
                    />
                    Show this section
                </label>
            :   null}

            {showAvatarControls ?
                <div className="space-y-2 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Avatar</p>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showAvatar !== false}
                            onChange={(e) => patchDisplayOptions({ showAvatar: e.target.checked })}
                            data-nested-group-show-avatar
                        />
                        Show avatar
                    </label>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.useProfilePhotos !== false}
                            disabled={opts.showAvatar === false}
                            onChange={(e) => patchDisplayOptions({ useProfilePhotos: e.target.checked })}
                            data-nested-group-use-profile-photos
                        />
                        Load profile photos when available
                    </label>
                </div>
            :   null}

            {!isChildrenGroup && !isContactSurface && surfaceId === HOUSEHOLD_SURFACE_ID ?
                <div className="space-y-2 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Contact display</p>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showPhone !== false}
                            onChange={(e) => patchDisplayOptions({ showPhone: e.target.checked })}
                        />
                        Show phone
                    </label>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showEmail !== false}
                            onChange={(e) => patchDisplayOptions({ showEmail: e.target.checked })}
                        />
                        Show email
                    </label>
                </div>
            :   null}

            {isChildrenGroup ?
                <div className="space-y-2 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Child display</p>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showAge === true}
                            onChange={(e) => patchDisplayOptions({ showAge: e.target.checked })}
                        />
                        Show age beside name
                    </label>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showDob === true}
                            onChange={(e) => patchDisplayOptions({ showDob: e.target.checked })}
                        />
                        Show date of birth beside name
                    </label>
                </div>
            :   null}

            {isChildIdentity ?
                <div className="space-y-2 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Header display</p>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showAge !== false}
                            onChange={(e) => patchDisplayOptions({ showAge: e.target.checked })}
                        />
                        Show age beside name
                    </label>
                    <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                        <input
                            type="checkbox"
                            checked={opts.showDob === true}
                            onChange={(e) => patchDisplayOptions({ showDob: e.target.checked })}
                        />
                        Show date of birth beside name
                    </label>
                </div>
            :   null}

            {(isContactSurface || isChildFieldGroup) ?
                <div className="space-y-2 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Fields</p>
                    {groupConfig.selectedFieldKeys.map((key) => {
                        const defaultModes =
                            isChildSurface ? defaultChildFieldModes() : defaultContactFieldModes();
                        const mode = groupConfig.fieldModes?.[key] ?? defaultModes[key];
                        return (
                            <div key={key} className="rounded-lg border border-alloy-stone/12 px-2 py-2">
                                <p className="text-xs font-medium text-alloy-midnight">{fieldLabel(surfaceId, key, tenantFieldDefinitions)}</p>
                                <label className="mt-1 flex items-center gap-2 text-[11px] text-alloy-midnight/65">
                                    <input
                                        type="checkbox"
                                        checked={mode?.displayed !== false}
                                        onChange={(e) => patchFieldMode(key, { displayed: e.target.checked })}
                                    />
                                    Displayed
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-alloy-midnight/65">
                                    <input
                                        type="checkbox"
                                        checked={mode?.editable !== false}
                                        onChange={(e) => patchFieldMode(key, { editable: e.target.checked })}
                                    />
                                    Editable
                                </label>
                            </div>
                        );
                    })}
                </div>
            :   null}

            <button
                type="button"
                onClick={onOpenLibrary}
                className="config-secondary-btn w-full text-xs"
                data-nested-open-library={groupDef.key}
            >
                + Add field
            </button>
        </div>
    );
}
