"use client";

import clsx from "clsx";

import {
    resolveCurrentWorkRequirementOwner,
    type CurrentWorkRequirementOwner,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkRequirementOwner";
import type {
    CurrentWorkChecklistItemVM,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

/** Effective owner for a requirement — runtime metadata first, scope fallback (never the label). */
function requirementOwner(item: CurrentWorkChecklistItemVM): CurrentWorkRequirementOwner {
    return item.owner ?? resolveCurrentWorkRequirementOwner({ scope: item.scope });
}

type ReadinessOwnerGroup = { owner: CurrentWorkRequirementOwner; items: CurrentWorkChecklistItemVM[] };

/**
 * Group outstanding requirements by owning capability. Dedupes by owner+label (so the same
 * label under two owners is preserved as two groups — never collapsed into one). Group order
 * follows first appearance in the runtime projection.
 */
function groupStillNeededByOwner(items: CurrentWorkChecklistItemVM[]): ReadinessOwnerGroup[] {
    const groups: ReadinessOwnerGroup[] = [];
    const byOwnerKey = new Map<string, ReadinessOwnerGroup>();
    const seen = new Set<string>();
    for (const item of items) {
        if (item.status === "complete") continue;
        const label = item.label.trim();
        if (!label) continue;
        const owner = requirementOwner(item);
        const dedupeKey = `${owner.key}::${label.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        let group = byOwnerKey.get(owner.key);
        if (!group) {
            group = { owner, items: [] };
            byOwnerKey.set(owner.key, group);
            groups.push(group);
        }
        group.items.push(item);
    }
    return groups;
}

/** Synthetic navigation target so the group-level "Open {owner} →" reuses the checklist handoff. */
function ownerHandoffItem(owner: CurrentWorkRequirementOwner): CurrentWorkChecklistItemVM {
    return { key: `owner:${owner.key}`, label: owner.label, status: "missing", owner };
}

/**
 * What's Next readiness — a CONCISE "Still needed" summary grouped by owning capability
 * (Slice E). Never a progress meter or requirement count; the satisfied field inventory is
 * owned by the Required Information card. Derives entirely from the View Model.
 */
export function ReadinessSummary({
    surface,
    onNavigate,
}: {
    surface: CurrentWorkSurfaceVM;
    onNavigate: (item: CurrentWorkChecklistItemVM) => void;
}) {
    const items: CurrentWorkChecklistItemVM[] = surface.readiness.requirements?.items ?? [];
    const groups = groupStillNeededByOwner(items);
    if (groups.length === 0) return null;
    // Cap total requirement rows across groups (density); the rest defer to Required Information.
    const CAP = 4;
    let shown = 0;
    let overflow = 0;
    const visibleGroups: ReadinessOwnerGroup[] = [];
    for (const group of groups) {
        if (shown >= CAP) {
            overflow += group.items.length;
            continue;
        }
        const room = CAP - shown;
        const visibleItems = group.items.slice(0, room);
        overflow += group.items.length - visibleItems.length;
        visibleGroups.push({ owner: group.owner, items: visibleItems });
        shown += visibleItems.length;
    }
    return (
        <div className="alloy-os-currentwork__readiness-block" data-work-readiness="true" data-work-readiness-group="still-needed">
            <p className="alloy-os-currentwork__readiness-reason">Still needed</p>
            {visibleGroups.map((group) => (
                <div
                    key={group.owner.key}
                    className="alloy-os-currentwork__readiness-owner-group"
                    data-work-readiness-owner={group.owner.key}
                >
                    {/* The owner heading IS the navigation to its card (no separate "Open X →" link). */}
                    {group.owner.card ?
                        <button
                            type="button"
                            className="alloy-os-currentwork__readiness-owner alloy-os-currentwork__readiness-owner--link"
                            data-work-readiness-owner-link={group.owner.key}
                            onClick={() => onNavigate(ownerHandoffItem(group.owner))}
                        >
                            {group.owner.label}
                            <span className="alloy-os-currentwork__readiness-owner-arrow" aria-hidden>→</span>
                        </button>
                    :   <p className="alloy-os-currentwork__readiness-owner">{group.owner.label}</p>}
                    <ChecklistStepper items={group.items} onNavigate={onNavigate} />
                </div>
            ))}
            {overflow > 0 ?
                <p className="alloy-os-currentwork__disclosure-overflow">
                    +{overflow} more in Required information
                </p>
            :   null}
        </div>
    );
}

function ChecklistStepper({
    items,
    onNavigate,
}: {
    items: CurrentWorkChecklistItemVM[];
    onNavigate: (item: CurrentWorkChecklistItemVM) => void;
}) {
    if (items.length === 0) return null;
    return (
        <ol className="alloy-os-currentwork__stepper" data-work-checklist="true">
            {items.map((item, index) => {
                const navigable =
                    item.status !== "complete"
                    && (item.actionRef != null || item.handoffItemId != null || item.owner?.card != null);
                const mark =
                    item.status === "complete" ? "✓"
                    : item.status === "blocked" ? "!"
                    : "○";
                const content = (
                    <>
                        <span
                            className={clsx(
                                "alloy-os-currentwork__stepper-mark",
                                item.status === "complete" && "alloy-os-currentwork__stepper-mark--complete",
                            )}
                            aria-hidden
                        >
                            {mark}
                        </span>
                        <span className="alloy-os-currentwork__stepper-label">{item.label}</span>
                    </>
                );
                return (
                    <li key={item.key} className="alloy-os-currentwork__stepper-item">
                        {navigable ?
                            <button
                                type="button"
                                className="alloy-os-currentwork__stepper-button"
                                data-work-checklist-item={item.key}
                                onClick={() => onNavigate(item)}
                            >
                                {content}
                            </button>
                        :   <div className="alloy-os-currentwork__stepper-static" data-work-checklist-state={item.status}>
                                {content}
                            </div>
                        }
                        {index < items.length - 1 ?
                            <span className="alloy-os-currentwork__stepper-connector" aria-hidden />
                        :   null}
                    </li>
                );
            })}
        </ol>
    );
}
