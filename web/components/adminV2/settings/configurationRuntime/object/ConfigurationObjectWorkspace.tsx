"use client";

import type { ReactNode } from "react";
import {
    ConfigCollectionRail,
    type ConfigCollectionItem,
} from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigCollectionRail";
import {
    ConfigDetailRuntime,
    type ConfigDetailTab,
} from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigDetailRuntime";
import { ConfigObjectHeader } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigObjectHeader";
import type { ConfigurationObjectIdentity } from "@/lib/configRuntime/configurationObject/types";

/**
 * Reusable Configuration Object collection + detail composition (Checkpoint C.5).
 *
 * Composes existing Configuration workspace primitives. Domains supply items,
 * header facts, and concern surfaces. Continuity remains outside this shell.
 */
export function ConfigurationObjectWorkspace({
    collectionTitle,
    collectionDescription,
    objectLabel,
    items,
    selectedId,
    canAdd,
    onAdd,
    onSelect,
    addLabel,
    identity,
    headerStatus,
    headerFacts,
    headerFactsContent,
    headerBreadcrumb,
    headerActions,
    concernTabs,
    activeConcern,
    onConcernChange,
    onConcernIntent,
    children,
    emptyDetail,
    testId = "configuration-object-workspace",
}: {
    collectionTitle: string;
    collectionDescription?: string;
    objectLabel: string;
    items: ConfigCollectionItem[];
    selectedId: string | null;
    canAdd: boolean;
    onAdd: () => void;
    onSelect: (id: string) => void;
    addLabel?: string;
    identity: ConfigurationObjectIdentity | null;
    headerStatus?: { label: string; tone: "active" | "inactive" | "attention" };
    headerFacts?: string[];
    headerFactsContent?: ReactNode;
    headerBreadcrumb?: ReactNode;
    headerActions?: ReactNode;
    concernTabs: readonly ConfigDetailTab<string>[];
    activeConcern: string;
    onConcernChange: (concern: string) => void;
    onConcernIntent?: (concern: string) => void;
    children: ReactNode;
    emptyDetail?: ReactNode;
    testId?: string;
}) {
    const selected = Boolean(identity && selectedId);

    return (
        <div
            className={`grid items-start gap-4 pb-4 ${selected ? "xl:grid-cols-[20.5rem_minmax(0,1fr)]" : ""}`}
            data-testid={testId}
            data-configuration-object-runtime="true"
        >
            {selected ?
                <ConfigCollectionRail
                    title={collectionTitle}
                    description={collectionDescription}
                    objectLabel={objectLabel}
                    items={items}
                    selectedId={selectedId}
                    canAdd={canAdd}
                    onAdd={onAdd}
                    onSelect={onSelect}
                    addLabel={addLabel}
                    testId={`${testId}-collection`}
                />
            :   null}

            <main className="min-w-0 space-y-2.5" data-testid={`${testId}-detail`}>
                {!selected ?
                    (emptyDetail ?? (
                        <ConfigCollectionRail
                            title={collectionTitle}
                            description={collectionDescription}
                            objectLabel={objectLabel}
                            items={items}
                            selectedId={selectedId}
                            canAdd={canAdd}
                            onAdd={onAdd}
                            onSelect={onSelect}
                            addLabel={addLabel}
                            testId={`${testId}-collection-landing`}
                        />
                    ))
                :   <ConfigDetailRuntime
                        header={
                            <ConfigObjectHeader
                                size="hero"
                                name={identity!.displayName}
                                status={headerStatus}
                                facts={headerFacts}
                                factsContent={headerFactsContent}
                                breadcrumb={headerBreadcrumb}
                                actions={headerActions}
                                testId={`${testId}-header`}
                            />
                        }
                        tabs={concernTabs}
                        activeSection={activeConcern}
                        onSectionChange={onConcernChange}
                        onSectionIntent={onConcernIntent}
                        testId={`${testId}-concerns`}
                        headerTestId={`${testId}-hero`}
                        tabAriaLabel={`${objectLabel} configuration`}
                        tabTestIdPrefix={`${testId}-tab`}
                    >
                        {children}
                    </ConfigDetailRuntime>
                }
            </main>
        </div>
    );
}
