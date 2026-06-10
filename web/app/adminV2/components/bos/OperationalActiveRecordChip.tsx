"use client";

import { derived, neutral } from "@/styles/tokens/colors";

const CMD = {
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

type Props = {
    label: string | null | undefined;
    sourceSurface?: string | null;
    /** When set, shown as the full operator-facing line (e.g. Lead — Jane Doe). */
    displayLine?: string | null;
    /** Embedded in thread panel header (border-b). */
    variant?: "thread_header" | "collapsed_rail";
};

/**
 * Shows which record the Orchestrator is operationally aligned with.
 * Reserves vertical space to avoid layout shift when context appears.
 */
export default function OperationalActiveRecordChip({
    label,
    sourceSurface,
    displayLine,
    variant = "thread_header",
}: Props) {
    const trimmed = label?.trim() ?? "";
    const formattedLine = displayLine?.trim() ?? "";
    const surfaceHint =
        sourceSurface === "opportunity_drawer" ?
            "Drawer"
        : sourceSurface === "queue" ?
          "Queue"
        : sourceSurface === "command_bar" ?
          "Command"
        :   null;

    if (variant === "collapsed_rail") {
        const line = formattedLine || trimmed;
        return (
            <div
                className="mx-2 mb-2 min-h-[28px] shrink-0 rounded-xl border px-3 py-1.5 text-[11px]"
                style={{
                    borderColor: derived.border,
                    color: CMD.textSupporting,
                    backgroundColor: neutral.surface,
                }}
                data-command-surface-active-record-row="true"
            >
                {line ?
                    <span
                        className="block truncate font-medium leading-snug"
                        data-command-surface-active-record-chip="true"
                        aria-label={`BOS context: ${line}`}
                        title={line}
                        style={{ color: CMD.textBody }}
                    >
                        {formattedLine ?
                            line
                        :   <>
                                <span className="font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                                    Active record ·{" "}
                                </span>
                                {trimmed}
                                {surfaceHint ?
                                    <span className="text-alloy-midnight/45"> · {surfaceHint}</span>
                                :   null}
                            </>
                        }
                    </span>
                :   <span className="text-alloy-midnight/40" aria-hidden="true">
                        &nbsp;
                    </span>
                }
            </div>
        );
    }

    return (
        <div
            className="min-h-[26px] border-b px-3 py-1 text-[10px]"
            style={{ borderColor: derived.border, color: CMD.textSupporting }}
            data-command-surface-active-record-row="true"
        >
            {trimmed ?
                <span
                    className="block truncate"
                    data-command-surface-active-record-chip="true"
                    aria-label={`Active record: ${trimmed}`}
                    title={trimmed}
                >
                    <span className="font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
                        Active record ·{" "}
                    </span>
                    {trimmed}
                    {surfaceHint ?
                        <span className="text-alloy-midnight/45"> · {surfaceHint}</span>
                    :   null}
                </span>
            :   null}
        </div>
    );
}
