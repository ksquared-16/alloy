"use client";

import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { sortFieldDefinitionsForAdminList } from "@/lib/admin/sortFieldDefinitions";
import OptionSetKeyPicker from "@/components/admin/OptionSetKeyPicker";
import {
    buildConfigWithOptionSetKey,
    getOptionSetKeyFromConfig,
    isSelectLikeFieldType,
} from "@/lib/admin/fieldDefinitionOptionSetConfig";
import {
    listMissingPlacementFieldTemplatesForEntity,
    type ConfigurablePlacementFieldTemplate,
} from "@/lib/fields/configurablePlacementFieldCatalog";
import { shouldIncludeConfigOnFieldDefinitionPatch } from "@/lib/fields/fieldDefinitionConfig";
import {
    fetchFieldSectionRegistry,
    mergeFieldSectionSelectOptions,
    sectionKeyInOptions,
    type FieldSectionRegistryRow,
} from "@/lib/admin/fieldSectionSelectOptions";
import {
    buildFieldPolicySettingsViewsForList,
    buildSimpleInteractionPolicy,
    buildSimpleRequirementPolicy,
    entityTypeSupportsFieldPolicySettings,
    parseStoredPoliciesForEdit,
    requirementPresetFromPolicy,
    interactionPresetFromPolicy,
    type FieldPolicyInteractionPreset,
    type FieldPolicyRequirementPreset,
    type FieldPolicySettingsView,
} from "@/lib/fields/fieldPolicySettingsUi";
import FieldDefinitionEditModal from "@/components/admin/fields/FieldDefinitionEditModal";
import FieldRequiredInlineCell from "@/components/admin/fields/FieldRequiredInlineCell";
import FieldsGroupedEntityPanel from "@/components/adminV2/settings/fields/FieldsGroupedEntityPanel";
import { CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";
import {
    buildFieldsSectionGroups,
    fieldsEntityDescription,
} from "@/lib/fields/fieldsConfigurationModel";
import { syntheticChildProfileFieldRows } from "@/lib/fields/fieldSurfaceAvailability";
import {
    canOperatorEditRequirementInline,
    fieldBehaviorConfiguredOnRecordLayouts,
    FIELDS_HUB_LAYOUT_BEHAVIOR_NOTE,
    isOperatorHiddenField,
    operatorFieldDisplayLabel,
    recordLayoutsSettingsHref,
} from "@/lib/fields/fieldSettingsOperatorUi";
import { resolveInlineRequirementPreset } from "@/lib/fields/fieldRequiredInlineUi";

const FIELD_TYPES = ["text", "email", "phone", "number", "date", "datetime", "boolean", "select", "multiselect"] as const;

function slugifyLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64) || "";
}

