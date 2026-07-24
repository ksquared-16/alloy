"use client";

/**
 * Option Set panel embedded inside a field's Definition tab.
 *
 * Option Sets are not an Entity tab — they are reached through the option-backed
 * field that consumes them, and open here without leaving the Entity. Values come
 * from the org `option_sets` / `option_set_items` rows composed into the route
 * payload; authoring still belongs to the option-sets APIs.
 */

import { useState } from "react";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type {
    EntityChildDetailTabKey,
    EntityOptionSetVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

/** Same shape as the shared child-detail tabs, plus the option set's own Values tab. */
type OptionSetPanelTabKey = EntityChildDetailTabKey | "values";

const OPTION_SET_TABS: readonly { key: OptionSetPanelTabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "values", label: "Values" },
    { key: "usage", label: "Usage" },
    { key: "history", label: "History" },
];

export function EntityOptionSetPanel({
    optionSet,
    fieldLabelByRefKey,
    testId = "entity-option-set-panel",
}: {
    optionSet: EntityOptionSetVm;
    fieldLabelByRefKey: ReadonlyMap<string, string>;
    testId?: string;
}) {
    const [activeTab, setActiveTab] = useState<OptionSetPanelTabKey>("overview");

    return (
        <section
            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] p-3"
            data-testid={testId}
        >
            <header className="mb-2">
                <p className="text-[12px] font-semibold text-alloy-midnight">{optionSet.label}</p>
                <p className="text-[10px] text-alloy-midnight/45">
                    Option set · {optionSet.setKey}
                    {optionSet.resolved ? ` · ${optionSet.itemCount} values` : " · not found for this organization"}
                </p>
            </header>

            <ConfigWorkspaceTabBar<OptionSetPanelTabKey>
                tabs={OPTION_SET_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Option set details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-2.5" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "overview" ?
                    <dl className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                            <dt className="text-alloy-midnight/40">Key</dt>
                            <dd className="font-mono text-[10px] text-alloy-midnight">{optionSet.setKey}</dd>
                        </div>
                        <div>
                            <dt className="text-alloy-midnight/40">Values</dt>
                            <dd className="text-alloy-midnight">{optionSet.itemCount}</dd>
                        </div>
                    </dl>
                : activeTab === "values" ?
                    optionSet.values.length > 0 ?
                        <ul className="space-y-1" data-testid={`${testId}-values`}>
                            {optionSet.values.map((value) => (
                                <li
                                    key={value.key}
                                    className="flex items-baseline justify-between gap-2 text-[11px]"
                                >
                                    <span className="text-alloy-midnight">{value.label}</span>
                                    <span className="font-mono text-[10px] text-alloy-midnight/40">{value.key}</span>
                                </li>
                            ))}
                        </ul>
                    :   <p className="text-[11px] text-alloy-midnight/45">
                            {optionSet.resolved ?
                                "This option set has no values yet."
                            :   "No option set with this key exists for this organization."}
                        </p>

                : activeTab === "usage" ?
                    <ul className="space-y-1 text-[11px]" data-testid={`${testId}-usage`}>
                        {optionSet.usedByFieldRefKeys.map((refKey) => (
                            <li key={refKey} className="text-alloy-midnight">
                                {fieldLabelByRefKey.get(refKey) ?? refKey}
                                <span className="ml-1 font-mono text-[10px] text-alloy-midnight/40">{refKey}</span>
                            </li>
                        ))}
                    </ul>
                :   <p className="text-[11px] leading-4 text-alloy-midnight/55">
                        No audit trail is wired to option set changes yet, so there is nothing to show here.
                    </p>
                }
            </div>
        </section>
    );
}
