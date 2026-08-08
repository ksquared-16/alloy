"use client";

/**
 * Compact progress region for What's Next Card V2.
 * Mode A — sequential milestone strip · Mode B — repeated-attempt columns.
 * Same DTO; no domain branching.
 */

import type { WhatsNextProgressPresentation } from "@/lib/adminV2/runtime/focusPanel/currentWork/whatsNextCardTypes";

type Props = {
    progress: WhatsNextProgressPresentation;
};

export default function CurrentWorkProgressSummary({ progress }: Props) {
    if (progress.items.length === 0) return null;

    if (progress.mode === "repeated") {
        const completedItems = progress.items.filter((item) => item.role === "completed");
        const currentItem = progress.items.find((item) => item.role === "current") ?? null;
        const nextItem = progress.items.find((item) => item.role === "upcoming") ?? null;
        return (
            <div
                className="alloy-os-currentwork__progress-summary"
                data-work-progress="true"
                data-work-progress-mode="repeated"
            >
                {progress.collapsedEarlierLabel ?
                    <p className="alloy-os-currentwork__progress-collapsed">{progress.collapsedEarlierLabel}</p>
                :   null}
                {progress.repeatedHeadline ?
                    <p className="alloy-os-currentwork__progress-headline">{progress.repeatedHeadline}</p>
                :   null}
                <div className="alloy-os-currentwork__progress-columns" role="list">
                    <div className="alloy-os-currentwork__progress-column" role="listitem">
                        <p className="alloy-os-currentwork__progress-col-label">What&apos;s been done</p>
                        <ul className="alloy-os-currentwork__progress-attempt-list">
                            {completedItems.map((item) => (
                                <li key={item.key} data-progress-role="completed">
                                    <span className="alloy-os-currentwork__progress-check" aria-hidden>
                                        ✓
                                    </span>
                                    <span>
                                        <span className="alloy-os-currentwork__progress-item-label">{item.label}</span>
                                        {item.detail ?
                                            <span className="alloy-os-currentwork__progress-item-detail">{item.detail}</span>
                                        :   null}
                                    </span>
                                </li>
                            ))}
                            {completedItems.length === 0 ?
                                <li className="alloy-os-currentwork__progress-empty">None yet</li>
                            :   null}
                        </ul>
                    </div>
                    <div className="alloy-os-currentwork__progress-column" role="listitem" data-progress-current="true">
                        <p className="alloy-os-currentwork__progress-col-label">What&apos;s next</p>
                        {currentItem ?
                            <div data-progress-role="current">
                                <p className="alloy-os-currentwork__progress-item-label alloy-os-currentwork__progress-item-label--current">
                                    {currentItem.label}
                                </p>
                                {progress.currentDetail ?
                                    <p className="alloy-os-currentwork__progress-item-detail">{progress.currentDetail}</p>
                                :   null}
                            </div>
                        :   null}
                    </div>
                    <div className="alloy-os-currentwork__progress-column" role="listitem">
                        <p className="alloy-os-currentwork__progress-col-label">What comes after</p>
                        {nextItem ?
                            <div data-progress-role="upcoming">
                                <p className="alloy-os-currentwork__progress-item-label">{nextItem.label}</p>
                                {progress.afterDetail
                                    && progress.afterDetail !== nextItem.label
                                    && !/^Attempt\s+\d+$/i.test(progress.afterDetail) ?
                                    <p className="alloy-os-currentwork__progress-item-detail">{progress.afterDetail}</p>
                                :   null}
                            </div>
                        : progress.afterDetail && !/^Attempt\s+\d+$/i.test(progress.afterDetail) ?
                            <p className="alloy-os-currentwork__progress-item-detail">{progress.afterDetail}</p>
                        :   null}
                    </div>
                </div>
            </div>
        );
    }

    // Mode A — sequential milestones (compact 3-node strip)
    return (
        <div
            className="alloy-os-currentwork__progress-summary"
            data-work-progress="true"
            data-work-progress-mode="sequential"
        >
            {progress.collapsedEarlierLabel ?
                <p className="alloy-os-currentwork__progress-collapsed">{progress.collapsedEarlierLabel}</p>
            :   null}
            <ol className="alloy-os-currentwork__progress-strip" aria-label="Work sequence">
                {progress.items.map((item, index) => (
                    <li
                        key={item.key}
                        className="alloy-os-currentwork__progress-node"
                        data-progress-role={item.role}
                    >
                        {index > 0 ?
                            <span
                                className="alloy-os-currentwork__progress-connector"
                                data-complete={progress.items[index - 1]?.role === "completed" ? "true" : "false"}
                                aria-hidden
                            />
                        :   null}
                        <span className="alloy-os-currentwork__progress-node-marker" aria-hidden>
                            {item.role === "completed" ? "✓" : String(index + 1)}
                        </span>
                        <span className="alloy-os-currentwork__progress-node-copy">
                            <span className="alloy-os-currentwork__progress-item-label">{item.label}</span>
                            <span className="alloy-os-currentwork__progress-item-status">{item.statusLabel}</span>
                            {item.detail ?
                                <span className="alloy-os-currentwork__progress-item-detail">{item.detail}</span>
                            :   null}
                        </span>
                    </li>
                ))}
            </ol>
            {(progress.currentDetail || progress.afterDetail) ?
                <div className="alloy-os-currentwork__progress-detail-row">
                    {progress.currentDetail ?
                        <div>
                            <p className="alloy-os-currentwork__progress-col-label">What&apos;s next</p>
                            <p className="alloy-os-currentwork__progress-item-detail">{progress.currentDetail}</p>
                        </div>
                    :   null}
                    {progress.afterDetail ?
                        <div>
                            <p className="alloy-os-currentwork__progress-col-label">What comes after</p>
                            <p className="alloy-os-currentwork__progress-item-detail">{progress.afterDetail}</p>
                        </div>
                    :   null}
                </div>
            :   null}
        </div>
    );
}
