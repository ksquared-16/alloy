"use client";

/**
 * Non-production Configuration Object Runtime harness (Checkpoint C.5).
 *
 * Fixture-backed proof of collection, selection, overview, concerns, editing,
 * and optional lifecycle slots. Not registered on Organization nav routes.
 */

import { useCallback, useMemo, useState } from "react";
import { ConfigurationObjectWorkspace } from "@/components/adminV2/settings/configurationRuntime/object/ConfigurationObjectWorkspace";
import { ConfigurationObjectOverview } from "@/components/adminV2/settings/configurationRuntime/object/ConfigurationObjectOverview";
import { ConfigurationObjectEditGate } from "@/components/adminV2/settings/configurationRuntime/object/ConfigurationObjectEditGate";
import {
    ConfigHistoryTimeline,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    beginConfigurationObjectEdit,
    cancelConfigurationObjectEdit,
    completeConfigurationObjectSave,
    configurationObjectConcernHref,
    configurationObjectEditBlocksNavigation,
    createConfigurationObjectEditSession,
    failConfigurationObjectSave,
    harnessCollectionItems,
    harnessIdentity,
    harnessRecord,
    CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR,
    patchConfigurationObjectDraft,
    resolveActiveConfigurationObjectConcern,
    resolveConfigurationObjectSelection,
    visibleConfigurationObjectConcerns,
} from "@/lib/configRuntime/configurationObject";

