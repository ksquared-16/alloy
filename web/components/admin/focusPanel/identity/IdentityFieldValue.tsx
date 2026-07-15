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
};

type Props = {
    cell: IdentityFieldCellVM;
    className?: string;
    inlineEdit?: InlineEditProps;
    /** Legacy: open full edit surface (Children) when inline save is unavailable. */
    onEdit?: () => void;
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

export default function IdentityFieldValue({ cell, className, inlineEdit, onEdit }: Props) {
    const [draft, setDraft] = useState(cell.value ?? "");
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!inlineEdit?.isEditing) {
            setDraft(cell.value ?? "");
        }
    }, [cell.value, inlineEdit?.isEditing]);

    useEffect(() => {
        if (inlineEdit?.isEditing) {
            setDraft(cell.value ?? "");
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [inlineEdit?.isEditing, cell.value]);

    if (!cell.value && cell.hideWhenEmpty && !inlineEdit?.isEditing) return null;
    const Icon = resolveIcon(cell.icon);
    const showLabel = cell.labelMode !== "hidden";
    const eyebrow = cell.labelMode === "eyebrow";
    const canInlineEdit = Boolean(cell.editable && inlineEdit);
    const canLegacyEdit = Boolean(cell.editable && onEdit && !inlineEdit);

    const commit = async () => {
        if (!inlineEdit || inlineEdit.busy) return;
        await inlineEdit.onCommit(draft);
    };

    return (
        <div
            className={clsx(
                "identity-field-value",
                (canInlineEdit || canLegacyEdit) && "identity-field-value--inline-editable",
                className,
            )}
            data-identity-field={cell.fieldRef}
            data-identity-policy={cell.policy}
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
                    value={draft}
                    disabled={inlineEdit.busy}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            void commit();
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
            {inlineEdit?.isEditing ? (
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
