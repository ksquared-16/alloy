"use client";

import { useCallback, useState } from "react";
import { runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import { SNAPSHOT_RUN_STORAGE_KEY } from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import { dispatchAnalyticsSnapshotsUpdated } from "@/app/adminV2/settings/analytics/platformBuilderEvents";
import { PlatformBuilderButton, PlatformBuilderCallout } from "@/app/adminV2/settings/analytics/platformBuilderUi";

function formatLastRun(iso: string | null): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function MetricSnapshotButton() {
    const [state, setState] = useState<"idle" | "running" | "success" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [lastRunAt, setLastRunAt] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(SNAPSHOT_RUN_STORAGE_KEY);
    });

    const run = useCallback(async () => {
        setState("running");
        setMessage(null);
        const result = await runMetricSnapshots();
        const now = new Date().toISOString();
        if (result.errors.length && !result.written) {
            setState("error");
            setMessage(result.errors[0] ?? "Snapshot run failed.");
        } else {
            setState("success");
            setMessage(`Updated ${result.written} snapshot${result.written === 1 ? "" : "s"}.`);
            window.localStorage.setItem(SNAPSHOT_RUN_STORAGE_KEY, now);
            setLastRunAt(now);
            dispatchAnalyticsSnapshotsUpdated(result);
        }
        window.setTimeout(() => setState("idle"), 4000);
    }, []);

    return (
        <div className="flex flex-col items-end gap-1">
            <PlatformBuilderButton loading={state === "running"} loadingLabel="Updating metrics…" onClick={() => void run()}>
                Update live metric values
            </PlatformBuilderButton>
            {lastRunAt ?
                <p className="text-[10px] text-alloy-midnight/45">Last updated {formatLastRun(lastRunAt)}</p>
            :   <p className="text-[10px] text-alloy-midnight/45">Refresh stored values used across the workspace.</p>}
            {message ?
                <PlatformBuilderCallout tone={state === "error" ? "warning" : "success"}>{message}</PlatformBuilderCallout>
            :   null}
        </div>
    );
}
