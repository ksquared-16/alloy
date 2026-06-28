"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
} from "@/lib/financials/rates/rateTypes";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";

export type FinancialsConfigSection =
    | "overview"
    | "rate_plans"
    | "charge_preview"
    | "gl_codes"
    | "gl_mappings";

export const FINANCIALS_CONFIG_SECTIONS: { key: FinancialsConfigSection; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "rate_plans", label: "Rate Plans" },
    { key: "charge_preview", label: "Charge Preview" },
    { key: "gl_codes", label: "GL Codes" },
    { key: "gl_mappings", label: "GL Mappings" },
];

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
