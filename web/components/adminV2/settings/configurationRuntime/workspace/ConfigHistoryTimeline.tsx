"use client";

import { ConfigurationInlineButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { ConfigurationHistoryEntry } from "@/lib/configPublication/runtimeModel";

/** Plain-language publication, assignment, retry, and failure history. */
export function ConfigHistoryTimeline({
    entries,
    onAction,
    testId = "config-history-timeline",
}: {
    entries: ConfigurationHistoryEntry[];
    onAction?: (entry: ConfigurationHistoryEntry) => void;
    testId?: string;
}) {
    return (
        <ConfigWorkspaceCard
            title="Configuration history"
            description="Published revisions, Location assignments, retries, and failures."
            compact
            testId={testId}
        >
            {entries.length > 0 ?
                <ol className="divide-y divide-alloy-stone/20">
                    {entries.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                            <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                    entry.tone === "attention" ? "bg-alloy-ember"
                                    : entry.tone === "good" ? "bg-alloy-bend-pine"
                                    : "bg-alloy-midnight/25"
                                }`}
                                aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                    <p className="text-sm font-semibold text-alloy-midnight">{entry.title}</p>
                                    <time className="text-[10px] text-alloy-midnight/40" dateTime={entry.occurredAt}>
                                        {new Date(entry.occurredAt).toLocaleString()}
                                    </time>
                                </div>
                                <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/55">
                                    {entry.detail}
                                </p>
                                {entry.actionLabel && onAction ?
                                    <ConfigurationInlineButton className="mt-1.5" onClick={() => onAction(entry)}>
                                        {entry.actionLabel} →
                                    </ConfigurationInlineButton>
                                :   null}
                            </div>
                        </li>
                    ))}
                </ol>
            :   <p className="py-5 text-sm text-alloy-midnight/50">
                    No publication or assignment history yet.
                </p>
            }
        </ConfigWorkspaceCard>
    );
}
