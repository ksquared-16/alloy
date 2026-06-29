"use client";

import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import { resolveChargeCategoryGlChain } from "@/lib/financials/accounting/resolveGlMapping";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import { GlCodesReadonlyView, GlMappingsReadonlyView } from "@/components/adminV2/settings/financials/GlConfigReadonlyView";

/**
 * Accounting configuration (Financial Configuration Convergence). Makes GL legible
 * as a resolved chain — Charge Category → GL Mapping → GL Account — then exposes
 * the GL Accounts and GL Mappings read-only. Authoring GL is deferred until a safe
 * write backend exists; this is the QA surface for "where does each charge post?".
 */
export default function AccountingConfigurationPanel({
    glAccounts,
    glAccountMappings,
}: {
    glAccounts: GlAccountRow[];
    glAccountMappings: GlAccountMappingRow[];
}) {
    const chain = resolveChargeCategoryGlChain(glAccountMappings, glAccounts);

    return (
        <div className="space-y-3" data-testid="financials-accounting">
            <ConfigurationContext
                title="Accounting"
                subtitle="Where does each kind of charge post in the general ledger?"
                testId="financials-accounting-context"
            />

            <ConfigReadonlyNotice testId="financials-accounting-notice">
                GL configuration is read-only. Posting will map charges to these accounts; GL authoring ships with a safe
                write backend. The chain below is how each charge category resolves today.
            </ConfigReadonlyNotice>

            <ConfigurationDetailCard title="Charge Category → GL Mapping → GL Account" testId="financials-accounting-chain">
                <ul className="divide-y divide-alloy-stone/30">
                    {chain.map((row) => (
                        <li
                            key={row.categoryKey}
                            className="flex flex-wrap items-center justify-between gap-2 py-2"
                            data-testid={`financials-accounting-chain-${row.categoryKey}`}
                        >
                            <div className="min-w-0">
                                <span className="config-typo-field-value text-alloy-midnight">{row.categoryLabel}</span>
                                <span className="config-typo-sublabel text-alloy-forge/55"> · {row.mappingKey}</span>
                            </div>
                            {row.mapped && row.account ? (
                                <span className="config-typo-field-value text-alloy-midnight">
                                    {row.account.code} · {row.account.name}{" "}
                                    <span className="text-alloy-forge/55">({row.account.type})</span>
                                </span>
                            ) : (
                                <span className="config-typo-sublabel text-amber-700" data-testid={`financials-accounting-unmapped-${row.categoryKey}`}>
                                    Unmapped
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </ConfigurationDetailCard>

            <GlCodesReadonlyView glAccounts={glAccounts} />
            <GlMappingsReadonlyView glAccountMappings={glAccountMappings} glAccounts={glAccounts} />
        </div>
    );
}
