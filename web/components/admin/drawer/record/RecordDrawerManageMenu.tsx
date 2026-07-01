"use client";

import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";

import { recordDrawerHeaderActionClassName } from "@/components/admin/drawer/record/recordDrawerHeaderActionClasses";
import { flattenRecordManageMenuActions } from "@/lib/admin/recordManage/buildRecordManageMenu";
import { RECORD_DRAWER_MANAGE_MENU_LABEL } from "@/lib/admin/recordManage/types";
import type { RecordManageMenuActionKey, RecordManageMenuItem } from "@/lib/admin/recordManage/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    /** Legacy entity admin stubs — person/vendor drawers. */
    items?: RecordManageMenuItem[];
    /** Registry-backed subject actions — same catalog as command rail. */
    registryActions?: ResolvedActionForClient[];
    inquiryWorkflow?: boolean;
    disabled?: boolean;
    disabledReason?: string | null;
    busyKey?: RecordManageMenuActionKey | null;
    onSelect?: (key: RecordManageMenuActionKey) => void;
    onRegistryActionSelect?: (action: ResolvedActionForClient) => void;
    registryActionLoadingKey?: string | null;
    proofLayoutActions?: boolean;
    emptyStateReason?: string | null;
};

/** Platform Manage dropdown — subject operational actions or legacy admin stubs. */
export function RecordDrawerManageMenu({
    items = [],
    registryActions,
    inquiryWorkflow = false,
    disabled = false,
    disabledReason = null,
    busyKey = null,
    onSelect,
    onRegistryActionSelect,
    registryActionLoadingKey = null,
    proofLayoutActions = false,
    emptyStateReason = "No actions available for this record.",
}: Props) {
    const registryMode = registryActions !== undefined;
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuPortalRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const menuId = useId();
    const btnClass = recordDrawerHeaderActionClassName(
        inquiryWorkflow,
        proofLayoutActions,
        proofLayoutActions ? "actions-white" : "default",
    );

    const selectableActions = useMemo(
        () => (registryMode ? registryActions : flattenRecordManageMenuActions(items)),
        [items, registryActions, registryMode],
    );

    const updateMenuPos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setMenuPos({
            top: rect.bottom + 6,
            left: rect.right,
            width: Math.max(rect.width, 176),
        });
    }, []);

    useLayoutEffect(() => {
        if (!open || !proofLayoutActions) return;
        updateMenuPos();
        const onReflow = () => updateMenuPos();
        window.addEventListener("resize", onReflow);
        window.addEventListener("scroll", onReflow, true);
        return () => {
            window.removeEventListener("resize", onReflow);
            window.removeEventListener("scroll", onReflow, true);
        };
    }, [open, proofLayoutActions, updateMenuPos]);

    const close = useCallback(() => {
        setOpen(false);
        setActiveIndex(0);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (ev: MouseEvent) => {
            const target = ev.target as Node;
            if (rootRef.current?.contains(target)) return;
            if (menuPortalRef.current?.contains(target)) return;
            close();
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") close();
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, close]);

    useEffect(() => {
        if (open) setActiveIndex(0);
    }, [open, selectableActions.length]);

    const menuDisabledReason =
        disabledReason?.trim() ||
        (disabled ? "Manage actions are unavailable for this record right now." : null);

    const itemClassName = (index: number, itemEnabled: boolean) =>
        `block w-full min-w-0 max-w-[16rem] truncate whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-alloy-blue/30 disabled:cursor-not-allowed disabled:opacity-45 ${
            disabled || !itemEnabled ?
                "cursor-not-allowed text-alloy-midnight/45"
            :   "text-alloy-midnight/88 hover:bg-alloy-blue/[0.09] active:bg-alloy-blue/[0.14] focus-visible:bg-alloy-blue/[0.08]"
        } ${index === activeIndex && !disabled && itemEnabled ? "bg-alloy-blue/[0.06]" : ""}`;

    const onTriggerKeyDown = (ev: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (selectableActions.length === 0) return;
        if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            setOpen(true);
        }
    };

    const onMenuKeyDown = (ev: ReactKeyboardEvent<HTMLDivElement>) => {
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, selectableActions.length - 1));
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (ev.key === "Home") {
            ev.preventDefault();
            setActiveIndex(0);
        } else if (ev.key === "End") {
            ev.preventDefault();
            setActiveIndex(Math.max(0, selectableActions.length - 1));
        } else if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            const a = selectableActions[activeIndex];
            if (!a || disabled) return;
            if (registryMode) {
                const action = a as ResolvedActionForClient;
                if (registryActionLoadingKey === action.key) return;
                close();
                onRegistryActionSelect?.(action);
                return;
            }
            const legacy = a as Extract<RecordManageMenuItem, { kind: "action" }>;
            if (legacy.enabled && busyKey !== legacy.key) {
                close();
                onSelect?.(legacy.key);
            }
        }
    };

    const renderRegistryMenuBody = () =>
        (registryActions ?? []).map((action, index) => {
            const itemDisabled = disabled || registryActionLoadingKey === action.key;
            return (
                <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    disabled={itemDisabled}
                    title={
                        registryActionLoadingKey === action.key ? "Action in progress…"
                        : menuDisabledReason ?
                            menuDisabledReason
                        :   action.label
                    }
                    aria-current={index === activeIndex ? "true" : undefined}
                    className={itemClassName(index, true)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                        if (itemDisabled) return;
                        close();
                        onRegistryActionSelect?.(action);
                    }}
                >
                    {registryActionLoadingKey === action.key ? "…" : action.label}
                </button>
            );
        });

    const renderLegacyMenuBody = () =>
        items.map((item, index) => {
            if (item.kind === "separator") {
                return (
                    <div
                        key={`sep-${index}`}
                        role="separator"
                        className="my-1 border-t border-alloy-stone/12"
                        aria-hidden
                    />
                );
            }
            const selectableIndex = selectableActions.findIndex(
                (a) => (a as Extract<RecordManageMenuItem, { kind: "action" }>).key === item.key,
            );
            const itemDisabled = disabled || !item.enabled || busyKey === item.key;
            return (
                <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={itemDisabled}
                    title={
                        busyKey === item.key ? "Action in progress…"
                        : !item.enabled ? "Coming soon"
                        : menuDisabledReason ?
                            menuDisabledReason
                        :   item.label
                    }
                    aria-current={selectableIndex === activeIndex ? "true" : undefined}
                    className={itemClassName(selectableIndex, item.enabled)}
                    onMouseEnter={() => {
                        if (selectableIndex >= 0) setActiveIndex(selectableIndex);
                    }}
                    onClick={() => {
                        if (itemDisabled || !item.enabled) return;
                        close();
                        onSelect?.(item.key);
                    }}
                >
                    {busyKey === item.key ? "…" : item.label}
                </button>
            );
        });

    const renderMenuBody = () => (registryMode ? renderRegistryMenuBody() : renderLegacyMenuBody());

    const menuShell = (portal: boolean) => {
        const className = portal
            ? "fixed z-[200] max-h-[min(22rem,70vh)] min-w-[11rem] max-w-[16rem] overflow-y-auto overflow-x-hidden rounded-none border border-alloy-stone/15 bg-gradient-to-b from-white via-white to-alloy-stone/[0.035] py-1.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)] ring-1 ring-alloy-stone/10 backdrop-blur-[2px]"
            : "absolute right-0 top-[calc(100%+6px)] z-[120] max-h-[min(22rem,70vh)] min-w-[11rem] max-w-[16rem] overflow-y-auto overflow-x-hidden rounded-xl border border-alloy-stone/15 bg-gradient-to-b from-white via-white to-alloy-stone/[0.035] py-1.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)] ring-1 ring-alloy-stone/10 backdrop-blur-[2px]";

        const shellProps = {
            id: menuId,
            role: "menu" as const,
            tabIndex: -1,
            "aria-label": "Record manage menu",
            onKeyDown: onMenuKeyDown,
            className,
            "data-record-drawer-manage-menu-portal": portal ? "true" : undefined,
        };

        if (portal && menuPos) {
            return createPortal(
                <div
                    ref={menuPortalRef}
                    {...shellProps}
                    style={{
                        top: menuPos.top,
                        left: menuPos.left,
                        transform: "translateX(-100%)",
                    }}
                >
                    {renderMenuBody()}
                </div>,
                document.body,
            );
        }

        return (
            <div {...shellProps}>
                {renderMenuBody()}
            </div>
        );
    };

    const emptyRegistry = registryMode && selectableActions.length === 0;
    const hideLegacy = !registryMode && items.length === 0;
    if (hideLegacy) return null;

    const triggerDisabled = disabled || emptyRegistry;
    const triggerTitle =
        emptyRegistry ? (emptyStateReason ?? "No actions available for this record.")
        : menuDisabledReason ?? undefined;

    return (
        <div ref={rootRef} className="relative shrink-0" data-record-drawer-manage-menu="true">
            <button
                ref={triggerRef}
                type="button"
                disabled={triggerDisabled}
                title={triggerTitle}
                className={`${btnClass} inline-flex items-center gap-1 transition-colors ${
                    triggerDisabled ? "cursor-not-allowed opacity-55" : "hover:bg-alloy-blue/[0.06] active:bg-alloy-blue/[0.11]"
                }`}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={menuId}
                data-focus-panel-manage-trigger={registryMode ? "true" : undefined}
                data-focus-panel-manage-empty={emptyRegistry ? "true" : undefined}
                onClick={() => {
                    if (triggerDisabled || selectableActions.length === 0) return;
                    setOpen((v) => !v);
                }}
                onKeyDown={onTriggerKeyDown}
            >
                <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden strokeWidth={2.2} />
                <span>{RECORD_DRAWER_MANAGE_MENU_LABEL}</span>
                <span className="text-[10px] opacity-60" aria-hidden>
                    ▾
                </span>
            </button>
            {open && selectableActions.length > 0 && (!proofLayoutActions || menuPos) ?
                proofLayoutActions ? menuShell(true) : menuShell(false)
            :   null}
        </div>
    );
}
