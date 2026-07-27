"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import ChildProfileAvatarComposer from "@/components/admin/focusPanel/drillIn/ChildProfileAvatarComposer";
import DrillInRegionComposer from "@/components/admin/focusPanel/drillIn/DrillInRegionComposer";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import {
    isDomainLockedGroup,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { groupDefsFor } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    config: NestedSurfaceConfig;
    onConfigChange: (next: NestedSurfaceConfig) => void;
    previewContext: OperationalContext;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
};

/**
 * Runtime-shaped Children drill-in composer — roster + child focus surfaces.
 */
export default function FocusPanelChildrenDrillInComposer({
    config,
    onConfigChange,
    previewContext,
    tenantFieldDefinitions,
}: Props) {
    const evidence = useMemo(
        () => buildChildrenCardEvidence(previewContext, {
            childDetailFieldKeys: [
                ...selectedFieldKeys(config, "identity"),
                ...selectedFieldKeys(config, "placement"),
            ],
        }),
        [previewContext, config],
    );
    const [focusedId, setFocusedId] = useState(evidence.children[0]?.id ?? null);
    const focused = evidence.children.find((c) => c.id === focusedId) ?? evidence.children[0] ?? null;
    const rosterKeys = selectedFieldKeys(config, "roster");

    return (
        <div className="drill-in-surface drill-in-surface--children" data-children-drill-in-composer="true">
            <div className="drill-in-surface__card">
                <header className="drill-in-surface__card-header">
                    <h2 className="text-base font-semibold text-alloy-midnight">Children</h2>
                    <p className="text-xs text-alloy-midnight/50">{evidence.answerLine}</p>
                </header>

                <DrillInRegionComposer
                    surfaceId={CHILDREN_SURFACE_ID}
                    groupKey="roster"
                    config={config}
                    onConfigChange={onConfigChange}
                    tenantFieldDefinitions={tenantFieldDefinitions}
                    label="Roster rows"
                >
                    {focused ? (
                        <ChildProfileAvatarComposer
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="roster"
                            childId={focused.id}
                            childName={focused.name}
                            imageUrl={focused.imageUrl ?? null}
                            personId={focused.personId ?? null}
                            size={40}
                            builder={{ config, onConfigChange }}
                        />
                    ) : null}
                    <div className="alloy-os-children__roster" data-children-roster>
                        {evidence.children.map((child) => (
                            <button
                                key={child.id}
                                type="button"
                                className={clsx(
                                    "alloy-os-children__row",
                                    focused?.id === child.id && "alloy-os-children__row--active",
                                )}
                                onClick={() => setFocusedId(child.id)}
                                data-children-roster-row={child.id}
                            >
                                <CardAvatar
                                    name={child.name}
                                    imageUrl={child.imageUrl}
                                    size={28}
                                    role="child"
                                    recordId={child.id}
                                />
                                <span className="alloy-os-children__row-main min-w-0">
                                    <span className="alloy-os-children__row-name">{child.name}</span>
                                    <span className="alloy-os-children__row-meta">
                                        {rosterMetaLines(child, rosterKeys).map((line) => (
                                            <span key={line} className="alloy-os-children__row-meta-item">
                                                {line}
                                            </span>
                                        ))}
                                    </span>
                                </span>
                                {child.status ? (
                                    <span className="alloy-os-card-pill alloy-os-card-pill--neutral">{child.status}</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </DrillInRegionComposer>

                {focused ? (
                    <div className="mt-4 space-y-3">
                        <DrillInRegionComposer
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="identity"
                            config={config}
                            onConfigChange={onConfigChange}
                            tenantFieldDefinitions={tenantFieldDefinitions}
                            label={`${focused.name.split(" ")[0]} — Identity`}
                        >
                            <div className="space-y-3">
                                <ChildProfileAvatarComposer
                                    surfaceId={CHILDREN_SURFACE_ID}
                                    groupKey="identity"
                                    childId={focused.id}
                                    childName={focused.name}
                                    imageUrl={focused.imageUrl ?? null}
                                    personId={focused.personId ?? null}
                                    size={40}
                                    builder={{ config, onConfigChange }}
                                />
                                <ChildFocusPreview
                                    child={focused}
                                    fieldKeys={selectedFieldKeys(config, "identity")}
                                />
                            </div>
                        </DrillInRegionComposer>
                        <DrillInRegionComposer
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey="placement"
                            config={config}
                            onConfigChange={onConfigChange}
                            tenantFieldDefinitions={tenantFieldDefinitions}
                            label="Placement"
                        >
                            <ChildFocusPreview child={focused} fieldKeys={selectedFieldKeys(config, "placement")} />
                        </DrillInRegionComposer>
                    </div>
                ) : null}

                <footer className="mt-4 border-t border-alloy-stone/10 pt-3">
                    <span className="text-xs text-alloy-midnight/45">← Back to panel</span>
                </footer>
            </div>

            <aside className="drill-in-surface__aside space-y-3">
                <DrillInRegionComposer
                    surfaceId={CHILDREN_SURFACE_ID}
                    groupKey="child_edit"
                    config={config}
                    onConfigChange={onConfigChange}
                    tenantFieldDefinitions={tenantFieldDefinitions}
                    label="Child Edit"
                >
                    <div className="alloy-os-card-edit alloy-os-card-edit--preview">
                        <p className="alloy-os-card-edit__title">Edit {focused?.name.split(" ")[0] ?? "child"}</p>
                    </div>
                </DrillInRegionComposer>

                {groupDefsFor(CHILDREN_SURFACE_ID)
                    .filter((g) => isDomainLockedGroup(CHILDREN_SURFACE_ID, g.key))
                    .map((g) => (
                        <DrillInRegionComposer
                            key={g.key}
                            surfaceId={CHILDREN_SURFACE_ID}
                            groupKey={g.key}
                            config={config}
                            onConfigChange={onConfigChange}
                            label={g.label}
                            domainLocked
                        >
                            <p className="text-[11px] text-alloy-midnight/45">{g.purpose}</p>
                        </DrillInRegionComposer>
                    ))}
            </aside>
        </div>
    );
}

function rosterMetaLines(
    child: ReturnType<typeof buildChildrenCardEvidence>["children"][0],
    fieldKeys: string[],
): string[] {
    const lines: string[] = [];
    for (const key of fieldKeys) {
        if (key === "child.date_of_birth" || key === "child.dob_age") {
            if (child.dobAge) lines.push(child.dobAge);
        } else if (key === "inquiry_child.program" && child.program) {
            lines.push(child.program);
        } else if (key === "child.status" && child.status) {
            lines.push(child.status);
        }
    }
    if (lines.length === 0) {
        if (child.dobAge) lines.push(child.dobAge);
        if (child.program) lines.push(child.program);
    }
    return lines;
}

function ChildFocusPreview({
    child,
    fieldKeys,
}: {
    child: ReturnType<typeof buildChildrenCardEvidence>["children"][0];
    fieldKeys: string[];
}) {
    const valueByKey: Record<string, string | null> = {
        "child.name": child.name,
        "child.date_of_birth": child.dobAge,
        "child.dob_age": child.dobAge,
        "inquiry_child.program": child.program,
        "child.room": child.room,
        "inquiry_child.schedule_type": child.schedule,
        "child.start_date": child.startDate,
    };
    const keys = fieldKeys.length > 0 ? fieldKeys : Object.keys(valueByKey);
    return (
        <div className="alloy-os-child-truth">
            {keys.map((key) => {
                const value = valueByKey[key];
                if (!value) return null;
                return (
                    <div key={key} className="alloy-os-child-truth__row" data-child-field={key}>
                        <span className="alloy-os-child-truth__label">
                            {key.replace(/^[^.]+\./, "").replace(/_/g, " ")}
                        </span>
                        <span className="alloy-os-child-truth__value">{value}</span>
                    </div>
                );
            })}
        </div>
    );
}
