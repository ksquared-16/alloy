"use client";

/**
 * Waitlist placement adjustment — a COMPACT POPOVER ANCHORED TO THE ROW.
 *
 * It drives the existing manual-position admin command
 * (POST /api/admin/placement-candidates/[id]/manual-position). No queue-local rank mutation, no
 * second ranking rule, and the placement authority is unchanged.
 *
 * ── WHY THIS IS NO LONGER A CENTERED MODAL ──
 *
 * Nudging one row by one place opened a full-screen backdrop and a centred dialog: the operator lost
 * sight of the row they were adjusting, and a small correction cost a large interaction. The popover
 * stays visually attached to its row, so the thing being changed and the control changing it are on
 * screen together.
 *
 * Two further simplifications, both about not asking for more than the task needs:
 *   POSITION is a dropdown of the positions the model can actually express (see
 *   `waitlistAdjustPositionModel`), with Custom for the rest — replacing a free-text 1-999 box that
 *   happily accepted numbers meaningless in this row's group.
 *   REASON is optional and hidden behind "Add reason", because most adjustments do not need one and
 *   an always-present empty field reads as required.
 */

import { broadcastWorkspaceMutation } from "@/lib/adminV2/workspaceRefreshBroadcast";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    ALLOY_MENU_SURFACE,
    ALLOY_MENU_TRIGGER,
    alloyMenuItemClassName,
} from "@/lib/ui-v2/alloyMenuClassNames";
import {
    isValidWaitlistAdjustPosition,
    waitlistAdjustPositionModel,
    type WaitlistAdjustPositionModel,
} from "@/lib/ui-v2/waitlistAdjustPositionOptions";
import { useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { ATTENTION_SCOPE, type AttentionSource } from "@/lib/runtime/kernel/attention";
import { provisioningKey } from "@/lib/runtime/kernel/provisioning";

type Props = {
    placementCandidateId: string;
    /** Current operator-facing position label when known (e.g. "Position 1/1"). */
    currentPositionLabel?: string | null;
    childDisplayName?: string | null;
    /** Canonical precedence reason from placement — never inferred from rendered order. */
    precedenceReason?: string | null;
    /**
     * Authoritative GROUP-LOCAL range from the placement engine
     * (`runtime_group_position` / `runtime_group_total`). Bounds the selectable positions.
     * `currentPositionLabel` is SECTION-scoped and is only a fallback when no group range is
     * published — bounding on it offered positions the write had to clamp.
     */
    group?: { position?: number | null; total?: number | null } | null;
};

export function WaitlistPlacementAdjustControl({
    placementCandidateId,
    currentPositionLabel,
    childDisplayName,
    precedenceReason,
    group,
}: Props) {
    const [open, setOpen] = useState(false);
    const titleId = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    /*
     * The ANCHOR, as an element rather than a layout parent.
     *
     * The popover used to be laid out INSIDE this row (`absolute` under a `relative` span), which made
     * its geometry the row's business. Measured with real pointer input: `pointerdown` landed on the
     * menu trigger and `pointerup` landed on the row's own secondary span behind it, so the browser
     * synthesised the click on their common ancestor and the trigger's handler never ran — the control
     * simply did not respond to a mouse. Keeping it as state (not a ref) is what lets the portal
     * re-position when the anchor first mounts.
     */
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    // Focus returns to the trigger on close, so keyboard operators are never dropped at the top of
    // the queue after adjusting a row deep in it.
    const close = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);

    return (
        <span className="relative inline-flex" data-waitlist-adjust-anchor>
            <button
                ref={(el) => {
                    triggerRef.current = el;
                    setAnchorEl(el);
                }}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open ? true : undefined}
                data-queue-row-waitlist-adjust
                data-placement-candidate-id={placementCandidateId}
                title="Adjust waitlist position"
                className="bg-transparent p-0 text-[10px] font-semibold leading-[13px] text-alloy-bend-pine underline decoration-alloy-bend-pine/35 underline-offset-2 hover:decoration-alloy-bend-pine"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                Adjust
            </button>
            {open && anchorEl ? (
                <WaitlistPlacementAdjustPopover
                    anchorEl={anchorEl}
                    titleId={titleId}
                    placementCandidateId={placementCandidateId}
                    currentPositionLabel={currentPositionLabel}
                    childDisplayName={childDisplayName}
                    precedenceReason={precedenceReason}
                    group={group}
                    onClose={close}
                />
            ) : null}
        </span>
    );
}

