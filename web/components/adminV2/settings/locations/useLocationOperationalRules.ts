"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    ChildcareCapacityRuleRow,
    ChildcareOperatingWindowRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
    ChildcareScheduleRuleRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

type ConfigRuleResponse = {
    capacityRules?: ChildcareCapacityRuleRow[];
    ratioRules?: ChildcareRatioRuleRow[];
    ratioRuleTiers?: ChildcareRatioRuleTierRow[];
    operatingWindows?: ChildcareOperatingWindowRow[];
    scheduleRules?: ChildcareScheduleRuleRow[];
    error?: string;
};

/**
 * Read-only loader for operational configuration rules (Capacity, Ratio + Tiers,
 * Operating Windows, Schedule Rules) shown in the Locations workspace (Batch 0).
 * Never writes.
 */
export function useLocationOperationalRules() {
    const [capacityRules, setCapacityRules] = useState<ChildcareCapacityRuleRow[]>([]);
    const [ratioRules, setRatioRules] = useState<ChildcareRatioRuleRow[]>([]);
    const [ratioRuleTiers, setRatioRuleTiers] = useState<ChildcareRatioRuleTierRow[]>([]);
    const [operatingWindows, setOperatingWindows] = useState<ChildcareOperatingWindowRow[]>([]);
    const [scheduleRules, setScheduleRules] = useState<ChildcareScheduleRuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/operational-config-rules", { credentials: "include" });
            const json = (await res.json()) as ConfigRuleResponse;
            if (!res.ok) throw new Error(json.error ?? `Failed to load operational rules (${res.status})`);
            setCapacityRules(json.capacityRules ?? []);
            setRatioRules(json.ratioRules ?? []);
            setRatioRuleTiers(json.ratioRuleTiers ?? []);
            setOperatingWindows(json.operatingWindows ?? []);
            setScheduleRules(json.scheduleRules ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load operational rules");
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
        capacityRules,
        ratioRules,
        ratioRuleTiers,
        operatingWindows,
        scheduleRules,
        refresh,
    };
}
