"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

/** Collapsed Workflow Telemetry (0) — header always visible when no telemetry is registered. */
export function CommandRailDefaultEmptyTelemetry() {
    const [expanded, setExpanded] = useState(false);

    return (
        <section
            className={`adminv2-ws-command-rail-actions-section adminv2-ws-command-rail-telemetry-section${expanded ? " adminv2-ws-command-rail-actions-section--expanded" : ""}`}
            data-adminv2-command-rail-telemetry-section="true"
            data-ws-component="automation_telemetry"
            aria-label="Workflow Telemetry"
            {...alloySectionDomAttrs("WS-08")}
        >
            <button
                type="button"
                className="adminv2-ws-command-rail-actions-trigger"
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
                data-command-rail-telemetry-toggle="true"
            >
                <span className="adminv2-ws-command-rail-actions-trigger-label inline-flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={2.2} />
                    Workflow Telemetry (0)
                </span>
                <span className="adminv2-ws-command-rail-actions-trigger-chevron" aria-hidden>
                    {expanded ? "▼" : "▶"}
                </span>
            </button>
            {expanded ?
                <div
                    className="adminv2-ws-command-rail-actions-body adminv2-ws-command-rail-telemetry-body"
                    data-command-rail-telemetry-body="true"
                >
                    <p className="adminv2-ws-command-rail-telemetry-empty">No workflow runs in scope.</p>
                </div>
            :   null}
        </section>
    );
}
