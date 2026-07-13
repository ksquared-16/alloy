"use client";

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

type Props = {
    cell: IdentityFieldCellVM;
    className?: string;
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

export default function IdentityFieldValue({ cell, className, onEdit }: Props) {
    if (!cell.value && cell.hideWhenEmpty) return null;
    const Icon = resolveIcon(cell.icon);
    const showLabel = cell.labelMode !== "hidden";
    const eyebrow = cell.labelMode === "eyebrow";

    return (
        <div
            className={clsx("identity-field-value", className)}
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
            <span
                className="identity-field-value__value"
                title={cell.value ? String(cell.value) : undefined}
            >
                {cell.value ?? "—"}
            </span>
            {cell.editable && onEdit ? (
                <button type="button" className="identity-field-value__edit" onClick={onEdit}>
                    Edit
                </button>
            ) : null}
        </div>
    );
}
