"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import {
    BadgeCheck,
    Building2,
    Cake,
    CalendarClock,
    CalendarDays,
    DoorOpen,
    GraduationCap,
    Mail,
    Phone,
    type LucideIcon,
} from "lucide-react";
import type { IdentityFieldCellVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

type InlineEditProps = {
    isEditing: boolean;
    onStartEdit: () => void;
    onCommit: (value: string) => void | Promise<void>;
    onCancel: () => void;
    busy?: boolean;
    /**
     * Parent owns Save/Cancel (person-level batch edit).
     * Input stays controlled via `draftValue` / `onDraftChange`.
     */
    sharedSession?: boolean;
    draftValue?: string;
    onDraftChange?: (value: string) => void;
};

type Props = {
    cell: IdentityFieldCellVM;
    className?: string;
    inlineEdit?: InlineEditProps;
    /** Legacy: open full edit surface (Children) when inline save is unavailable. */
    onEdit?: () => void;
    /** Linked policy: navigate to owning Focus Panel card. */
    onLink?: () => void;
};

const ICONS: Record<string, LucideIcon> = {
    phone: Phone,
    mail: Mail,
    cake: Cake,
    "graduation-cap": GraduationCap,
    "door-open": DoorOpen,
    "calendar-clock": CalendarClock,
    "calendar-days": CalendarDays,
    "badge-check": BadgeCheck,
    building: Building2,
};

function resolveIcon(name?: string): LucideIcon | null {
    if (!name) return null;
    return ICONS[name] ?? null;
}

export default function IdentityFieldValue({ cell, className, inlineEdit, onEdit, onLink }: Props) {
    const [draft, setDraft] = useState(cell.value ?? "");
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    const shared = Boolean(inlineEdit?.sharedSession);
    const controlledDraft = shared ? (inlineEdit?.draftValue ?? cell.value ?? "") : draft;

    useEffect(() => {
        if (shared) return;
        if (!inlineEdit?.isEditing) {
            setDraft(cell.value ?? "");
        }
    }, [cell.value, inlineEdit?.isEditing, shared]);

    useEffect(() => {
        if (shared) return;
        if (inlineEdit?.isEditing) {
            setDraft(cell.value ?? "");
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [inlineEdit?.isEditing, cell.value, shared]);

    if (!cell.value && cell.hideWhenEmpty && !inlineEdit?.isEditing) return null;
    const Icon = resolveIcon(cell.icon);
    const showLabel = cell.labelMode !== "hidden";
    const eyebrow = cell.labelMode === "eyebrow";
    const canInlineEdit = Boolean(cell.editable && inlineEdit);
    const canLegacyEdit = Boolean(cell.editable && onEdit && !inlineEdit);
    const canLink = Boolean(cell.linked && onLink && !canInlineEdit);

    const commit = async () => {
        if (!inlineEdit || inlineEdit.busy) return;
        await inlineEdit.onCommit(draft);
    };

    return (
        <div
            className={clsx(
                "identity-field-value",
                (canInlineEdit || canLegacyEdit) && "identity-field-value--inline-editable",
                canLink && "identity-field-value--linked",
                className,
            )}
            data-identity-field={cell.fieldRef}
            // Editability provenance (P4) — "why is this editable?" is browser-observable: `policy` is the
            // PUBLISHED config decision (editable | read-only), `editable` is the final state after the auth
            // (canMutate) and save-binding gates. policy=editable + editable=false ⇒ blocked by a runtime/auth
            // gate, not config. Config owns the base decision; the runtime only gates on permission/persistence.
            data-identity-policy={cell.policy}
            data-identity-editable={cell.editable ? "true" : "false"}
            data-identity-linked={cell.linked ? "true" : "false"}
            data-identity-link-destination={cell.linkDestination ?? undefined}
        >
            {showLabel ? (
                <span className={clsx("identity-field-value__label", eyebrow && "identity-field-value__label--eyebrow")}>
                    {Icon ? <Icon className="identity-field-value__icon" aria-hidden /> : null}
                    {cell.label}
                </span>
            ) : Icon ? (
                <Icon className="identity-field-value__icon identity-field-value__icon--solo" aria-hidden />
            ) : null}
            {inlineEdit?.isEditing ? (
                <input
                    ref={inputRef}
                    id={inputId}
                    className="identity-field-value__input"
                    value={controlledDraft}
                    disabled={inlineEdit.busy}
                    onChange={(event) => {
                        const next = event.target.value;
                        if (shared) {
                            inlineEdit.onDraftChange?.(next);
                        } else {
                            setDraft(next);
                        }
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (!shared) void commit();
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            inlineEdit.onCancel();
                        }
                    }}
                    aria-label={cell.label}
                />
            ) : (
                <span className="identity-field-value__value-row">
                    {canInlineEdit && inlineEdit ? (
                        <button
                            type="button"
                            className="identity-field-value__value identity-field-value__value--clickable"
                            title={cell.value ? String(cell.value) : undefined}
                            onClick={inlineEdit.onStartEdit}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    inlineEdit.onStartEdit();
                                }
                            }}
                        >
                            {cell.value ?? "—"}
                        </button>
                    ) : canLink && onLink ? (
                        <button
                            type="button"
                            className="identity-field-value__value identity-field-value__value--clickable identity-field-value__value--linked"
                            title={cell.linkLabel ?? `Open ${cell.label}`}
                            onClick={onLink}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    onLink();
                                }
                            }}
                        >
                            {cell.value ?? "—"}
                        </button>
                    ) : (
                        <span
                            className="identity-field-value__value"
                            title={cell.value ? String(cell.value) : undefined}
                        >
                            {cell.value ?? "—"}
                        </span>
                    )}
                    {canInlineEdit && inlineEdit ? (
                        <button
                            type="button"
                            className="identity-field-value__edit"
                            onClick={inlineEdit.onStartEdit}
                            aria-label={`Edit ${cell.label}`}
                        >
                            Edit
                        </button>
                    ) : canLink && onLink ? (
                        <button
                            type="button"
                            className="identity-field-value__edit identity-field-value__link"
                            onClick={onLink}
                            aria-label={cell.linkLabel ?? `Open ${cell.label}`}
                        >
                            {cell.linkLabel ?? "Open"}
                        </button>
                    ) : canLegacyEdit ? (
                        <button
                            type="button"
                            className="identity-field-value__edit"
                            onClick={onEdit}
                            aria-label={`Edit ${cell.label}`}
                        >
                            Edit
                        </button>
                    ) : null}
                </span>
            )}
            {inlineEdit?.isEditing && !shared ? (
                <span className="identity-field-value__inline-actions">
                    <button
                        type="button"
                        className="identity-field-value__edit"
                        disabled={inlineEdit.busy}
                        onClick={() => void commit()}
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        className="identity-field-value__edit identity-field-value__edit--cancel"
                        disabled={inlineEdit.busy}
                        onClick={inlineEdit.onCancel}
                    >
                        Cancel
                    </button>
                </span>
            ) : null}
        </div>
    );
}
