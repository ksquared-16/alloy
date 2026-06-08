"use client";

/**
 * C1a — fire-and-forget shadow parity evaluation when opportunity drawer opens.
 *
 * Does not block VM drawer render. Failures are swallowed and logged only.
 */

import { useEffect, useRef, useState } from "react";
import {
    isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient,
    isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient,
} from "@/lib/layout/featureFlag";
import type { OpportunityDrawerShadowTelemetry } from "@/lib/layout/runtime/shadow/opportunityDrawerShadowTelemetry";
import { logOpportunityDrawerShadowTelemetry } from "@/lib/layout/runtime/shadow/opportunityDrawerShadowTelemetry";

export type UseOpportunityDrawerLayoutRuntimeShadowArgs = {
    opportunityId: string | null | undefined;
    /** VM structure settled — shadow compares composed VM vs layout doc. */
    vmReady: boolean;
    departmentId?: string | null;
    workUnitId?: string | null;
};

export type UseOpportunityDrawerLayoutRuntimeShadowResult = {
    shadowEnabled: boolean;
    diagnosticsEnabled: boolean;
    telemetry: OpportunityDrawerShadowTelemetry | null;
    evaluating: boolean;
    lastError: string | null;
};

export function useOpportunityDrawerLayoutRuntimeShadow(
    args: UseOpportunityDrawerLayoutRuntimeShadowArgs,
): UseOpportunityDrawerLayoutRuntimeShadowResult {
    const shadowEnabled = isLayoutRuntimeOpportunityDrawerShadowReadPathEnabledClient();
    const diagnosticsEnabled = isLayoutRuntimeOpportunityDrawerShadowDiagnosticsEnabledClient();

    const [telemetry, setTelemetry] = useState<OpportunityDrawerShadowTelemetry | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const lastEvaluatedIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!shadowEnabled) return;
        const oid = args.opportunityId?.trim() ?? "";
        if (!oid || !args.vmReady) return;
        if (lastEvaluatedIdRef.current === oid) return;

        let cancelled = false;
        lastEvaluatedIdRef.current = oid;

        const run = () => {
            setEvaluating(true);
            setLastError(null);

            const qs = new URLSearchParams({ opportunityId: oid });
            if (args.departmentId) qs.set("departmentId", String(args.departmentId));
            if (args.workUnitId) qs.set("workUnitId", String(args.workUnitId));

            fetch(`/api/admin/layout-runtime/opportunity-drawer-shadow?${qs.toString()}`)
                .then(async (res) => {
                    if (cancelled) return;
                    if (!res.ok) {
                        const json = await res.json().catch(() => ({}));
                        const reason = (json as { error?: string }).error ?? `http_${res.status}`;
                        setLastError(reason);
                        if (typeof console !== "undefined") {
                            console.info("[layout_runtime_shadow:opportunity_drawer_error]", {
                                opportunityId: oid,
                                reason,
                            });
                        }
                        return;
                    }
                    const json = (await res.json()) as { telemetry?: OpportunityDrawerShadowTelemetry };
                    if (json.telemetry) {
                        setTelemetry(json.telemetry);
                        logOpportunityDrawerShadowTelemetry(json.telemetry);
                    }
                })
                .catch((err) => {
                    if (cancelled) return;
                    const message = err instanceof Error ? err.message : String(err);
                    setLastError(message);
                    if (typeof console !== "undefined") {
                        console.info("[layout_runtime_shadow:opportunity_drawer_error]", {
                            opportunityId: oid,
                            message,
                        });
                    }
                })
                .finally(() => {
                    if (!cancelled) setEvaluating(false);
                });
        };

        if (typeof requestIdleCallback === "function") {
            const idleId = requestIdleCallback(run, { timeout: 3000 });
            return () => {
                cancelled = true;
                cancelIdleCallback(idleId);
            };
        }

        const timerId = setTimeout(run, 0);
        return () => {
            cancelled = true;
            clearTimeout(timerId);
        };
    }, [shadowEnabled, args.opportunityId, args.vmReady, args.departmentId, args.workUnitId]);

    useEffect(() => {
        if (!args.opportunityId?.trim()) {
            lastEvaluatedIdRef.current = null;
            setTelemetry(null);
            setLastError(null);
        }
    }, [args.opportunityId]);

    return { shadowEnabled, diagnosticsEnabled, telemetry, evaluating, lastError };
}
