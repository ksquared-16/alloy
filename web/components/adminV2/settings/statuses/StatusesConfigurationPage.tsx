"use client";

import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationPrimaryButton,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import StatusConfigurationDetailPanel from "@/components/adminV2/settings/statuses/StatusConfigurationDetailPanel";
import StatusCreateModal from "@/components/adminV2/settings/statuses/StatusCreateModal";
import { useStatusDefinitionsSettings } from "@/components/adminV2/settings/statuses/useStatusDefinitionsSettings";
import type { StatusRollupCategoryKey } from "@/lib/lifecycle/statusRollupV1";

const STATUSES_CONTEXT_SUBTITLE =
    "Manage status vocabulary. Stage assignment belongs in Processes.";

function defaultEntityTypeForCategory(key: StatusRollupCategoryKey): string {
    switch (key) {
        case "enrollment_statuses":
            return "opportunity_customer_members";
        case "lead_statuses":
            return "opportunities";
        case "person_statuses":
            return "persons";
        default:
            return "opportunities";
    }
}

export default function StatusesConfigurationPage() {
    const { canMutate } = useAdminAuth();
    const {
        loading,
        error,
        actionMessage,
        showInactive,
        setShowInactive,
        categoryGroups,
        selectedCategoryKey,
        setSelectedCategoryKey,
        selectedCategory,
        selectedStatusId,
        setSelectedStatusId,
        selectedStatus,
        patchStatus,
        refresh,
    } = useStatusDefinitionsSettings();

    const [createOpen, setCreateOpen] = useState(false);

    const contextActions = (
        <>
            <label className="flex items-center gap-2 text-xs text-alloy-forge/70">
                <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                    data-testid="status-settings-show-inactive"
                />
                Show inactive
            </label>
            {canMutate ?
                <ConfigurationPrimaryButton
                    className="config-primary-btn--sm"
                    data-testid="status-settings-new-status"
                    onClick={() => setCreateOpen(true)}
                >
                    New Status
                </ConfigurationPrimaryButton>
            :   null}
        </>
    );

    if (loading) {
        return (
            <div className="process-config-page" data-testid="statuses-configuration-page">
                <ConfigurationContext title="Statuses" subtitle={STATUSES_CONTEXT_SUBTITLE} actions={contextActions} />
                <p className="text-sm text-alloy-forge/70">Loading statuses…</p>
            </div>
        );
    }

    const categoryQueue = (
        <ConfigurationQueue testId="statuses-category-queue" title="Status groups">
            {categoryGroups.map((group) => (
                <ConfigurationQueueItem
                    key={group.category_key}
                    active={group.category_key === selectedCategoryKey}
                    title={group.label}
                    subtitle={`${group.statusDefs.length} statuses`}
                    onClick={() => {
                        setSelectedCategoryKey(group.category_key);
                        setSelectedStatusId(null);
                    }}
                    testId={`statuses-category-${group.category_key}`}
                />
            ))}
        </ConfigurationQueue>
    );

    const statusList =
        selectedCategory ?
            <ConfigurationQueue
                testId="statuses-status-list"
                title={selectedCategory.label}
                summary={selectedCategory.description}
            >
                {selectedCategory.statusDefs.length === 0 ?
                    <p className="text-xs text-alloy-forge/70">No statuses in this group yet.</p>
                :   selectedCategory.statusDefs.map((row) => (
                        <ConfigurationQueueItem
                            key={row.id}
                            active={row.id === selectedStatusId}
                            title={row.status_label ?? row.status_key}
                            subtitle={row.is_active ? undefined : "Inactive"}
                            onClick={() => setSelectedStatusId(row.id)}
                            testId={`statuses-status-${row.id}`}
                            trailing={
                                !row.is_active ?
                                    <span className="shrink-0 rounded-full bg-alloy-forge/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-alloy-forge/60">
                                        Off
                                    </span>
                                :   null
                            }
                        />
                    ))
                }
            </ConfigurationQueue>
        :   null;

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="statuses-configuration-page">
            <ConfigurationContext
                title="Statuses"
                subtitle={STATUSES_CONTEXT_SUBTITLE}
                actions={contextActions}
                testId="statuses-configuration-context"
            />

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}
            {actionMessage ?
                <p className="mb-3 text-xs font-medium text-alloy-pine" data-testid="status-settings-action-message">
                    {actionMessage}
                </p>
            :   null}

            <ConfigurationShell
                testId="statuses-configuration-shell"
                queueColumn={categoryQueue}
                listColumn={statusList}
            >
                <StatusConfigurationDetailPanel
                    status={selectedStatus}
                    canMutate={canMutate}
                    onSave={patchStatus}
                />
            </ConfigurationShell>

            <StatusCreateModal
                open={createOpen}
                defaultEntityType={
                    selectedCategoryKey ? defaultEntityTypeForCategory(selectedCategoryKey) : "opportunities"
                }
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                    setCreateOpen(false);
                    void refresh();
                }}
            />
        </div>
    );
}
