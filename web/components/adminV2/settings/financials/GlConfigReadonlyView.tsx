"use client";

import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";

const GL_CODES_FUTURE_COPY =
    "GL Codes are the accounting targets that posting will map charge categories, payments, credits, deposits, subsidy, and adjustments to. No posting behavior exists yet — this is read-only configuration.";

const GL_MAPPINGS_FUTURE_COPY =
    "GL Mappings bind a financial key (e.g. a charge category or payment type) to a GL account. Posting will consume these mappings. Read-only until posting is built.";

export function GlCodesReadonlyView({ glAccounts }: { glAccounts: GlAccountRow[] }) {
    return (
        <div className="space-y-3" data-testid="financials-gl-codes">
            <ConfigReadonlyNotice testId="financials-gl-codes-notice">{GL_CODES_FUTURE_COPY}</ConfigReadonlyNotice>
            {glAccounts.length === 0 ?
                <ConfigurationEmptyState
                    testId="financials-gl-codes-empty"
                    title="No GL codes configured"
                    description="GL Codes will appear here once a chart of accounts is set up. Posting and write configuration are deferred."
                />
            :   <ConfigurationDetailCard title={`GL Codes (${glAccounts.length})`}>
                    <ul className="divide-y divide-alloy-stone/30">
                        {glAccounts.map((acct) => (
                            <li
                                key={acct.id}
                                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                                data-testid={`financials-gl-code-${acct.id}`}
                            >
                                <div className="min-w-0">
                                    <p className="config-typo-field-value text-alloy-midnight">
                                        <span className="font-mono">{acct.code}</span> · {acct.name}
                                    </p>
                                    <p className="config-typo-sublabel text-alloy-forge/60">
                                        {acct.type} · {acct.currency}
                                    </p>
                                </div>
                                <span className="config-typo-sublabel text-alloy-forge/60">
                                    {acct.is_active ? "Active" : "Inactive"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </ConfigurationDetailCard>
            }
        </div>
    );
}

export function GlMappingsReadonlyView({
    glAccountMappings,
    glAccounts,
}: {
    glAccountMappings: GlAccountMappingRow[];
    glAccounts: GlAccountRow[];
}) {
    const accountById = new Map(glAccounts.map((a) => [a.id, a]));
    return (
        <div className="space-y-3" data-testid="financials-gl-mappings">
            <ConfigReadonlyNotice testId="financials-gl-mappings-notice">{GL_MAPPINGS_FUTURE_COPY}</ConfigReadonlyNotice>
            {glAccountMappings.length === 0 ?
                <ConfigurationEmptyState
                    testId="financials-gl-mappings-empty"
                    title="No GL mappings configured"
                    description="GL Mappings bind financial keys to GL accounts. They become editable when posting is introduced."
                />
            :   <ConfigurationDetailCard title={`GL Mappings (${glAccountMappings.length})`}>
                    <ul className="divide-y divide-alloy-stone/30">
                        {glAccountMappings.map((mapping) => {
                            const acct = accountById.get(mapping.gl_account_id);
                            return (
                                <li
                                    key={mapping.id}
                                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                                    data-testid={`financials-gl-mapping-${mapping.id}`}
                                >
                                    <div className="min-w-0">
                                        <p className="config-typo-field-value text-alloy-midnight">
                                            <span className="font-mono">{mapping.key}</span>
                                        </p>
                                        <p className="config-typo-sublabel text-alloy-forge/60">
                                            {acct ? `${acct.code} · ${acct.name}` : mapping.gl_account_id}
                                        </p>
                                    </div>
                                    <span className="config-typo-sublabel text-alloy-forge/60">
                                        {mapping.is_active ? "Active" : "Inactive"}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </ConfigurationDetailCard>
            }
        </div>
    );
}
