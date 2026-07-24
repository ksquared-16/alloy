"use client";

/**
 * Entity → Status. The entity's status domain, hosted in place.
 *
 * Domain ownership still comes from the status category registry (see
 * `dataModelEntityStatusDomain.ts`) and the values are the effective
 * `status_definitions` rows composed into the route payload — the Entity does not
 * invent a second status system, and nothing here links to a Statuses page.
 */

import { useState } from "react";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import {
    ENTITY_CHILD_DETAIL_TABS,
    type EntityChildDetailTabKey,
    type EntityStatusDomainVm,
    type EntityStatusValueVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

function StatusDetail({
    status,
    domain,
    testId,
}: {
    status: EntityStatusValueVm;
    domain: EntityStatusDomainVm;
    testId: string;
}) {
    const [activeTab, setActiveTab] = useState<EntityChildDetailTabKey>("overview");

    return (
        <div data-testid={testId} data-status-key={status.statusKey}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{domain.label}</p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">{status.label}</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    {status.scope === "organization" ? "Organization" : "Industry default"} ·{" "}
                    {status.isActive ? "Active" : "Inactive"}
                    {status.isSystem ? " · System" : ""}
                </p>
            </header>

            <ConfigWorkspaceTabBar<EntityChildDetailTabKey>
                tabs={ENTITY_CHILD_DETAIL_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Status details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-3" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "overview" ?
                    <ConfigWorkspaceCard title="What this status means" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/70">{domain.usageSummary}</p>
                        <p className="mt-2 text-[11px] text-alloy-midnight/50">
                            {status.scope === "organization" ?
                                "This organization defines this status."
                            :   "Inherited from the industry defaults. Adding an organization row overrides it."}
                        </p>
                    </ConfigWorkspaceCard>
                : activeTab === "definition" ?
                    <ConfigWorkspaceCard title="Definition" compact>
                        <dl className="grid grid-cols-2 gap-2.5 text-[12px]">
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Key</dt>
                                <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight">
                                    {status.statusKey}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Order</dt>
                                <dd className="mt-0.5 text-alloy-midnight">{status.sortOrder}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Stored on</dt>
                                <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight">
                                    {domain.authoritativeTable}.{domain.authoritativeColumn}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">Active</dt>
                                <dd className="mt-0.5 text-alloy-midnight">{status.isActive ? "Yes" : "No"}</dd>
                            </div>
                        </dl>
                        {status.isSystem ?
                            <p
                                className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                data-testid={`${testId}-protected`}
                            >
                                System status — protected because platform behavior depends on this key.
                            </p>
                        :   null}
                    </ConfigWorkspaceCard>
                : activeTab === "usage" ?
                    <ConfigWorkspaceCard title="Where this status is used" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/70">{domain.usageSummary}</p>
                        {domain.processLinked ?
                            <p className="mt-2 text-[11px] text-alloy-midnight/50">
                                Stage assignment for this domain is configured in Business Processes.
                            </p>
                        :   null}
                    </ConfigWorkspaceCard>
                :   <ConfigWorkspaceCard title="History" compact>
                        <p className="text-[12px] leading-5 text-alloy-midnight/55">
                            Change history for status definitions is planned but not wired yet.
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}

export function EntityStatusTab({
    entity,
    testId = "entity-status-tab",
}: {
    entity: EntityWorkspaceVm;
    testId?: string;
}) {
    const domain = entity.statusDomain;
    const [selectedKey, setSelectedKey] = useState<string | null>(domain?.statuses[0]?.statusKey ?? null);

    if (!domain) {
        return (
            <ConfigWorkspaceCard title="Status domain" compact testId={testId}>
                <p className="text-[12px] leading-5 text-alloy-midnight/55" data-testid={`${testId}-none`}>
                    {entity.displayName} has no status domain — no `status_definitions` owner is registered for this
                    record type.
                </p>
            </ConfigWorkspaceCard>
        );
    }

    const selected = domain.statuses.find((row) => row.statusKey === selectedKey) ?? domain.statuses[0] ?? null;

    return (
        <ConfigChildObjectMasterDetail
            testId={testId}
            listTitle={domain.label}
            listSummary={`${domain.statuses.length} status${domain.statuses.length === 1 ? "" : "es"} · stored on ${domain.authoritativeTable}.${domain.authoritativeColumn}`}
            list={
                domain.statuses.length > 0 ?
                    <ul className="space-y-0.5" data-testid={`${testId}-list`}>
                        {domain.statuses.map((status) => {
                            const active = status.statusKey === selected?.statusKey;
                            return (
                                <li key={`${status.id}-${status.statusKey}`}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedKey(status.statusKey)}
                                        aria-current={active ? "true" : undefined}
                                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                                            active ?
                                                "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine"
                                            :   "text-alloy-midnight hover:bg-alloy-stone/20"
                                        } ${status.isActive ? "" : "opacity-60"}`}
                                        data-testid={`${testId}-item-${status.statusKey}`}
                                    >
                                        <span
                                            className={`min-w-0 truncate text-[12px] ${active ? "font-semibold" : ""}`}
                                        >
                                            {status.label}
                                        </span>
                                        {status.scope === "industry_default" ?
                                            <span className="shrink-0 text-[9px] text-alloy-midnight/40">Default</span>
                                        :   null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                :   <p className="px-2 py-4 text-center text-[11px] text-alloy-midnight/45">
                        No statuses are defined for this domain yet.
                    </p>
            }
            detail={
                selected ?
                    <StatusDetail status={selected} domain={domain} testId={`${testId}-detail`} />
                :   <p className="text-[12px] text-alloy-midnight/45">
                        No statuses are defined for {domain.label} yet.
                    </p>
            }
        />
    );
}
