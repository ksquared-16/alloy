"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
} from "@/lib/financials/rates/rateTypes";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";

/**
 * Financials is organized around operational DECISIONS, not tables (Financial
 * Configuration Convergence). The sections below read like "how my organization
 * gets paid": what we sell, how we price it, the rules, how it posts, who pays.
 */
export type FinancialsConfigSection =
    | "overview"
    | "services"
    | "rate_plans"
    | "financial_policies"
    | "charge_templates"
    | "accounting"
    | "posting"
    | "payments"
    | "financial_responsibility"
    | "subsidy"
    | "charge_preview"
    | "consumption"
    | "obligations";

export type FinancialsConfigSectionDef = { key: FinancialsConfigSection; label: string };
export type FinancialsConfigGroup = { label: string; sections: FinancialsConfigSectionDef[] };

/** Grouped navigation: each group is a stage of the get-paid lifecycle. */
export const FINANCIALS_CONFIG_GROUPS: FinancialsConfigGroup[] = [
    { label: "", sections: [{ key: "overview", label: "Overview" }] },
    {
        label: "What you sell",
        sections: [
            { key: "services", label: "Services" },
            { key: "rate_plans", label: "Rate Plans" },
        ],
    },
    {
        label: "Money rules",
        sections: [
            { key: "financial_policies", label: "Financial Policies" },
            { key: "charge_templates", label: "Charge Templates" },
        ],
    },
    {
        label: "Money movement",
        sections: [
            { key: "accounting", label: "Accounting" },
            { key: "posting", label: "Posting" },
            { key: "payments", label: "Payments" },
        ],
    },
    {
        label: "Who pays",
        sections: [
            { key: "financial_responsibility", label: "Financial Responsibility" },
            { key: "subsidy", label: "Subsidy" },
        ],
    },
    { label: "Tools", sections: [{ key: "charge_preview", label: "Charge Preview" }] },
    // Runtime interpretation (NOT configuration): Operational Consumption turns an
    // operational fact into a Consumption Event -> Resolved Obligation -> draft Charge.
    // "Obligations" is the pre-posting review queue over resolved_obligations.
    {
        label: "Runtime",
        sections: [
            { key: "consumption", label: "Consumption" },
            { key: "obligations", label: "Draft Obligations" },
        ],
    },
];

export const FINANCIALS_CONFIG_SECTIONS: FinancialsConfigSectionDef[] = FINANCIALS_CONFIG_GROUPS.flatMap(
    (g) => g.sections,
);

type RateConfigResponse = {
    ratePlans?: ChildcareRatePlanRow[];
    rateRules?: ChildcareRateRuleRow[];
    error?: string;
};

type GlConfigResponse = {
    glAccounts?: GlAccountRow[];
    glAccountMappings?: GlAccountMappingRow[];
    error?: string;
};

/**
 * Read-only loader for the Financials configuration surface (Batch 0). Fetches
 * Rate Plans / Rate Rules and GL Codes / GL Mappings. Never writes.
 */
export function useFinancialsConfigurationSettings() {
    const [ratePlans, setRatePlans] = useState<ChildcareRatePlanRow[]>([]);
    const [rateRules, setRateRules] = useState<ChildcareRateRuleRow[]>([]);
    const [glAccounts, setGlAccounts] = useState<GlAccountRow[]>([]);
    const [glAccountMappings, setGlAccountMappings] = useState<GlAccountMappingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rateRes, glRes] = await Promise.all([
                fetch("/api/admin/financial/rate-config", { credentials: "include" }),
                fetch("/api/admin/financial/gl-config", { credentials: "include" }),
            ]);
            const rateJson = (await rateRes.json()) as RateConfigResponse;
            if (!rateRes.ok) throw new Error(rateJson.error ?? `Rate config failed (${rateRes.status})`);
            const glJson = (await glRes.json()) as GlConfigResponse;
            if (!glRes.ok) throw new Error(glJson.error ?? `GL config failed (${glRes.status})`);

            setRatePlans(rateJson.ratePlans ?? []);
            setRateRules(rateJson.rateRules ?? []);
            setGlAccounts(glJson.glAccounts ?? []);
            setGlAccountMappings(glJson.glAccountMappings ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load financials configuration");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        loading,
        error,
        ratePlans,
        rateRules,
        glAccounts,
        glAccountMappings,
        refresh,
    };
}
