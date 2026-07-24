"use client";

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { EntityWorkspaceVm } from "@/lib/dataModel/dataModelWorkspaceVm";

/**
 * Entities → History. No audit trail is wired to entity-level vocabulary or
 * structure changes yet — planned empty state, not a fabricated timeline.
 */
export function EntityHistoryTab({
    entity,
    testId = "entity-history-tab",
}: {
    entity: EntityWorkspaceVm;
    testId?: string;
}) {
    return (
        <ConfigWorkspaceCard title="History" compact testId={testId}>
            <p className="text-[12px] leading-5 text-alloy-midnight/55" data-testid="entity-history-planned-empty-state">
                Change history for {entity.displayName} vocabulary and structure is planned but not wired yet. Once
                an audit trail exists for entity_labels and field_definitions changes, it will appear here.
            </p>
        </ConfigWorkspaceCard>
    );
}