function WaitlistPlacementAdjustPopover({
    anchorEl,
    titleId,
    placementCandidateId,
    currentPositionLabel,
    childDisplayName,
    precedenceReason,
    group,
    onClose,
}: {
    anchorEl: HTMLElement;
    titleId: string;
    placementCandidateId: string;
    currentPositionLabel?: string | null;
    childDisplayName?: string | null;
    precedenceReason?: string | null;
    /** Authoritative group-local range from the placement engine — bounds the control. */
    group?: { position?: number | null; total?: number | null } | null;
    onClose: () => void;
}) {
    const kernel = useRuntimeKernel();
    const model = waitlistAdjustPositionModel(currentPositionLabel, precedenceReason, group);
    // Opens on the row's CURRENT position, so applying without touching the dropdown is a no-op
    // rather than a silent move to 1 — the old default.
    const [pinOrdinal, setPinOrdinal] = useState(String(model.current ?? 1));
    const [custom, setCustom] = useState(model.options.length === 0);
    const [showReason, setShowReason] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const panelRef = useRef<HTMLDivElement | null>(null);

    /*
     * ANCHORED, NOT NESTED — the same doctrine `QueueRecordAttentionPopover` already uses for a
     * queue-row widget: portal to the body, position `fixed` from the anchor's rect, and recompute on
     * resize and on CAPTURE-phase scroll so a scrolling row moves the panel with it instead of
     * dragging it out of alignment or clipping it. This is not a new overlay framework; it is the
     * existing one, applied to a control that had been left laid out inside the row.
     */
    const PANEL_WIDTH = 236;
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    useEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            // Right-aligned to the trigger, as before, then clamped into the viewport so a row near
            // the edge cannot push the panel off-screen.
            const left = Math.min(
                Math.max(12, rect.right - PANEL_WIDTH),
                Math.max(12, window.innerWidth - PANEL_WIDTH - 12),
            );
            // Flip above the trigger when there is not room below.
            const below = rect.bottom + 6;
            const estimatedHeight = panelRef.current?.getBoundingClientRect().height ?? 220;
            const top =
                below + estimatedHeight > window.innerHeight - 12 && rect.top - estimatedHeight - 6 > 12
                    ? rect.top - estimatedHeight - 6
                    : below;
            setPos({ top, left });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [anchorEl]);

    useEffect(() => {
        setMounted(true);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        // Dismiss on an outside press rather than behind a full-screen backdrop, so the rest of the
        // queue stays live and clickable while the popover is open.
        const onDown = (e: PointerEvent) => {
            const el = panelRef.current;
            if (!(e.target instanceof Node)) return;
            // The anchor counts as inside: the panel is portaled now, so the trigger is no longer a
            // DOM ancestor of it and would otherwise read as an outside press.
            if (anchorEl.contains(e.target)) return;
            if (el && !el.contains(e.target)) onClose();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerdown", onDown, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerdown", onDown, true);
        };
    }, [onClose, anchorEl]);

    /*
     * CONVERGE, NEVER RELOAD.
     *
     * Both fallbacks here used to call `window.location.reload()`. Whether they fired depended on
     * whether attention happened to carry a lens, so adjusting a waitlist position reloaded the whole
     * document SOMETIMES — which is precisely how an unexplained "the app just refreshed" is
     * experienced, and why it reads as random rather than reproducible.
     *
     * The reload was doing real work: it guaranteed the operator saw the new order. So it is replaced
     * by the canonical signal that carries the SAME guarantee, not by nothing.
     * `placement_manual_order` is registered as a queue-membership-changing action key, so listeners
     * refetch rows AND counts on the broadcast rather than patching a row they can see. The lens path
     * is unchanged — it already converged correctly.
     */
    const refreshQueue = useCallback(() => {
        const current = kernel.attention.get();
        const lens = current?.lens ?? current?.destination?.workViewId;
        if (current && (current.lens || current.target)) {
            kernel.provisioning.invalidate(provisioningKey(current));
        }
        if (lens) {
            kernel.attention.move({
                scope: ATTENTION_SCOPE.LENS,
                lens,
                source: "work_view_selection" satisfies AttentionSource,
            });
            return;
        }
        // No lens to re-commit: tell every derived surface to re-read instead of reloading the page.
        broadcastWorkspaceMutation("placement_manual_order");
    }, [kernel]);

    async function submit(action: "move" | "reset") {
        setBusy(true);
        setError(null);
        try {
            const body: Record<string, unknown> =
                action === "reset"
                    ? { action: "reset", reason: reason.trim() || "Reset manual waitlist position" }
                    : {
                          action: "move",
                          pin_ordinal: Number.parseInt(pinOrdinal, 10),
                          reason: reason.trim() || "Manual waitlist position adjustment",
                      };
            if (action === "move") {
                const n = Number.parseInt(pinOrdinal, 10);
                if (!isValidWaitlistAdjustPosition(n, model)) {
                    // Bounded by THIS ROW's scope, not the command's 1-999 guard: a position past the
                    // end of its group is a move the model cannot express, so it is refused here
                    // rather than sent and rendered as something the operator did not ask for.
                    setError(
                        model.total != null
                            ? `Enter a position between 1 and ${model.total}.`
                            : "Enter a position of 1 or more.",
                    );
                    setBusy(false);
                    return;
                }
            }
            const res = await fetch(
                `/api/admin/placement-candidates/${encodeURIComponent(placementCandidateId)}/manual-position`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                setError(payload.error?.trim() || `Could not adjust position (${res.status})`);
                setBusy(false);
                return;
            }
            onClose();
            refreshQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not adjust position");
            setBusy(false);
        }
    }

    if (!mounted) return null;

    const positionField = custom ? (
        <input
            type="number"
            min={1}
            max={model.total ?? 999}
            autoFocus
            value={pinOrdinal}
            onChange={(e) => setPinOrdinal(e.target.value)}
            className="mt-1 w-full rounded-[8px] border bg-white px-2 py-1 text-[12px] text-alloy-midnight outline-none focus:ring-2"
            style={{ borderColor: "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 22%, var(--alloy-os-border, #e5e9ef))" }}
            data-waitlist-adjust-pin-ordinal
        />
    ) : (
        <PositionMenu
            value={pinOrdinal}
            model={model}
            onPick={(next) => {
                if (next === "__custom") {
                    setCustom(true);
                    return;
                }
                setPinOrdinal(next);
            }}
        />
    );

    if (!pos) return null;

    return createPortal(
        <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            data-waitlist-placement-adjust-popover
            className="fixed z-[120] w-[236px] text-left"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                top: pos.top,
                left: pos.left,
                border: "1px solid var(--alloy-os-fp-card-border, color-mix(in srgb, #273f52 30%, #dde3eb))",
                borderRadius: "var(--alloy-os-fp-card-radius, 12px)",
                boxShadow: "var(--alloy-os-fp-card-shadow, 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -12px rgba(15,23,42,0.12))",
                background: "var(--alloy-os-fp-card-surface, #fff)",
            }}
        >
            <div className="px-3 pt-2.5">
                <h2 id={titleId} className="text-[12px] font-semibold text-alloy-midnight">
                    Adjust position
                </h2>
                <p className="mt-0.5 text-[10px] leading-[13px] text-alloy-midnight/55">
                    {childDisplayName ? `${childDisplayName} · ` : null}
                    {currentPositionLabel?.trim() || "Placement ranking"}
                </p>
            </div>
            <div className="px-3 pb-2 pt-2">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/60">
                    {model.scopedToGroup ? "Group position" : "Position"}
                    {positionField}
                </label>
                {custom && model.options.length > 0 ? (
                    <button
                        type="button"
                        className="mt-1 bg-transparent p-0 text-[10px] font-medium text-alloy-bend-pine underline underline-offset-2"
                        onClick={() => {
                            setCustom(false);
                            setPinOrdinal(String(model.current ?? 1));
                        }}
                    >
                        Use list
                    </button>
                ) : null}
                {showReason ? (
                    <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.05em] text-alloy-midnight/60">
                        Reason
                        <input
                            type="text"
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mt-1 w-full rounded-[8px] border bg-white px-2 py-1 text-[12px] text-alloy-midnight outline-none focus:ring-2"
                            style={{ borderColor: "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 22%, var(--alloy-os-border, #e5e9ef))" }}
                            data-waitlist-adjust-reason
                        />
                    </label>
                ) : (
                    <button
                        type="button"
                        className="mt-2 bg-transparent p-0 text-[11px] font-medium text-alloy-bend-pine underline underline-offset-2"
                        onClick={() => setShowReason(true)}
                        data-waitlist-adjust-add-reason
                    >
                        Add reason
                    </button>
                )}
                {error ? (
                    <p className="mt-1.5 text-[11px] font-medium text-alloy-ember" role="alert" data-waitlist-adjust-error>
                        {error}
                    </p>
                ) : null}
            </div>
            <div
                className="flex items-center justify-between gap-1.5 border-t px-3 py-2"
                style={{ borderColor: "color-mix(in srgb, var(--alloy-os-bend-pine, #00a283) 18%, var(--alloy-os-border, #e5e9ef))" }}
            >
                <button
                    type="button"
                    className="bg-transparent p-0 text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-bend-pine disabled:opacity-60"
                    onClick={() => void submit("reset")}
                    disabled={busy}
                    data-waitlist-adjust-reset
                >
                    Clear adjustment
                </button>
                <span className="flex items-center gap-1.5">
                    <button
                        type="button"
                        className="rounded-[8px] border bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:text-alloy-bend-pine disabled:opacity-60"
                        style={{ borderColor: "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 18%, var(--alloy-os-border, #e5e9ef))" }}
                        onClick={onClose}
                        disabled={busy}
                        data-waitlist-adjust-cancel
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-[8px] border px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        style={{ background: "var(--alloy-os-bend-pine, #00a283)", borderColor: "var(--alloy-os-bend-pine, #00a283)" }}
                        onClick={() => void submit("move")}
                        disabled={busy}
                        data-waitlist-adjust-submit
                    >
                        {busy ? "Saving…" : "Apply"}
                    </button>
                </span>
            </div>
        </div>,
        document.body,
    );
}

