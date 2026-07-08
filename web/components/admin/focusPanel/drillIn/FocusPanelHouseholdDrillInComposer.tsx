"use client";

import { useMemo } from "react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import DrillInRegionComposer from "@/components/admin/focusPanel/drillIn/DrillInRegionComposer";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    householdGroupFieldKeys,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import {
    renderChildFields,
    renderContactFields,
    type HouseholdEvidenceChildExtended,
} from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import {
    isNestedGroupEnabled,
    isOptionalNestedGroup,
    setNestedGroupEnabled,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { groupDefsFor } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    config: NestedSurfaceConfig;
    onConfigChange: (next: NestedSurfaceConfig) => void;
    previewContext: OperationalContext;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
};

const GROUP_LABELS: Record<string, string> = {
    primary_contact: "Primary Contact",
    other_parent_guardian: "Other Parent / Guardian",
    household_members: "Additional Contacts",
    children: "Children",
    emergency_contacts: "Emergency Contact",
    contact_edit: "Contact Edit",
};

/**
 * Runtime-shaped Household drill-in composer — fixed structure, configurable fields inside.
 */
export default function FocusPanelHouseholdDrillInComposer({
    config,
    onConfigChange,
    previewContext,
    tenantFieldDefinitions,
}: Props) {
    const evidence = useMemo(
        () => buildHouseholdCardEvidence(previewContext, { nestedConfig: config }),
        [previewContext, config],
    );

    const sections = useMemo(
        (): string[] => evidence.groups.map((group) => group.key),
        [evidence.groups],
    );

    const groupForKey = (key: string) => evidence.groups.find((g) => g.key === key);

    return (
        <div className="drill-in-surface drill-in-surface--household" data-household-drill-in-composer="true">
            <div className="drill-in-surface__card">
                <header className="drill-in-surface__card-header">
                    <h2 className="text-base font-semibold text-alloy-midnight">Household</h2>
                    <p className="text-xs text-alloy-midnight/50">Johnson household</p>
                </header>

                <div className="alloy-os-household__groups" data-household-groups>
                    {sections.map((groupKey) => {
                        const group = groupForKey(groupKey);
                        const fieldKeys = householdGroupFieldKeys(config, groupKey);
                        return (
                            <DrillInRegionComposer
                                key={groupKey}
                                surfaceId={HOUSEHOLD_SURFACE_ID}
                                groupKey={groupKey}
                                config={config}
                                onConfigChange={onConfigChange}
                                tenantFieldDefinitions={tenantFieldDefinitions}
                                label={GROUP_LABELS[groupKey] ?? groupKey}
                            >
                                {groupKey === "children" ? (
                                    <HouseholdComposerChildrenRows
                                        children={group?.children ?? []}
                                        fieldKeys={fieldKeys}
                                    />
                                ) : (
                                    <HouseholdComposerContactRows
                                        contacts={group?.contacts ?? []}
                                        fieldKeys={fieldKeys}
                                        emptyLabel={
                                            groupKey === "emergency_contacts"
                                                ? "No emergency contacts — runtime shows Add emergency contact →"
                                                : "No contacts in preview data"
                                        }
                                        emptyActionLabel={
                                            groupKey === "emergency_contacts"
                                                ? "Add emergency contact →"
                                                : undefined
                                        }
                                    />
                                )}
                            </DrillInRegionComposer>
                        );
                    })}
                </div>

                {!isNestedGroupEnabled(config, "emergency_contacts") ? (
                    <button
                        type="button"
                        className="drill-in-surface__add-section mt-3"
                        data-add-emergency-section="true"
                        onClick={() =>
                            onConfigChange(setNestedGroupEnabled(config, "emergency_contacts", true))
                        }
                    >
                        + Add Emergency Contact section
                    </button>
                ) : null}

                <footer className="mt-4 border-t border-alloy-stone/10 pt-3">
                    <span className="text-xs text-alloy-midnight/45">← Back to panel</span>
                </footer>
            </div>

            <aside className="drill-in-surface__aside">
                <DrillInRegionComposer
                    surfaceId={HOUSEHOLD_SURFACE_ID}
                    groupKey="contact_edit"
                    config={config}
                    onConfigChange={onConfigChange}
                    tenantFieldDefinitions={tenantFieldDefinitions}
                    label="Contact Edit"
                >
                    <div className="alloy-os-card-edit alloy-os-card-edit--preview">
                        <p className="alloy-os-card-edit__title">Edit Jordan Johnson</p>
                        <div className="alloy-os-card-edit__form">
                            {householdGroupFieldKeys(config, "contact_edit").map((key) => (
                                <div key={key} className="alloy-os-card-edit__row">
                                    <span className="alloy-os-card-edit__label">
                                        {key.replace("contact.", "").replace(/_/g, " ")}
                                    </span>
                                    <div className="alloy-os-card-edit__input h-8 rounded border border-alloy-stone/15 bg-alloy-stone/[0.03]" />
                                </div>
                            ))}
                        </div>
                    </div>
                </DrillInRegionComposer>

                {isOptionalNestedGroup(HOUSEHOLD_SURFACE_ID, "emergency_contacts") ? (
                    <p className="mt-3 text-[11px] text-alloy-midnight/40">
                        Optional sections: {groupDefsFor(HOUSEHOLD_SURFACE_ID).filter((g) => g.key === "emergency_contacts").map((g) => g.label).join(", ")}
                    </p>
                ) : null}
            </aside>
        </div>
    );
}

