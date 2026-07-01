/**
 * Live queue row click audit — enable with NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG=1
 */

import { isQueueRowInteractiveControlTarget } from "@/lib/layout/runtime/layoutRuntimeAdornmentClick";
import { summarizeLayoutRuntimeChildRowForDebug } from "@/lib/layout/runtime/enrichLayoutRuntimeChildRowIdentifiers";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export function isQueueRowClickDebugEnabled(): boolean {
    return process.env.NEXT_PUBLIC_QUEUE_ROW_CLICK_DEBUG === "1";
}

function clientEnabled(): boolean {
    if (!isQueueRowClickDebugEnabled()) return false;
    if (typeof window !== "undefined") return true;
    return process.env.NODE_ENV === "test";
}

function targetSummary(target: EventTarget | null): Record<string, unknown> {
    if (!(target instanceof Element)) {
        return { kind: typeof target };
    }
    const el = target;
    const closest = (sel: string) => Boolean(el.closest(sel));
    return {
        tag: el.tagName.toLowerCase(),
        className: el.className || null,
        id: el.id || null,
        dataQueueRowLink: el.getAttribute("data-queue-row-link"),
        dataLayoutRuntimeAdornmentLink: el.getAttribute("data-layout-runtime-adornment-link"),
        dataLayoutRuntimeAdornmentEntity: el.getAttribute("data-layout-runtime-adornment-entity"),
        dataQueueRowInteractive: el.getAttribute("data-queue-row-interactive"),
        closestOperationalRow: closest(".operational-queue-row"),
        closestLinkedField: closest(".operational-queue-row__linked-field"),
        closestLinkIconBtn: closest(".operational-queue-row__link-icon-btn"),
        closestLayoutRuntimeQueueRow: closest("[data-layout-runtime-queue-row]"),
        closestOperationalCard: closest("[data-queue-row-operational-card]"),
    };
}

export type QueueRowClickDebugEntry = {
    phase:
        | "dom_click"
        | "interactive_guard"
        | "link_dispatch"
        | "row_open"
        | "person_open"
        | "child_open"
        | "record_open"
        | "propagation";
    surface: string;
    handler?: string;
    interactiveTarget?: boolean;
    propagationStopped?: boolean;
    defaultPrevented?: boolean;
    linkTarget?: string | null;
    resolvedEntityId?: string | null;
    dispatchOk?: boolean;
    recordContext?: Record<string, unknown>;
    target?: Record<string, unknown>;
    extra?: Record<string, unknown>;
};

export function logQueueRowClickDebug(entry: QueueRowClickDebugEntry): void {
    if (!clientEnabled()) return;
    console.info("[queue_row_click_debug]", {
        ...entry,
        ts: Date.now(),
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });
}

export function logQueueRowDomClick(
    surface: string,
    event: Pick<MouseEvent, "target" | "defaultPrevented"> & { eventPhase?: number },
    extra?: Record<string, unknown>,
): void {
    if (!clientEnabled()) return;
    const target = event.target;
    logQueueRowClickDebug({
        phase: "dom_click",
        surface,
        target: targetSummary(target),
        defaultPrevented: event.defaultPrevented,
        interactiveTarget: isQueueRowInteractiveControlTarget(target),
        extra,
    });
}

export function logQueueRowInteractiveGuard(
    surface: string,
    target: EventTarget | null,
    allowed: boolean,
    handler: string,
): void {
    if (!clientEnabled()) return;
    logQueueRowClickDebug({
        phase: "interactive_guard",
        surface,
        handler,
        interactiveTarget: isQueueRowInteractiveControlTarget(target),
        target: targetSummary(target),
        extra: { allowed },
    });
}

export function logQueueRowLinkDispatch(input: {
    surface: string;
    linkTarget: string;
    resolvedEntityId: string | null;
    dispatchOk: boolean;
    record?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
    propagationStopped?: boolean;
    handler?: string;
}): void {
    if (!clientEnabled()) return;
    const childSummary =
        input.record && (input.linkTarget === "child_drawer" || input.linkTarget === "related_record_drawer")
            ? summarizeLayoutRuntimeChildRowForDebug(input.record)
            : null;
    logQueueRowClickDebug({
        phase: "link_dispatch",
        surface: input.surface,
        handler: input.handler ?? "dispatchLinkedDrawerOpen",
        linkTarget: input.linkTarget,
        resolvedEntityId: input.resolvedEntityId,
        dispatchOk: input.dispatchOk,
        propagationStopped: input.propagationStopped,
        recordContext: childSummary ?? {
            opportunityId: input.anchorRecord?.["opportunity.id"] ?? input.anchorRecord?.id ?? null,
            primaryPersonId:
                input.anchorRecord?.["opportunity.primary_person_id"] ?? input.anchorRecord?.["person.id"] ?? null,
        },
        extra: childSummary ? { rowJson: childSummary.rowJson } : undefined,
    });
}

export function logQueueRowOpenHandler(
    kind: "row_open" | "person_open" | "child_open" | "record_open",
    surface: string,
    handler: string,
    entityId?: string | null,
): void {
    if (!clientEnabled()) return;
    logQueueRowClickDebug({
        phase: kind,
        surface,
        handler,
        resolvedEntityId: entityId ?? null,
    });
}
