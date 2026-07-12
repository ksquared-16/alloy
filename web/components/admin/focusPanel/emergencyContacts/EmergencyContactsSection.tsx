"use client";

import { useMemo, useState } from "react";
import IdentityFieldGrid from "@/components/admin/focusPanel/identity/IdentityFieldGrid";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { ChildrenEvidenceSectionView } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { buildEmergencyContactsEvidenceForChild } from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactsEvidence";
import {
    buildEmergencyContactFieldRows,
    isPersonOwnedEmergencyContactField,
    isRelationshipOwnedEmergencyContactField,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/emergencyContactsFieldRuntime";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    child: ChildrenEvidenceChild;
    context: OperationalContext;
    section: ChildrenEvidenceSectionView;
    config: NestedSurfaceConfig;
    mutation?: FocusPanelMutation;
    composing?: boolean;
};

export default function EmergencyContactsSection({
    child,
    context,
    section,
    config,
    mutation,
    composing = false,
}: Props) {
    const memberId = child.customerMemberId?.trim() ?? "";
    const evidence = useMemo(
        () =>
            memberId
                ? buildEmergencyContactsEvidenceForChild({ context, customerMemberId: memberId })
                : { items: [], count: 0, answerLine: "No emergency contact on file", supportingLine: null },
        [context, memberId],
    );

    const canMutate = Boolean(mutation?.canEdit && !composing);
    const [editingField, setEditingField] = useState<{
        relationshipId: string;
        personId: string;
        fieldRef: string;
        currentValue: string | null;
    } | null>(null);
    const [draftValue, setDraftValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const beginEdit = (args: {
        relationshipId: string;
        personId: string;
        fieldRef: string;
        currentValue: string | null;
    }) => {
        setEditingField(args);
        setDraftValue(args.currentValue ?? "");
        setError(null);
    };

    const saveEdit = async () => {
        if (!editingField || !mutation) return;
        setSaving(true);
        setError(null);
        const { relationshipId, personId, fieldRef } = editingField;
        let result;
        if (isPersonOwnedEmergencyContactField(fieldRef)) {
            const key = fieldRef.slice("person.".length);
            const patch: Record<string, string | null> = {};
            if (key === "primary_contact_name" || key === "display_name" || key === "name") {
                const parts = draftValue.trim().split(/\s+/);
                patch.first_name = parts[0] ?? null;
                patch.last_name = parts.slice(1).join(" ") || null;
            } else if (key === "email") patch.email = draftValue.trim() || null;
            else if (key === "phone") patch.phone = draftValue.trim() || null;
            else patch[key] = draftValue.trim() || null;
            result = await mutation.savePersonContact(personId, patch);
        } else if (isRelationshipOwnedEmergencyContactField(fieldRef)) {
            const key = fieldRef.slice("person_child_relationship.".length);
            if (key === "priority") {
                const n = draftValue.trim() === "" ? null : Number(draftValue);
                result = await mutation.savePersonChildRelationship(relationshipId, memberId, {
                    priority: n != null && Number.isFinite(n) ? n : null,
                });
            } else if (key === "relationship_type") {
                result = await mutation.savePersonChildRelationship(relationshipId, memberId, {
                    relationship_type: draftValue.trim() || null,
                });
            } else if (key === "status") {
                result = await mutation.savePersonChildRelationship(relationshipId, memberId, {
                    status: draftValue.trim() || null,
                });
            } else {
                result = await mutation.savePersonChildRelationship(relationshipId, memberId, {
                    custom_fields: { [key]: draftValue.trim() || null },
                });
            }
        } else {
            result = { ok: false as const, status: 400, error: "Unsupported field" };
        }
        setSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setEditingField(null);
    };

    return (
        <div
            className="alloy-os-child-emergency-contacts"
            data-children-emergency-contacts="true"
            data-children-emergency-member={memberId || undefined}
        >
            <div className="alloy-os-household__group-header">
                <span className="alloy-os-household__group-title">{section.label}</span>
                {canMutate && memberId && mutation?.openAddEmergencyContactForChild ? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        data-children-add-emergency="true"
                        onClick={() =>
                            mutation.openAddEmergencyContactForChild({
                                customerMemberId: memberId,
                                childPersonId: child.personId ?? null,
                            })
                        }
                    >
                        Add emergency contact →
                    </button>
                ) : null}
            </div>

            {evidence.count === 0 ? (
                <p className="alloy-os-household__row-detail" data-children-emergency-empty="true">
                    {evidence.supportingLine ?? "No emergency contact on file"}
                </p>
            ) : (
                evidence.items.map((item) => {
                    const rows = buildEmergencyContactFieldRows({
                        item,
                        fieldKeys: section.fieldKeys,
                        config,
                        groupKey: section.key,
                        canEditPerson: canMutate,
                        canEditRelationship: canMutate,
                    });
                    return (
                        <div
                            key={item.relationship_id}
                            className="alloy-os-child-emergency-contacts__item"
                            data-relationship-id={item.relationship_id}
                        >
                            <p className="alloy-os-child-emergency-contacts__name">{item.person_display_name}</p>
                            <IdentityFieldGrid
                                rows={rows}
                                onEditField={
                                    canMutate
                                        ? (fieldRef) => {
                                              const cell = rows.flatMap((r) => r.cells).find((c) => c.fieldRef === fieldRef);
                                              beginEdit({
                                                  relationshipId: item.relationship_id,
                                                  personId: item.person_id,
                                                  fieldRef,
                                                  currentValue: cell?.value ?? null,
                                              });
                                          }
                                        : undefined
                                }
                            />
                            {canMutate && mutation?.removeEmergencyContactRole ? (
                                <button
                                    type="button"
                                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                                    data-children-remove-emergency-role="true"
                                    onClick={() =>
                                        mutation.removeEmergencyContactRole({
                                            relationshipId: item.relationship_id,
                                            customerMemberId: memberId,
                                        })
                                    }
                                >
                                    Remove emergency contact role
                                </button>
                            ) : null}
                        </div>
                    );
                })
            )}

            {editingField ? (
                <div className="alloy-os-child-emergency-contacts__edit" data-emergency-field-edit="true">
                    <label className="alloy-os-household__row-detail">
                        Edit {editingField.fieldRef}
                        <input
                            className="alloy-os-input"
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            disabled={saving}
                        />
                    </label>
                    {error ? <p className="alloy-os-household__row-detail">{error}</p> : null}
                    <div className="alloy-os-card-nav">
                        <button type="button" className="alloy-os-ucard__action" onClick={() => setEditingField(null)} disabled={saving}>
                            Cancel
                        </button>
                        <button type="button" className="alloy-os-ucard__action" onClick={saveEdit} disabled={saving}>
                            Save
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