export function ConfigurationObjectRuntimeHarness({
    initialObjectId = null,
    initialConcern = "overview",
}: {
    initialObjectId?: string | null;
    initialConcern?: string;
}) {
    const descriptor = CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR;
    const items = useMemo(() => harnessCollectionItems(), []);
    const validIds = useMemo(() => items.map((item) => item.id), [items]);
    const [selectedId, setSelectedId] = useState<string | null>(() => {
        return resolveConfigurationObjectSelection({
            routeObjectId: initialObjectId,
            retainedObjectId: null,
            validObjectIds: validIds,
        }).objectId;
    });
    const [activeConcern, setActiveConcern] = useState(() => {
        return resolveActiveConfigurationObjectConcern(descriptor, initialConcern).concern;
    });
    const [href, setHref] = useState(() =>
        selectedId ? configurationObjectConcernHref(descriptor, selectedId, activeConcern) : descriptor.basePath,
    );
    const [editSession, setEditSession] = useState(() =>
        createConfigurationObjectEditSession<{ label: string }>(null),
    );
    const [labels, setLabels] = useState<Record<string, string>>({});

    const identity = selectedId ? harnessIdentity(selectedId) : null;
    const record = selectedId ? harnessRecord(selectedId) : null;
    const displayName = selectedId ? (labels[selectedId] ?? identity?.displayName ?? "") : "";

    const concernTabs = useMemo(
        () =>
            visibleConfigurationObjectConcerns(descriptor.concerns).map((concern) => ({
                key: concern.key,
                label: concern.label,
            })),
        [descriptor.concerns],
    );

    const selectObject = useCallback(
        (id: string) => {
            if (configurationObjectEditBlocksNavigation(editSession)) {
                const leave = window.confirm("Discard unsaved changes?");
                if (!leave) return;
                setEditSession(cancelConfigurationObjectEdit(editSession));
            }
            setSelectedId(id);
            setActiveConcern(descriptor.defaultConcernKey);
            setHref(configurationObjectConcernHref(descriptor, id, descriptor.defaultConcernKey));
        },
        [descriptor, editSession],
    );

    const changeConcern = useCallback(
        (concern: string) => {
            if (!selectedId) return;
            if (configurationObjectEditBlocksNavigation(editSession)) {
                const leave = window.confirm("Discard unsaved changes?");
                if (!leave) return;
                setEditSession(cancelConfigurationObjectEdit(editSession));
            }
            const resolved = resolveActiveConfigurationObjectConcern(descriptor, concern);
            setActiveConcern(resolved.concern);
            setHref(configurationObjectConcernHref(descriptor, selectedId, resolved.concern));
        },
        [descriptor, editSession, selectedId],
    );

    const concernSurface = (() => {
        if (!selectedId || !record || !identity) return null;
        if (activeConcern === "overview") {
            return (
                <ConfigurationObjectOverview
                    regions={{
                        identity_and_state: (
                            <div>
                                <p className="config-typo-meta">Identity</p>
                                <p className="mt-1 text-lg font-semibold text-alloy-midnight">{displayName}</p>
                                <p className="config-typo-sublabel mt-1">{identity.secondaryIdentity}</p>
                            </div>
                        ),
                        summary: <p className="text-sm text-alloy-midnight/75">{record.summary}</p>,
                        attention:
                            record.status === "inactive" ?
                                <p className="text-sm text-alloy-ember">Inactive — review before publishing.</p>
                            :   <p className="text-sm text-alloy-bend-pine">No attention items.</p>,
                        key_relationships: (
                            <ul className="list-disc space-y-1 pl-4 text-sm text-alloy-midnight/75">
                                {record.related.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        ),
                        primary_action: (
                            <p className="text-sm text-alloy-midnight/70">Open Relationships or edit the label.</p>
                        ),
                    }}
                />
            );
        }
        if (activeConcern === "relationships") {
            return (
                <ConfigurationObjectEditGate
                    session={editSession}
                    onBeginEdit={() =>
                        setEditSession(
                            beginConfigurationObjectEdit(editSession, {
                                label: displayName,
                            }),
                        )
                    }
                    onCancel={() => setEditSession(cancelConfigurationObjectEdit(editSession))}
                    onSave={() => {
                        const draft = editSession.draft;
                        if (!draft?.label.trim()) {
                            setEditSession(
                                failConfigurationObjectSave(editSession, "Label is required.", [
                                    { field: "label", message: "Enter a display name." },
                                ]),
                            );
                            return;
                        }
                        setLabels((current) => ({ ...current, [selectedId]: draft.label.trim() }));
                        setEditSession(completeConfigurationObjectSave(editSession));
                    }}
                    readContent={
                        <ul className="space-y-2 text-sm text-alloy-midnight/75">
                            {record.related.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                            <li className="config-typo-meta">Display name: {displayName}</li>
                        </ul>
                    }
                    editContent={
                        <label className="block text-sm">
                            <span className="config-typo-field-label">Display name</span>
                            <input
                                className="config-runtime-input mt-1 w-full"
                                value={editSession.draft?.label ?? ""}
                                onChange={(event) =>
                                    setEditSession(
                                        patchConfigurationObjectDraft(editSession, {
                                            label: event.target.value,
                                        }),
                                    )
                                }
                                data-testid="configuration-object-harness-label-input"
                            />
                        </label>
                    }
                />
            );
        }
        if (activeConcern === "history") {
            return (
                <ConfigHistoryTimeline
                    entries={[
                        {
                            id: "h1",
                            occurredAt: "2026-07-21T10:00:00.000Z",
                            kind: "publication",
                            title: "Fixture created",
                            detail: "Harness object created for Checkpoint C.5 certification.",
                            tone: "good",
                        },
                    ]}
                />
            );
        }
        if (activeConcern === "publication") {
            return (
                <section className="process-config-setup-card p-4" data-testid="configuration-object-harness-publication">
                    <p className="config-typo-meta">Publication slot</p>
                    <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                        {record.status === "active" ? "Published revision available" : "Draft only"}
                    </p>
                    <p className="config-typo-sublabel mt-1">
                        Domains own publication semantics; the Object Runtime only composes the slot.
                    </p>
                </section>
            );
        }
        return (
            <p className="config-typo-sublabel" data-testid="configuration-object-harness-empty-concern">
                Concern unavailable.
            </p>
        );
    })();

    return (
        <div data-testid="configuration-object-runtime-harness" data-href={href}>
            <ConfigurationObjectWorkspace
                collectionTitle={descriptor.collectionLabel}
                objectLabel={descriptor.objectTypeLabel}
                items={items.map((item) => ({
                    id: item.id,
                    label: labels[item.id] ?? item.label,
                    supportingLabel: item.supportingLabel ?? undefined,
                    lifecycleStatus: item.lifecycleStatus,
                    publicationLabel: item.publicationLabel ?? "Not published",
                    publicationState:
                        item.publicationState === "published"
                            ? ("published" as const)
                        : item.publicationState === "changes_ready"
                            ? ("changes_ready" as const)
                        : ("draft_only" as const),
                    assignmentLabel: item.assignmentLabel ?? undefined,
                    isAssigned: item.isAssigned,
                    hasAttention: false,
                }))}
                selectedId={selectedId}
                canAdd={false}
                onAdd={() => undefined}
                onSelect={selectObject}
                identity={
                    identity && selectedId ?
                        { ...identity, displayName: labels[selectedId] ?? identity.displayName }
                    :   null
                }
                headerStatus={
                    record ?
                        {
                            label: record.status === "active" ? "Active" : "Inactive",
                            tone: record.status === "active" ? "active" : "inactive",
                        }
                    :   undefined
                }
                concernTabs={concernTabs}
                activeConcern={activeConcern}
                onConcernChange={changeConcern}
                testId="configuration-object-harness-workspace"
            >
                {concernSurface}
            </ConfigurationObjectWorkspace>
        </div>
    );
}
