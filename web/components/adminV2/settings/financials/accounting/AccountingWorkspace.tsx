"use client";

import { useState } from "react";

import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigChildObjectMasterDetail";
import AccountingPostingPanels from "@/components/adminV2/settings/financials/accounting/AccountingPostingPanels";
import GlCodesConfigurationPage from "@/components/adminV2/settings/financials/accounting/GlCodesConfigurationPage";

/**
 * ACCOUNTING — two tools, one at a time.
 *
 * Accounting was a single vertical page: the whole GL configuration, and then the whole accounting
 * calendar, stacked. Both tools were complete and neither was findable — an operator who came to
 * close a period scrolled past every GL account to reach it, and an operator who came to check a
 * mapping had the period lifecycle underneath whether they wanted it or not. Length was doing the
 * work that navigation should do.
 *
 * So: the canonical rail/workspace grammar, `ConfigChildObjectMasterDetail`, which is the same
 * two-pane control every other configuration workspace uses. Its grid is
 * `lg:grid-cols-[16rem_minmax(0,1fr)]`, so the rail sits left on wide screens and collapses above
 * the workspace on narrow ones — the canonical responsive behaviour, inherited rather than
 * re-decided here.
 *
 * ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────────────────────────
 *
 * It selects. It does not touch GL semantics, period lifecycle, closed-period deferral, or any
 * copy inside either tool — both are rendered exactly as they were, by the same components. This
 * is an information-architecture change and deliberately nothing else: the two tools beneath it
 * were not the problem.
 */

export type AccountingToolKey = "gl_codes" | "accounting_calendar";

/**
 * The rail's contents, in order. A literal, because there are two tools and inventing a registry
 * for two entries would be the kind of machinery that outlives its reason.
 */
export const ACCOUNTING_TOOLS: { key: AccountingToolKey; label: string; summary: string }[] = [
    { key: "gl_codes", label: "GL Codes", summary: "Accounts, mappings, and where each charge posts" },
    { key: "accounting_calendar", label: "Accounting Calendar", summary: "Fiscal shape, periods, and closing" },
];

/**
 * DEFAULT SELECTION is the first tool, per the established workspace doctrine: a workspace opens
 * on something, never on an empty right pane asking the operator to choose before they have seen
 * what there is to choose from.
 */
export const ACCOUNTING_DEFAULT_TOOL: AccountingToolKey = "gl_codes";

export default function AccountingWorkspace({
    initialTool = ACCOUNTING_DEFAULT_TOOL,
}: {
    initialTool?: AccountingToolKey;
}) {
    const [tool, setTool] = useState<AccountingToolKey>(initialTool);

    return (
        <div data-testid="financials-accounting-workspace" data-accounting-tool={tool}>
            <ConfigChildObjectMasterDetail
                testId="financials-accounting-workspace-panes"
                listTitle="Accounting"
                listSummary="Choose a tool"
                list={
                    <ul role="list" className="flex flex-col gap-1 p-2">
                        {ACCOUNTING_TOOLS.map((t) => {
                            const selected = t.key === tool;
                            return (
                                <li key={t.key}>
                                    <button
                                        type="button"
                                        data-accounting-tool-option={t.key}
                                        data-selected={selected ? "true" : "false"}
                                        aria-current={selected ? "true" : undefined}
                                        onClick={() => setTool(t.key)}
                                        className={[
                                            "w-full rounded-md border px-3 py-2 text-left transition",
                                            selected
                                                ? "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.07]"
                                                : "border-transparent hover:border-alloy-stone/30 hover:bg-alloy-stone/[0.06]",
                                        ].join(" ")}
                                    >
                                        <span className="config-typo-field-value block text-alloy-midnight">
                                            {t.label}
                                        </span>
                                        <span className="config-typo-sublabel block text-alloy-forge/60">
                                            {t.summary}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                }
                detail={
                    tool === "gl_codes" ? (
                        <div data-testid="financials-accounting-pane-gl-codes">
                            <GlCodesConfigurationPage />
                        </div>
                    ) : (
                        <div data-testid="financials-accounting-pane-calendar">
                            {/*
                             * WHERE money posts and WHEN it posts. Unchanged — see the note on
                             * `AccountingPostingPanels`; this workspace only decides when it shows.
                             */}
                            <AccountingPostingPanels />
                        </div>
                    )
                }
            />
        </div>
    );
}
