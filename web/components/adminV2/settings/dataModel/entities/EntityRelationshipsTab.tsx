"use client";

/**
 * Entity → Relationships. Collection → selected relationship, in place.
 *
 * Two kinds of row live here and they have genuinely different authority:
 *
 * - **Platform connections** are compiled edges from `entityRelationshipCatalog`.
 *   Cardinality and storage are Alloy's, so Definition renders protected rather
 *   than offering an edit affordance that could not persist.
 * - **Your relationship terms** are tenant rows behind the role-type APIs
 *   (`customer-person-role-types`, `person-relationship-type-settings`). Those are
 *   editable, and new ones can be created without leaving the Entity.
 *
 * The vocabulary rows are fetched client-side on mount because they are org-wide
 * rather than per-entity, and are held in `entity.relationshipVocabulary` so the
 * `structure.relationshipsTotal` count keeps meaning "platform edges".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { EntitySurfacesUsageCard } from "@/components/adminV2/settings/dataModel/entities/EntitySurfacesUsageCard";
import {
    ENTITY_CHILD_DETAIL_TABS,
    entitySupportsRelationshipVocabulary,
    relationshipVocabularyEndpoint,
    withRelationshipVocabulary,
    type EntityChildDetailTabKey,
    type EntityRelationshipSummaryVm,
    type EntityRelationshipVocabularyKind,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";
import { RELATIONSHIP_KIND_OPERATOR_OPTIONS, slugifyOperatorKey } from "@/lib/fields/dataModelWorkspaceOperatorUi";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

const VOCABULARY_KIND_LABEL: Record<EntityRelationshipVocabularyKind, string> = {
    family_role: "Family role",
    person_relationship: "Person connection",
};

function parseItems<T>(json: unknown): T[] {
    if (!json || typeof json !== "object") return [];
    const root = json as Record<string, unknown>;
    const data = root.data;
    if (data && typeof data === "object") {
        const items = (data as { items?: unknown }).items;
        if (Array.isArray(items)) return items as T[];
    }
    const items = root.items;
    if (Array.isArray(items)) return items as T[];
    return [];
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{label}</dt>
            <dd className="mt-0.5 text-alloy-midnight">{value}</dd>
        </div>
    );
}

function RelationshipDetail({
    relationship,
    entityName,
    canMutate,
    configLocked,
    onSaved,
    testId,
}: {
    relationship: EntityRelationshipSummaryVm;
    entityName: string;
    canMutate: boolean;
    configLocked: boolean;
    onSaved: (next: EntityRelationshipSummaryVm) => void;
    testId: string;
}) {
    const [activeTab, setActiveTab] = useState<EntityChildDetailTabKey>("definition");
    const [label, setLabel] = useState(relationship.label);
    const [description, setDescription] = useState(relationship.description ?? "");
    const [active, setActive] = useState(relationship.isActive);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    useEffect(() => {
        setActiveTab("definition");
        setLabel(relationship.label);
        setDescription(relationship.description ?? "");
        setActive(relationship.isActive);
        setError(null);
        setSaved(false);
        setAdvancedOpen(false);
    }, [relationship.id, relationship.label, relationship.description, relationship.isActive]);

    const editable =
        canMutate &&
        !configLocked &&
        relationship.source === "organization_vocabulary" &&
        relationship.vocabularyKind != null &&
        relationship.vocabularyRowId != null;

    const dirty =
        label.trim() !== relationship.label ||
        (description.trim() || null) !== (relationship.description ?? null) ||
        active !== relationship.isActive;

    const save = async () => {
        if (!editable || !relationship.vocabularyKind || !relationship.vocabularyRowId) return;
        if (!label.trim()) {
            setError("Name is required.");
            return;
        }
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch(
                `${relationshipVocabularyEndpoint(relationship.vocabularyKind)}/${relationship.vocabularyRowId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label: label.trim(),
                        description: description.trim() || null,
                        is_active: active,
                    }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            onSaved({
                ...relationship,
                label: label.trim(),
                description: description.trim() || null,
                isActive: active,
            });
            setSaved(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid={testId} data-relationship-id={relationship.id}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                    {entityName} relationship
                </p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">{relationship.label}</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    {relationship.connectionLabel}
                    {relationship.source === "platform_edge" ? ` · → ${relationship.targetLabel}` : ""}
                    {relationship.isActive ? "" : " · Inactive"}
                </p>
            </header>

            <ConfigWorkspaceTabBar<EntityChildDetailTabKey>
                tabs={ENTITY_CHILD_DETAIL_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Relationship details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-3" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "definition" ?
                    <ConfigWorkspaceCard title="Definition" compact>
                        {editable ?
                            <div className="space-y-2.5">
                                <p className="text-[12px] leading-5 text-alloy-midnight/70">
                                    {relationship.description ?? relationship.meaning}
                                </p>
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Name
                                    </span>
                                    <input
                                        value={label}
                                        onChange={(event) => setLabel(event.target.value)}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                        data-testid={`${testId}-label-input`}
                                    />
                                </label>
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Description
                                    </span>
                                    <textarea
                                        value={description}
                                        onChange={(event) => setDescription(event.target.value)}
                                        rows={2}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                        data-testid={`${testId}-description-input`}
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={(event) => setActive(event.target.checked)}
                                        data-testid={`${testId}-active-input`}
                                    />
                                    Active — staff can choose this relationship
                                </label>
                                {error ?
                                    <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                                        {error}
                                    </p>
                                :   null}
                                <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                                    <button
                                        type="button"
                                        disabled={saving || !dirty}
                                        onClick={() => void save()}
                                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                        data-testid={`${testId}-save`}
                                    >
                                        {saving ? "Saving…" : "Save Relationship"}
                                    </button>
                                    {saved && !dirty ?
                                        <span className="text-[11px] text-[#007d68]" data-testid={`${testId}-saved`}>
                                            Saved
                                        </span>
                                    :   null}
                                </div>
                            </div>

                        :   <>
                                <dl className="grid grid-cols-2 gap-2.5 text-[12px]">
                                    <Fact label="Target" value={relationship.targetLabel} />
                                    <Fact label="Cardinality" value={relationship.cardinality} />
                                    <Fact label="Required" value={relationship.required ? "Yes" : "No"} />
                                    <Fact
                                        label="Owner"
                                        value={relationship.kind === "platform" ? "Platform" : "Organization"}
                                    />
                                </dl>
                                <p
                                    className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                    data-testid={`${testId}-protected`}
                                >
                                    {relationship.source === "platform_edge" ?
                                        "Platform connection — how these records link is owned by Alloy and is not operator-configurable."
                                    : configLocked ?
                                        "Configuration is locked for this organization."
                                    :   "You do not have permission to change relationships."}
                                </p>
                            </>
                        }

                        {relationship.source === "organization_vocabulary" ?
                            <div className="mt-3 border-t border-alloy-stone/20 pt-2.5">
                                <ConfigurationAdvancedToggle
                                    open={advancedOpen}
                                    onToggle={() => setAdvancedOpen((open) => !open)}
                                />
                                {advancedOpen ?
                                    <dl className="mt-2" data-testid={`${testId}-advanced`}>
                                        <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                            Internal reference
                                        </dt>
                                        <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight/70">
                                            {relationship.id}
                                        </dd>
                                    </dl>
                                :   null}
                            </div>
                        :   null}
                    </ConfigWorkspaceCard>
                : activeTab === "usage" ?
                    <EntitySurfacesUsageCard
                        title="Where this connection is used"
                        testId={`${testId}-usage`}
                    />
                :   <ConfigWorkspaceCard title="History" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/55">
                            {relationship.source === "platform_edge" ?
                                "Platform connections ship with Alloy, so there is no organization change history to show."
                            :   "Change history for relationship terms is planned but not wired yet."}
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}

function RelationshipCreatePanel({
    entityName,
    defaultKind,
    onCancel,
    onCreated,
    testId,
}: {
    entityName: string;
    defaultKind: EntityRelationshipVocabularyKind;
    onCancel: () => void;
    onCreated: (created: EntityRelationshipSummaryVm) => void;
    testId: string;
}) {
    const [kind, setKind] = useState<EntityRelationshipVocabularyKind>(defaultKind);
    const [label, setLabel] = useState("");
    const [key, setKey] = useState("");
    const keyTouched = useRef(false);
    const [description, setDescription] = useState("");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (keyTouched.current) return;
        setKey(slugifyOperatorKey(label));
    }, [label]);

    const create = async () => {
        const normalizedKey = key.trim().toLowerCase();
        if (!label.trim()) {
            setError("Name is required.");
            return;
        }
        if (!KEY_REGEX.test(normalizedKey)) {
            setError("Could not derive a valid internal reference from this name.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(relationshipVocabularyEndpoint(kind), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: normalizedKey,
                    label: label.trim(),
                    description: description.trim() || null,
                    sort_order: 100,
                    is_active: true,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string | { message?: string };
                data?: { id?: string };
                id?: string;
            };
            if (res.status === 409) {
                setError("A relationship with this name already exists.");
                return;
            }
            if (!res.ok) {
                const raw = json.error;
                const message = typeof raw === "string" ? raw : raw?.message;
                throw new Error(message ?? "Could not create relationship.");
            }
            const rowId = json.data?.id ?? json.id ?? normalizedKey;
            onCreated({
                id: `vocabulary:${kind}:${normalizedKey}`,
                label: label.trim(),
                connectionLabel: VOCABULARY_KIND_LABEL[kind],
                meaning:
                    kind === "family_role" ?
                        "A role a person can hold in a family."
                    :   "A way one person can be connected to another.",
                targetLabel: kind === "family_role" ? "Family" : "Person",
                cardinality: "Vocabulary term",
                required: false,
                roleNote: null,
                kind: "custom",
                whereUsed: ["Forms", "Record drawers"],
                source: "organization_vocabulary",
                vocabularyKind: kind,
                vocabularyRowId: rowId,
                description: description.trim() || null,
                isActive: true,
            });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid={testId}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                    {entityName} relationship
                </p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">New relationship</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    Adds a term your staff can choose. It does not change how records link together.
                </p>
            </header>

            <ConfigWorkspaceCard title="Definition" compact>
                <div className="space-y-2.5">
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Kind
                        </span>
                        <select
                            value={kind}
                            onChange={(event) =>
                                setKind(event.target.value as EntityRelationshipVocabularyKind)
                            }
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid={`${testId}-kind`}
                        >
                            {RELATIONSHIP_KIND_OPERATOR_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] leading-snug text-alloy-midnight/45">
                            {RELATIONSHIP_KIND_OPERATOR_OPTIONS.find((option) => option.value === kind)?.hint}
                        </p>
                    </label>
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Name
                        </span>
                        <input
                            autoFocus
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            placeholder={kind === "family_role" ? "e.g. Authorized pickup" : "e.g. Grandparent"}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid={`${testId}-label`}
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Description
                        </span>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={2}
                            placeholder="When staff should use this relationship"
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid={`${testId}-description`}
                        />
                    </label>

                    <div>
                        <ConfigurationAdvancedToggle
                            open={advancedOpen}
                            onToggle={() => setAdvancedOpen((open) => !open)}
                        />
                        {advancedOpen ?
                            <label className="mt-2 block space-y-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Internal reference
                                </span>
                                <input
                                    value={key}
                                    onChange={(event) => {
                                        keyTouched.current = true;
                                        setKey(event.target.value);
                                    }}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-sm"
                                    data-testid={`${testId}-key`}
                                />
                                <span className="text-[10px] text-alloy-midnight/40">Generated from the name.</span>
                            </label>
                        :   null}
                    </div>

                    {error ?
                        <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                            {error}
                        </p>
                    :   null}

                    <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => void create()}
                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            data-testid={`${testId}-submit`}
                        >
                            {saving ? "Creating…" : "Create Relationship"}
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1.5 text-[11px] font-medium text-alloy-midnight/70"
                            data-testid={`${testId}-cancel`}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </ConfigWorkspaceCard>
        </div>
    );
}

function ListGroup({
    title,
    rows,
    selectedId,
    onSelect,
    testId,
}: {
    title: string;
    rows: readonly EntityRelationshipSummaryVm[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    testId: string;
}) {
    if (rows.length === 0) return null;
    return (
        <div className="space-y-0.5" data-testid={testId}>
            <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/35">
                {title}
            </p>
            <ul className="space-y-0.5">
                {rows.map((rel) => {
                    const active = rel.id === selectedId;
                    return (
                        <li key={rel.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(rel.id)}
                                aria-current={active ? "true" : undefined}
                                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                                    active ?
                                        "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine"
                                    :   "text-alloy-midnight hover:bg-alloy-stone/20"
                                } ${rel.isActive ? "" : "opacity-55"}`}
                                data-testid={`${testId}-item-${rel.id}`}
                            >
                                <span className={`block truncate text-[12px] ${active ? "font-semibold" : ""}`}>
                                    {rel.label}
                                </span>
                                <span className="block text-[10px] text-alloy-midnight/45">
                                    {rel.cardinality}
                                    {rel.required ? " · required" : ""}
                                    {rel.isActive ? "" : " · inactive"}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function EntityRelationshipsTab({
    entity,
    canMutate,
    configLocked,
    onEntityChanged,
    testId = "entity-relationships-tab",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    onEntityChanged: (entity: EntityWorkspaceVm) => void;
    testId?: string;
}) {
    const vocabularySupport = entitySupportsRelationshipVocabulary(entity.hubKey);
    const [selectedId, setSelectedId] = useState<string | null>(entity.relationships[0]?.id ?? null);
    const [creating, setCreating] = useState(false);
    const [vocabularyLoaded, setVocabularyLoaded] = useState(!vocabularySupport);

    const loadVocabulary = useCallback(async () => {
        try {
            const [rolesRes, personRes] = await Promise.all([
                fetch("/api/admin/customer-person-role-types?all=true"),
                fetch("/api/admin/person-relationship-type-settings?all=true"),
            ]);
            const rolesJson = await rolesRes.json().catch(() => ({}));
            const personJson = await personRes.json().catch(() => ({}));
            type Row = {
                id: string;
                key: string;
                label: string | null;
                description: string | null;
                is_system?: boolean;
                is_active?: boolean;
            };
            const rows: EntityRelationshipSummaryVm[] = [];
            const push = (row: Row, kind: EntityRelationshipVocabularyKind) => {
                if (row.is_system) return;
                rows.push({
                    id: `vocabulary:${kind}:${row.key}`,
                    label: row.label ?? row.key,
                    connectionLabel: VOCABULARY_KIND_LABEL[kind],
                    meaning:
                        kind === "family_role" ?
                            "A role a person can hold in a family."
                        :   "A way one person can be connected to another.",
                    targetLabel: kind === "family_role" ? "Family" : "Person",
                    cardinality: "Vocabulary term",
                    required: false,
                    roleNote: null,
                    kind: "custom",
                    whereUsed: ["Forms", "Record drawers"],
                    source: "organization_vocabulary",
                    vocabularyKind: kind,
                    vocabularyRowId: row.id,
                    description: row.description,
                    isActive: row.is_active !== false,
                });
            };
            for (const row of parseItems<Row>(rolesJson)) push(row, "family_role");
            for (const row of parseItems<Row>(personJson)) push(row, "person_relationship");
            onEntityChanged(withRelationshipVocabulary(entity, rows));
        } catch {
            /* vocabulary is supplemental; platform edges still render */
        } finally {
            setVocabularyLoaded(true);
        }
        // `entity` is intentionally read at call time, not tracked, so the fetch
        // does not re-run every time an unrelated slice of the VM changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!vocabularySupport || vocabularyLoaded) return;
        void loadVocabulary();
    }, [vocabularySupport, vocabularyLoaded, loadVocabulary]);

    const vocabulary = entity.relationshipVocabulary;
    const allRows = [...entity.relationships, ...vocabulary];
    const selected = allRows.find((rel) => rel.id === selectedId) ?? allRows[0] ?? null;
    const canCreate = vocabularySupport && canMutate && !configLocked;

    const applySavedRow = (next: EntityRelationshipSummaryVm) => {
        onEntityChanged(
            withRelationshipVocabulary(
                entity,
                vocabulary.map((row) => (row.id === next.id ? next : row)),
            ),
        );
    };

    return (
        <ConfigChildObjectMasterDetail
            testId={testId}
            listTitle="Relationships"
            listSummary={`${entity.relationships.length} platform connection${
                entity.relationships.length === 1 ? "" : "s"
            }${vocabulary.length > 0 ? ` · ${vocabulary.length} of your terms` : ""}`}
            listActions={
                canCreate ?
                    <button
                        type="button"
                        onClick={() => {
                            setCreating(true);
                            setSelectedId(null);
                        }}
                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2 py-1 text-[10px] font-semibold text-white"
                        data-testid={`${testId}-new`}
                    >
                        New Relationship
                    </button>
                :   null
            }
            list={
                allRows.length > 0 ?
                    <div className="space-y-2" data-testid={`${testId}-list`}>
                        <ListGroup
                            title="Platform connections"
                            rows={entity.relationships}
                            selectedId={creating ? null : (selected?.id ?? null)}
                            onSelect={(id) => {
                                setCreating(false);
                                setSelectedId(id);
                            }}
                            testId={`${testId}-platform`}
                        />
                        <ListGroup
                            title="Your relationship terms"
                            rows={vocabulary}
                            selectedId={creating ? null : (selected?.id ?? null)}
                            onSelect={(id) => {
                                setCreating(false);
                                setSelectedId(id);
                            }}
                            testId={`${testId}-vocabulary`}
                        />
                    </div>
                :   <p className="px-2 py-4 text-center text-[11px] text-alloy-midnight/45">
                        No relationships are defined for {entity.displayName}.
                    </p>
            }
            detail={
                creating ?
                    <RelationshipCreatePanel
                        entityName={entity.displayName}
                        defaultKind={vocabularySupport === "person_relationship" ? "person_relationship" : "family_role"}
                        onCancel={() => setCreating(false)}
                        onCreated={(created) => {
                            onEntityChanged(withRelationshipVocabulary(entity, [...vocabulary, created]));
                            setCreating(false);
                            setSelectedId(created.id);
                        }}
                        testId={`${testId}-create`}
                    />
                : selected ?
                    <RelationshipDetail
                        relationship={selected}
                        entityName={entity.displayName}
                        canMutate={canMutate}
                        configLocked={configLocked}
                        onSaved={applySavedRow}
                        testId={`${testId}-detail`}
                    />
                :   <p className="text-[12px] text-alloy-midnight/45">
                        {entity.displayName} has no connections to other entities.
                    </p>
            }
        />
    );
}
