"use client";

import type { NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { NestedSurfaceGroupDef } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_CONTACT_SURFACE_ID, HOUSEHOLD_SURFACE_ID, CHILD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { defaultContactFieldModes } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import { defaultChildFieldModes } from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";

const CONTACT_FIELD_LABELS: Record<string, string> = {
    "person.first_name": "First Name",
    "person.last_name": "Last Name",
    "person.phone": "Phone",
    "person.email": "Email",
    "person.date_of_birth": "Date of Birth",
    "person.address": "Address",
};

const CHILD_FIELD_LABELS: Record<string, string> = {
    "child.display_name": "Name",
    "child.date_of_birth": "Date of Birth",
    "child.age": "Age",
    "inquiry_child.program": "Program",
    "child.room": "Room",
    "inquiry_child.schedule_type": "Schedule",
    "child.start_date": "Start date",
    "child.readiness_summary": "Readiness",
};

function fieldLabel(surfaceId: string, key: string): string {
    if (surfaceId === CHILD_SURFACE_ID) return CHILD_FIELD_LABELS[key] ?? key;
    return CONTACT_FIELD_LABELS[key] ?? key;
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
    const isChildrenGroup = groupDef.key === "children";
    const isChildIdentity = isChildSurface && groupDef.key === "identity";
    const isChildFieldGroup = isChildSurface && !isChildIdentity && groupDef.key !== "readiness";

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
                                <p className="text-xs font-medium text-alloy-midnight">{fieldLabel(surfaceId, key)}</p>
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