function HouseholdComposerContactRows({
    contacts,
    fieldKeys,
    emptyLabel,
    emptyActionLabel,
}: {
    contacts: ReturnType<typeof buildHouseholdCardEvidence>["groups"][0]["contacts"];
    fieldKeys: string[];
    emptyLabel: string;
    emptyActionLabel?: string;
}) {
    if (contacts.length === 0) {
        return (
            <div className="alloy-os-household__empty-action px-1 py-2" data-household-emergency-empty="true">
                <p className="alloy-os-household__row-detail">{emptyLabel}</p>
                {emptyActionLabel ? (
                    <span className="alloy-os-ucard__action alloy-os-ucard__action--system5" aria-hidden>
                        {emptyActionLabel}
                    </span>
                ) : null}
            </div>
        );
    }
    return (
        <div className="alloy-os-household__rows">
            {contacts.map((contact) => {
                const fields = fieldKeys.length > 0
                    ? renderContactFields(contact, fieldKeys, { masked: false })
                    : [{ key: "person.primary_contact_name", label: "Name", value: contact.name, isName: true }];
                const nameField = fields.find((f) => f.isName) ?? fields[0];
                const details = fields.filter((f) => f !== nameField);
                return (
                    <div key={contact.personId || contact.name} className="alloy-os-household__row">
                        <CardAvatar name={contact.name} size={26} />
                        <span className="alloy-os-household__row-main min-w-0">
                            {nameField ? (
                                <span className="alloy-os-household__row-name">{nameField.value}</span>
                            ) : null}
                            {details.map((f) => (
                                <span key={f.key} className="alloy-os-household__row-detail" data-household-field={f.key}>
                                    {f.value}
                                </span>
                            ))}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function HouseholdComposerChildrenRows({
    children,
    fieldKeys,
}: {
    children: ReturnType<typeof buildHouseholdCardEvidence>["groups"][0]["children"];
    fieldKeys: string[];
}) {
    if (children.length === 0) {
        return <p className="alloy-os-household__row-detail px-1 py-2">No children in preview data</p>;
    }
    return (
        <div className="alloy-os-household__rows">
            {children.map((child) => {
                const fields = fieldKeys.length > 0
                    ? renderChildFields(child as HouseholdEvidenceChildExtended, fieldKeys)
                    : [{ key: "child.name", label: "Name", value: child.name, isName: true }];
                const nameField = fields.find((f) => f.isName) ?? fields[0];
                const details = fields.filter((f) => f !== nameField);
                return (
                    <div key={child.id} className="alloy-os-household__row">
                        <CardAvatar name={child.name} size={26} />
                        <span className="alloy-os-household__row-main min-w-0">
                            {nameField ? (
                                <span className="alloy-os-household__row-name">{nameField.value}</span>
                            ) : null}
                            {details.map((f) => (
                                <span key={f.key} className="alloy-os-household__row-detail" data-household-field={f.key}>
                                    {f.value}
                                </span>
                            ))}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