function toFieldDef(r: Record<string, unknown>): FieldDef {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        entity_type: String(r.entity_type),
        field_key: String(r.field_key),
        field_type: String(r.field_type),
        label: r.label != null ? String(r.label) : null,
        description: r.description != null ? String(r.description) : null,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        is_active: r.is_active !== false,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: r.is_visible_in_table !== false,
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        is_filterable: Boolean(r.is_filterable),
        is_sortable: Boolean(r.is_sortable),
        section_key: r.section_key != null ? String(r.section_key) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        placeholder: r.placeholder != null ? String(r.placeholder) : null,
        help_text: r.help_text != null ? String(r.help_text) : null,
        config: r.config != null && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null,
        requirement_policy: r.requirement_policy ?? null,
        interaction_policy: r.interaction_policy ?? null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

export type EntityFieldsClientProps = {
    /** API entity_type: person, customer, job, opportunity, vendor, schedule */
    entityType: string;
    /** Page title, e.g. "Customer Fields" */
    title: string;
    /** Optional subtitle */
    subtitle?: string;
    /** Link target for “Option sets” helper (Settings vs legacy System). */
    manageOptionSetsHref?: string;
    /** AdminV2 Settings: no AdminPageHeader white card; compact title + elevated section card. */
    adminV2Chrome?: boolean;
    /** When true, page title/subtitle are rendered by the parent route. */
    hideSettingsHeader?: boolean;
};

export default function EntityFieldsClient({
    entityType,
    title,
    subtitle,
    manageOptionSetsHref,
    adminV2Chrome = false,
    hideSettingsHeader = false,
}: EntityFieldsClientProps) {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<FieldDef[]>([]);
    const [profileItems, setProfileItems] = useState<FieldDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState<FieldDef | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editRequired, setEditRequired] = useState(false);
    const [editRequirementPreset, setEditRequirementPreset] = useState<FieldPolicyRequirementPreset>("optional");
    const [editInteractionPreset, setEditInteractionPreset] = useState<FieldPolicyInteractionPreset>("editable");
    const [editPolicyView, setEditPolicyView] = useState<FieldPolicySettingsView | null>(null);
    const [editActive, setEditActive] = useState(true);
    const [editVisibleForm, setEditVisibleForm] = useState(true);
    const [editVisibleDrawer, setEditVisibleDrawer] = useState(true);
    const [editVisibleTable, setEditVisibleTable] = useState(true);
    const [editFilterable, setEditFilterable] = useState(false);
    const [editSortable, setEditSortable] = useState(false);
    const [editSectionKey, setEditSectionKey] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(100);
    const [editPlaceholder, setEditPlaceholder] = useState("");
    const [editHelpText, setEditHelpText] = useState("");
    const [editOptionSetKey, setEditOptionSetKey] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createKey, setCreateKey] = useState("");
    const [createLabel, setCreateLabel] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createFieldType, setCreateFieldType] = useState<string>("text");
    const [createSectionKey, setCreateSectionKey] = useState("custom");
    const [createSortOrder, setCreateSortOrder] = useState(100);
    const [createRequired, setCreateRequired] = useState(false);
    const [createVisibleForm, setCreateVisibleForm] = useState(true);
    const [createVisibleDrawer, setCreateVisibleDrawer] = useState(true);
    const [createVisibleTable, setCreateVisibleTable] = useState(true);
    const [createFilterable, setCreateFilterable] = useState(false);
    const [createSortable, setCreateSortable] = useState(false);
    const [createPlaceholder, setCreatePlaceholder] = useState("");
    const [createHelpText, setCreateHelpText] = useState("");
    const [createOptionSetKey, setCreateOptionSetKey] = useState("");
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const createKeyManuallyEditedRef = useRef(false);
    const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [sectionRegistry, setSectionRegistry] = useState<FieldSectionRegistryRow[]>([]);
    const [profileSectionRegistry, setProfileSectionRegistry] = useState<FieldSectionRegistryRow[]>([]);
    const [showSystemFields, setShowSystemFields] = useState(false);
    const [inlineSavingKey, setInlineSavingKey] = useState<string | null>(null);
    const [inlineSavedKey, setInlineSavedKey] = useState<string | null>(null);
    const [inlineSaveError, setInlineSaveError] = useState<string | null>(null);
    const [inlineRowErrors, setInlineRowErrors] = useState<Record<string, string>>({});
    const [inlinePresetOverrides, setInlinePresetOverrides] = useState<Record<string, FieldPolicyRequirementPreset>>({});
    const [ensureSavingKey, setEnsureSavingKey] = useState<string | null>(null);
    const [ensureError, setEnsureError] = useState<string | null>(null);

    const missingPlacementTemplates = useMemo(
        () =>
            listMissingPlacementFieldTemplatesForEntity(
                entityType,
                items.map((i) => i.field_key),
            ),
        [entityType, items],
    );

    const sortedItems = useMemo(() => sortFieldDefinitionsForAdminList(items), [items]);

    const visibleItems = useMemo(() => {
        if (showSystemFields) return sortedItems;
        return sortedItems.filter(
            (row) =>
                !isOperatorHiddenField(entityType, {
                    field_key: row.field_key,
                    is_system: row.is_system,
                    label: row.label,
                    config: row.config,
                })
        );
    }, [entityType, showSystemFields, sortedItems]);

    const visibleProfileItems = useMemo(() => {
        if (entityType !== "inquiry_child") return [];
        const sorted = sortFieldDefinitionsForAdminList(profileItems);
        if (showSystemFields) return sorted;
        return sorted.filter(
            (row) =>
                !isOperatorHiddenField(CUSTOMER_MEMBER_ENTITY_TYPE, {
                    field_key: row.field_key,
                    is_system: row.is_system,
                    label: row.label,
                    config: row.config,
                }),
        );
    }, [entityType, profileItems, showSystemFields]);

    const fieldsSectionGroups = useMemo(() => {
        if (!adminV2Chrome) return [];
        return buildFieldsSectionGroups({
            enrollmentFields: visibleItems,
            profileFields: visibleProfileItems,
            sectionRegistry,
            profileSectionRegistry,
            enrollmentEntityType: entityType,
            showSystemFields,
        });
    }, [
        adminV2Chrome,
        visibleItems,
        visibleProfileItems,
        sectionRegistry,
        profileSectionRegistry,
        entityType,
        showSystemFields,
    ]);

    const groupedFieldCount = fieldsSectionGroups.reduce((count, section) => count + section.rows.length, 0);
    const hiddenFieldCount =
        sortedItems.length -
        visibleItems.length +
        (entityType === "inquiry_child" ? profileItems.length - visibleProfileItems.length : 0);
    const displayFieldCount = adminV2Chrome ? groupedFieldCount : visibleItems.length;

    const policySettingsSupported = entityTypeSupportsFieldPolicySettings(entityType);
    const layoutBehaviorOnRecordLayouts = fieldBehaviorConfiguredOnRecordLayouts(entityType);
    const showPolicyColumnsInTable = policySettingsSupported && !layoutBehaviorOnRecordLayouts;
    const showRequiredColumn = !policySettingsSupported || !layoutBehaviorOnRecordLayouts;

    const policyViewsByFieldKey = useMemo(
        () =>
            policySettingsSupported
                ? buildFieldPolicySettingsViewsForList(
                      entityType,
                      items.map((i) => ({
                          field_key: i.field_key,
                          is_system: i.is_system,
                          is_required: i.is_required,
                          requirement_policy: i.requirement_policy,
                          interaction_policy: i.interaction_policy,
                      }))
                  )
                : new Map<string, FieldPolicySettingsView>(),
        [entityType, items, policySettingsSupported]
    );

    const inUseSectionKeys = useMemo(
        () =>
            new Set(
                items
                    .map((i) => i.section_key)
                    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
            ),
        [items]
    );

    const sectionOptions = useMemo(
        () => mergeFieldSectionSelectOptions(sectionRegistry, inUseSectionKeys),
        [sectionRegistry, inUseSectionKeys]
    );

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const requests: Promise<Response>[] = [
                fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`),
            ];
            if (entityType === "inquiry_child") {
                requests.push(
                    fetch(
                        `/api/admin/field-definitions?entity_type=${encodeURIComponent(CUSTOMER_MEMBER_ENTITY_TYPE)}`,
                    ),
                );
            }
            const responses = await Promise.all(requests);
            const primaryJson = await responses[0]!.json().catch(() => ({}));
            if (!responses[0]!.ok) {
                throw new Error((primaryJson as { error?: string }).error ?? "Failed to load field definitions");
            }
            const raw =
                (primaryJson as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? [];
            setItems(raw.map(toFieldDef));

            if (entityType === "inquiry_child" && responses[1]) {
                const profileJson = await responses[1].json().catch(() => ({}));
                const profileRaw = responses[1].ok
                    ? ((profileJson as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? [])
                    : [];
                const profileDefs = profileRaw.map(toFieldDef);
                if (profileDefs.length > 0) {
                    setProfileItems(profileDefs);
                } else {
                    setProfileItems(
                        syntheticChildProfileFieldRows().map(
                            (manifest) =>
                                ({
                                    ...manifest,
                                    id: manifest.field_key,
                                    org_id: "",
                                    field_type: manifest.field_key === "gender" ? "select" : "text",
                                    is_system: true,
                                    is_required: false,
                                    is_active: true,
                                    is_visible_in_public_booking: false,
                                    is_filterable: false,
                                    is_sortable: false,
                                    section_key: manifest.field_key === "gender" || manifest.field_key === "preferred_name"
                                        ? "child_profile"
                                        : "medical",
                                    sort_order: 100,
                                    placeholder: null,
                                    help_text: null,
                                    config: null,
                                    requirement_policy: null,
                                    interaction_policy: null,
                                    created_at: "",
                                    updated_at: "",
                                }) as FieldDef,
                        ),
                    );
                }
            } else {
                setProfileItems([]);
            }
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
            setProfileItems([]);
        } finally {
            setLoading(false);
        }
    }, [entityType]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    useEffect(() => {
        let cancelled = false;
        setSectionRegistry([]);
        setProfileSectionRegistry([]);
        (async () => {
            const reg = await fetchFieldSectionRegistry(entityType);
            if (!cancelled) setSectionRegistry(reg);
            if (entityType === "inquiry_child") {
                const profileReg = await fetchFieldSectionRegistry(CUSTOMER_MEMBER_ENTITY_TYPE);
                if (!cancelled) setProfileSectionRegistry(profileReg);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [entityType]);

    const patchRequirementInline = async (row: FieldDef, preset: FieldPolicyRequirementPreset) => {
        if (!canMutate || !policySettingsSupported || layoutBehaviorOnRecordLayouts) return;
        const view = policyViewsByFieldKey.get(row.field_key);
        if (!canOperatorEditRequirementInline(view ?? null)) return;

        const previousPreset = resolveInlineRequirementPreset(row, view ?? null, inlinePresetOverrides[row.field_key]);
        setInlinePresetOverrides((prev) => ({ ...prev, [row.field_key]: preset }));
        setInlineRowErrors((prev) => {
            const next = { ...prev };
            delete next[row.field_key];
            return next;
        });
        setInlineSavingKey(row.field_key);
        setInlineSaveError(null);

        try {
            const parsed = parseStoredPoliciesForEdit({
                field_key: row.field_key,
                is_system: row.is_system,
                is_required: row.is_required,
                requirement_policy: row.requirement_policy,
                interaction_policy: row.interaction_policy,
            });
            const intPreset =
                interactionPresetFromPolicy(parsed.interactionPolicy) ?? view?.interactionPreset ?? "editable";
            const res = await fetch(`/api/admin/field-definitions/${row.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requirement_policy: buildSimpleRequirementPolicy(preset),
                    interaction_policy: buildSimpleInteractionPolicy(intPreset, entityType, row.field_key),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setInlinePresetOverrides((prev) => {
                const next = { ...prev };
                delete next[row.field_key];
                return next;
            });
            setInlineSavedKey(row.field_key);
            window.setTimeout(() => setInlineSavedKey((k) => (k === row.field_key ? null : k)), 2000);
            await fetchItems();
        } catch (e) {
            const message = (e as Error).message;
            setInlinePresetOverrides((prev) => ({ ...prev, [row.field_key]: previousPreset }));
            setInlineRowErrors((prev) => ({ ...prev, [row.field_key]: message }));
            setInlineSaveError(message);
        } finally {
            setInlineSavingKey(null);
        }
    };

    const openEdit = (row: FieldDef) => {
        setEditRow(row);
        setEditLabel(row.label ?? "");
        setEditDescription(row.description ?? "");
        setEditRequired(row.is_required);
        if (policySettingsSupported) {
            const view = buildFieldPolicySettingsViewsForList(entityType, [
                {
                    field_key: row.field_key,
                    is_system: row.is_system,
                    is_required: row.is_required,
                    requirement_policy: row.requirement_policy,
                    interaction_policy: row.interaction_policy,
                },
            ]).get(row.field_key);
            setEditPolicyView(view ?? null);
            if (view?.policyEditable) {
                const parsed = parseStoredPoliciesForEdit({
                    field_key: row.field_key,
                    is_system: row.is_system,
                    is_required: row.is_required,
                    requirement_policy: row.requirement_policy,
                    interaction_policy: row.interaction_policy,
                });
                const reqPreset = requirementPresetFromPolicy(parsed.requirementPolicy) ?? (row.is_required ? "required" : "optional");
                const intPreset =
                    interactionPresetFromPolicy(parsed.interactionPolicy) ?? "editable";
                setEditRequirementPreset(reqPreset);
                setEditInteractionPreset(intPreset);
            } else {
                setEditRequirementPreset(row.is_required ? "required" : "optional");
                setEditInteractionPreset("editable");
            }
        } else {
            setEditPolicyView(null);
        }
        setEditActive(row.is_active);
        setEditVisibleForm(row.is_visible_in_form);
        setEditVisibleDrawer(row.is_visible_in_drawer);
        setEditVisibleTable(row.is_visible_in_table);
        setEditFilterable(row.is_filterable);
        setEditSortable(row.is_sortable);
        setEditSectionKey(row.section_key ?? "");
        setEditSortOrder(row.sort_order);
        setEditPlaceholder(row.placeholder ?? "");
        setEditHelpText(row.help_text ?? "");
        setEditOptionSetKey(getOptionSetKeyFromConfig(row.config));
        setEditError(null);
        setEditOpen(true);
    };

    const saveEdit = async () => {
        if (!canMutate || !editRow) return;
        setEditSaving(true);
        setEditError(null);
        try {
            const body: Record<string, unknown> = {
                label: editLabel.trim() || null,
                description: editDescription.trim() || null,
                is_active: editActive,
                is_visible_in_form: editVisibleForm,
                is_visible_in_drawer: editVisibleDrawer,
                is_visible_in_table: editVisibleTable,
                is_filterable: editFilterable,
                is_sortable: editSortable,
                section_key: editSectionKey.trim() || "custom",
                sort_order: editSortOrder,
                placeholder: editPlaceholder.trim() || null,
                help_text: editHelpText.trim() || null,
            };
            if (
                shouldIncludeConfigOnFieldDefinitionPatch({
                    fieldType: editRow.field_type,
                    existingConfig: editRow.config,
                    optionSetKey: editOptionSetKey,
                })
            ) {
                body.config = buildConfigWithOptionSetKey(editRow.config, editOptionSetKey);
            }
            if (
                policySettingsSupported &&
                !layoutBehaviorOnRecordLayouts &&
                editPolicyView?.policyEditable &&
                !editPolicyView.requirementAdvanced &&
                !editPolicyView.interactionAdvanced
            ) {
                body.requirement_policy = buildSimpleRequirementPolicy(editRequirementPreset);
                body.interaction_policy = buildSimpleInteractionPolicy(
                    editInteractionPreset,
                    entityType,
                    editRow.field_key
                );
            } else if (!policySettingsSupported) {
                body.is_required = editRequired;
            }
            const res = await fetch(`/api/admin/field-definitions/${editRow.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setEditOpen(false);
            setEditRow(null);
            await fetchItems();
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteRow = async (row: FieldDef) => {
        if (!canMutate || row.is_system) return;
        setDeleteError(null);
        if (!window.confirm(`Delete custom field "${row.field_key}"? Stored values for this field will be removed.`)) return;
        setDeleteSavingId(row.id);
        try {
            const res = await fetch(`/api/admin/field-definitions/${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Delete failed");
            await fetchItems();
        } catch (e) {
            setDeleteError((e as Error).message);
        } finally {
            setDeleteSavingId(null);
        }
    };

    const openCreate = () => {
        setCreateKey("");
        setCreateLabel("");
        setCreateDescription("");
        setCreateFieldType("text");
        setCreateSectionKey("custom");
        setCreateSortOrder(100);
        setCreateRequired(false);
        setCreateVisibleForm(true);
        setCreateVisibleDrawer(true);
        setCreateVisibleTable(true);
        setCreateFilterable(false);
        setCreateSortable(false);
        setCreatePlaceholder("");
        setCreateHelpText("");
        setCreateOptionSetKey("");
        setCreateError(null);
        createKeyManuallyEditedRef.current = false;
        setCreateOpen(true);
    };

    useEffect(() => {
        if (!createOpen || createKeyManuallyEditedRef.current) return;
        const slug = slugifyLabel(createLabel);
        if (slug.length >= 2) setCreateKey(slug);
    }, [createOpen, createLabel]);

    const ensurePlacementField = async (template: ConfigurablePlacementFieldTemplate) => {
        if (!canMutate) return;
        setEnsureSavingKey(template.field_key);
        setEnsureError(null);
        try {
            const res = await fetch("/api/admin/field-definitions/ensure-platform-field", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: template.entity_type,
                    field_key: template.field_key,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not add field");
            await fetchItems();
        } catch (e) {
            setEnsureError((e as Error).message);
        } finally {
            setEnsureSavingKey(null);
        }
    };

    const saveCreate = async () => {
        if (!canMutate) return;
        const key = createKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!key || key.length < 2) {
            setCreateError("field_key must be at least 2 characters (letters, numbers, underscores).");
            return;
        }
        if (!/^[a-z0-9_]{2,64}$/.test(key)) {
            setCreateError("field_key: lowercase letters, numbers, underscores only, 2–64 characters.");
            return;
        }
        setCreateSaving(true);
        setCreateError(null);
        try {
            const payload: Record<string, unknown> = {
                entity_type: entityType,
                field_key: key,
                label: createLabel.trim() || key,
                description: createDescription.trim() || null,
                field_type: createFieldType,
                section_key: createSectionKey.trim() || "custom",
                sort_order: createSortOrder,
                is_required: createRequired,
                is_visible_in_form: createVisibleForm,
                is_visible_in_drawer: createVisibleDrawer,
                is_visible_in_table: createVisibleTable,
                is_filterable: createFilterable,
                is_sortable: createSortable,
                placeholder: createPlaceholder.trim() || null,
                help_text: createHelpText.trim() || null,
            };
            if (isSelectLikeFieldType(createFieldType)) {
                payload.config = buildConfigWithOptionSetKey(null, createOptionSetKey);
            }
            const res = await fetch("/api/admin/field-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setCreateError((json as { error?: string }).error ?? "Key already exists.");
                return;
            }
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            setCreateOpen(false);
            await fetchItems();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    const defaultSubtitle = `Labels, visibility, and required rules for ${title.toLowerCase().replace(/\s+fields$/, "")} fields.`;
    const resolvedSubtitle = subtitle ?? defaultSubtitle;
    const compactDescription =
        subtitle ??
        "Set how fields read in the product, where they appear, and whether staff must fill them in. For drawer section order, use Record layouts.";

    const addFieldButton = canMutate ? (
        <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
            Add custom field
        </button>
    ) : null;

    return (
        <>
            {adminV2Chrome && !hideSettingsHeader ? (
                <SettingsPageHeader title={title} subtitle={compactDescription} actions={addFieldButton} />
            ) : adminV2Chrome ? (
                addFieldButton ? (
                    <div className="mb-3 flex flex-wrap justify-end gap-2">{addFieldButton}</div>
                ) : null
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <AdminPageHeader title={title} subtitle={resolvedSubtitle} />
                    {addFieldButton}
                </div>
            )}

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {!loading && !error && adminV2Chrome ? (
                <div className="min-w-0 space-y-4" data-testid="fields-entity-workspace">
                    {ensureError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {ensureError}
                        </div>
                    )}
                    {canMutate && missingPlacementTemplates.length > 0 && (
                        <div
                            className="mb-4 rounded-md border border-alloy-pine/20 bg-alloy-pine/[0.04] px-3 py-3"
                            data-testid="placement-field-templates-panel"
                        >
                            <p className="text-xs font-semibold text-alloy-midnight">Placement fields</p>
                            <p className="mt-0.5 text-xs text-alloy-midnight/60">
                                Add School, Program, and Room as configurable reference fields with cascade behavior.
                            </p>
                            <ul className="mt-2 space-y-2">
                                {missingPlacementTemplates.map((template) => (
                                    <li
                                        key={`${template.entity_type}:${template.field_key}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                    >
                                        <span>
                                            <span className="font-medium text-alloy-midnight">{template.operator_label}</span>
                                            <span className="ml-2 text-xs text-alloy-midnight/50">{template.description}</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void ensurePlacementField(template)}
                                            disabled={ensureSavingKey === template.field_key}
                                            className="shrink-0 rounded border border-alloy-pine/35 px-2 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/10 disabled:opacity-50"
                                        >
                                            {ensureSavingKey === template.field_key ? "Adding…" : "Add field"}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {deleteError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{deleteError}</div>
                    )}
                    {inlineSaveError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{inlineSaveError}</div>
                    )}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-alloy-midnight/55">
                        <span>
                            {displayFieldCount} field{displayFieldCount === 1 ? "" : "s"}
                            {hiddenFieldCount > 0 && !showSystemFields
                                ? ` (${hiddenFieldCount} workflow or relationship field${hiddenFieldCount === 1 ? "" : "s"} hidden)`
                                : ""}
                        </span>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={showSystemFields}
                                onChange={(e) => setShowSystemFields(e.target.checked)}
                                className="rounded border-alloy-stone/50"
                            />
                            Show workflow and relationship fields
                        </label>
                    </div>
                    <FieldsGroupedEntityPanel
                        entityLabel={title.replace(/\s+fields$/i, "")}
                        entityDescription={fieldsEntityDescription(entityType)}
                        sections={fieldsSectionGroups}
                        canMutate={canMutate}
                        onEdit={openEdit}
                        onDelete={deleteRow}
                        deleteSavingId={deleteSavingId}
                    />
                    <p className="text-xs text-alloy-midnight/45">
                        {layoutBehaviorOnRecordLayouts ? (
                            <>
                                Drawer required and read-only behavior are on{" "}
                                <Link
                                    href={recordLayoutsSettingsHref(entityType)}
                                    className="font-medium text-alloy-pine hover:underline"
                                >
                                    Record layouts
                                </Link>
                                . Section order and field placement are there too.
                            </>
                        ) : (
                            <>
                                Drawer section order and visibility are on{" "}
                                <Link href={adminSettingsSubpathHref("layouts")} className="font-medium text-alloy-pine hover:underline">
                                    Record layouts
                                </Link>
                                .
                            </>
                        )}{" "}
                        Catalog group labels are on{" "}
                        <Link href={adminSettingsSubpathHref("field-sections")} className="font-medium text-alloy-pine hover:underline">
                            Field grouping
                        </Link>
                        .
                    </p>
                </div>
            ) : !loading && !error ? (
                <SectionCard title={`${title} definitions`} surfaceTone="default">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Field</th>
                                    {showRequiredColumn ? (
                                        <th className="pb-2 pr-4 font-semibold">Required</th>
                                    ) : null}
                                    {showPolicyColumnsInTable ? (
                                        <th className="pb-2 pr-4 font-semibold">Editability</th>
                                    ) : null}
                                    <th className="pb-2 pr-4 font-semibold">Shows in</th>
                                    {canMutate && <th className="pb-2 font-semibold"> </th>}
                                </tr>
                            </thead>
                            <tbody>
                                {visibleItems.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={
                                                1 +
                                                (showRequiredColumn ? 1 : 0) +
                                                (showPolicyColumnsInTable ? 1 : 0) +
                                                1 +
                                                (canMutate ? 1 : 0)
                                            }
                                            className="py-4 text-[#59678b]"
                                        >
                                            {sortedItems.length === 0
                                                ? "No fields yet. Add a field or show workflow and relationship fields."
                                                : "No fields match this filter. Try showing workflow and relationship fields."}
                                        </td>
                                    </tr>
                                ) : (
                                    visibleItems.map((row) => {
                                        const policyView = policyViewsByFieldKey.get(row.field_key);
                                        const displayLabel = operatorFieldDisplayLabel(entityType, {
                                            field_key: row.field_key,
                                            is_system: row.is_system,
                                            label: row.label,
                                        });
                                        const showsIn = [
                                            row.is_visible_in_drawer ? "Drawer" : null,
                                            row.is_visible_in_form ? "Forms" : null,
                                            row.is_visible_in_table ? "Lists" : null,
                                        ]
                                            .filter(Boolean)
                                            .join(", ");
                                        return (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2.5 pr-4">
                                                <div className="font-medium text-[#31394d]">{displayLabel}</div>
                                            </td>
                                            {showRequiredColumn ? (
                                                <td className="py-2.5 pr-4">
                                                    <FieldRequiredInlineCell
                                                        entityType={entityType}
                                                        row={row}
                                                        policyView={policyView ?? null}
                                                        canMutate={canMutate}
                                                        displayLabel={displayLabel}
                                                        presetOverride={inlinePresetOverrides[row.field_key]}
                                                        saving={inlineSavingKey === row.field_key}
                                                        saved={inlineSavedKey === row.field_key}
                                                        rowError={inlineRowErrors[row.field_key]}
                                                        onPresetChange={(preset) => void patchRequirementInline(row, preset)}
                                                    />
                                                </td>
                                            ) : null}
                                            {showPolicyColumnsInTable ? (
                                                <td className="py-2.5 pr-4 text-[#59678b]">
                                                    {policyView?.interactionPreset === "read_only"
                                                        ? "Read-only"
                                                        : policyView?.policyEditable
                                                          ? "Staff can edit"
                                                          : "Managed elsewhere"}
                                                </td>
                                            ) : null}
                                            <td className="py-2.5 pr-4 text-[#59678b]">{showsIn || "Hidden"}</td>
                                            {canMutate && (
                                                <td className="py-2.5 text-right">
                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEdit(row)}
                                                            className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                        >
                                                            Edit
                                                        </button>
                                                        {!row.is_system && (
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteRow(row)}
                                                                disabled={deleteSavingId === row.id}
                                                                className="rounded border border-alloy-ember/40 px-2 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/10 disabled:opacity-50"
                                                            >
                                                                {deleteSavingId === row.id ? "…" : "Delete"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            ) : null}

            <FieldDefinitionEditModal
                open={editOpen && editRow != null}
                saving={editSaving}
                canMutate={canMutate}
                entityType={editRow?.entity_type ?? entityType}
                entityTitle={title}
                row={editRow!}
                policySettingsSupported={policySettingsSupported}
                policyView={editPolicyView}
                sectionOptions={sectionOptions}
                editLabel={editLabel}
                setEditLabel={setEditLabel}
                editHelpText={editHelpText}
                setEditHelpText={setEditHelpText}
                editRequired={editRequired}
                setEditRequired={setEditRequired}
                editInteractionPreset={editInteractionPreset}
                setEditInteractionPreset={setEditInteractionPreset}
                editVisibleDrawer={editVisibleDrawer}
                setEditVisibleDrawer={setEditVisibleDrawer}
                editVisibleForm={editVisibleForm}
                setEditVisibleForm={setEditVisibleForm}
                editVisibleTable={editVisibleTable}
                setEditVisibleTable={setEditVisibleTable}
                editSectionKey={editSectionKey}
                setEditSectionKey={setEditSectionKey}
                editSortOrder={editSortOrder}
                setEditSortOrder={setEditSortOrder}
                editError={editError}
                onClose={() => !editSaving && setEditOpen(false)}
                onSave={() => void saveEdit()}
            />

            {createOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !createSaving && setCreateOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">Add custom {title.toLowerCase().replace(/\s+fields$/, "")} field</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Label</label>
                                <input
                                    type="text"
                                    value={createLabel}
                                    onChange={(e) => setCreateLabel(e.target.value)}
                                    placeholder="e.g. Dog Owners"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                                <p className="mt-0.5 text-xs text-[#59678b]">Display name. Field key is generated below and can be edited.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Field key</label>
                                <input
                                    type="text"
                                    value={createKey}
                                    onChange={(e) => {
                                        createKeyManuallyEditedRef.current = true;
                                        setCreateKey(e.target.value);
                                    }}
                                    placeholder="e.g. dog_owners"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm font-mono"
                                />
                                <p className="mt-0.5 text-xs text-[#59678b]">Lowercase letters, numbers, underscores only. 2–64 chars. Auto-generated from label unless edited.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Description</label>
                                <input
                                    type="text"
                                    value={createDescription}
                                    onChange={(e) => setCreateDescription(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Field type</label>
                                <select
                                    value={createFieldType}
                                    onChange={(e) => setCreateFieldType(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                >
                                    {FIELD_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Section</label>
                                    <select
                                        value={
                                            sectionKeyInOptions(sectionOptions, createSectionKey)
                                                ? createSectionKey
                                                : (sectionOptions[0]?.value ?? "custom")
                                        }
                                        onChange={(e) => setCreateSectionKey(e.target.value)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    >
                                        {sectionOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Sort order</label>
                                    <input
                                        type="number"
                                        value={createSortOrder}
                                        onChange={(e) => setCreateSortOrder(Number(e.target.value) || 0)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createRequired} onChange={(e) => setCreateRequired(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Required
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleForm} onChange={(e) => setCreateVisibleForm(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Form
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleDrawer} onChange={(e) => setCreateVisibleDrawer(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Drawer
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleTable} onChange={(e) => setCreateVisibleTable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Table
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createFilterable} onChange={(e) => setCreateFilterable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Filterable
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createSortable} onChange={(e) => setCreateSortable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Sortable
                                </label>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Placeholder</label>
                                <input
                                    type="text"
                                    value={createPlaceholder}
                                    onChange={(e) => setCreatePlaceholder(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Help text</label>
                                <input
                                    type="text"
                                    value={createHelpText}
                                    onChange={(e) => setCreateHelpText(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {isSelectLikeFieldType(createFieldType) && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Option set</label>
                                    <OptionSetKeyPicker
                                        value={createOptionSetKey}
                                        onChange={setCreateOptionSetKey}
                                        disabled={!canMutate || createSaving}
                                        manageOptionSetsHref={manageOptionSetsHref}
                                    />
                                </div>
                            )}
                        </div>
                        {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !createSaving && setCreateOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveCreate}
                                disabled={createSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {createSaving ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