/**
 * The Position control — an Alloy menu, not the browser's grey `<select>`.
 *
 * A native select cannot be styled to Alloy's surface on macOS: it renders the platform widget, which
 * is why staging showed a grey OS control inside an Alloy popover. This is a button and a list using
 * the SHARED menu surface (`alloyMenuClassNames`), so it looks like the Manage menu because it is
 * literally the same classes — not a second visual implementation that will drift.
 *
 * The keyboard contract a select gave for free is restated deliberately: the trigger opens on
 * Down/Enter/Space, the list moves on Up/Down, Enter commits, and Escape closes the LIST only —
 * stopping there so one Escape does not also dismiss the adjust popover behind it.
 */
function PositionMenu({
    value,
    model,
    onPick,
}: {
    value: string;
    model: WaitlistAdjustPositionModel;
    onPick: (next: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const items: Array<{ value: string; label: string }> = [
        ...model.options.map((n) => ({
            value: String(n),
            label: n === model.current ? `${n} (current)` : String(n),
        })),
        { value: "__custom", label: "Custom…" },
    ];
    const selectedIndex = Math.max(0, items.findIndex((i) => i.value === value));
    const currentLabel = items[selectedIndex]?.label ?? value;

    useEffect(() => {
        if (!open) return;
        setActiveIndex(selectedIndex);
        // The list owns the keys while it is open; without focus the arrows would fall through to
        // the popover and the control would lose the behaviour a native select gave for free.
        listRef.current?.focus();
    }, [open, selectedIndex]);

    // Closing on an outside press keeps the menu from outliving the gesture. Scoped to the menu:
    // the popover owns its own dismissal and must not be closed by this.
    useEffect(() => {
        if (!open) return;
        const onDown = (ev: PointerEvent) => {
            const t = ev.target as Node | null;
            if (listRef.current?.contains(t as Node)) return;
            if (triggerRef.current?.contains(t as Node)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown, true);
        return () => document.removeEventListener("pointerdown", onDown, true);
    }, [open]);

    const commit = (next: string) => {
        setOpen(false);
        triggerRef.current?.focus();
        onPick(next);
    };

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                className={ALLOY_MENU_TRIGGER}
                style={{ borderColor: "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 22%, var(--alloy-os-border, #e5e9ef))" }}
                data-waitlist-adjust-pin-ordinal
                data-value={value}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span className="truncate">{currentLabel}</span>
                <span aria-hidden className="text-[10px] opacity-55">▾</span>
            </button>
            {open ? (
                <div
                    ref={listRef}
                    role="listbox"
                    tabIndex={-1}
                    aria-activedescendant={`wl-pos-${activeIndex}`}
                    className={`${ALLOY_MENU_SURFACE} absolute left-0 right-0 top-[calc(100%+4px)]`}
                    data-waitlist-adjust-position-menu
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            // The LIST only. The popover behind it stays open.
                            e.preventDefault();
                            e.stopPropagation();
                            setOpen(false);
                            triggerRef.current?.focus();
                            return;
                        }
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setActiveIndex((i) => (i + 1) % items.length);
                            return;
                        }
                        if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setActiveIndex((i) => (i - 1 + items.length) % items.length);
                            return;
                        }
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const picked = items[activeIndex];
                            if (picked) commit(picked.value);
                            return;
                        }
                        if (e.key === "Tab") setOpen(false);
                    }}
                >
                    {items.map((item, index) => (
                        <button
                            key={item.value}
                            id={`wl-pos-${index}`}
                            type="button"
                            role="option"
                            aria-selected={item.value === value}
                            className={alloyMenuItemClassName({
                                active: index === activeIndex,
                                selected: item.value === value,
                            })}
                            data-waitlist-adjust-position-option={item.value}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => commit(item.value)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

