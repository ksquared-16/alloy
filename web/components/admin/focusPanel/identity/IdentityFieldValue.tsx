"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { useOptionSetSelectOptions } from "@/lib/admin/hooks/useOptionSetSelectOptions";
import { useOperationalPlacementOptions } from "@/lib/childcareOperational/useOperationalPlacementOptions";
import type { IdentityFieldCellVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import {
    resolveIdentityFieldEditControl,
    type IdentityFieldEditControl,
} from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldEditControl";
import { formatFocusPanelDate } from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { normalizeDob } from "@/lib/identity/normalizeDob";

type InlineEditProps = {
    isEditing: boolean;
    onStartEdit: () => void;
    onCommit: (
        value: string,
        meta?: { displayLabel?: string | null },
    ) => void | Promise<void>;
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
    /** Transient post-save confirmation owned by IdentityFieldGrid. */
    savedFlash?: boolean;
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

function IdentityInlineEditInput({
    cell,
    editControl,
    controlledDraft,
    inlineEdit,
    shared,
    setDraft,
    inputId,
    inputRef,
    commit,
}: {
    cell: IdentityFieldCellVM;
    editControl: IdentityFieldEditControl;
    controlledDraft: string;
    inlineEdit: InlineEditProps;
    shared: boolean;
    setDraft: (value: string) => void;
    inputId: string;
    inputRef: RefObject<HTMLInputElement | null>;
    commit: (meta?: { displayLabel?: string | null; valueOverride?: string }) => void | Promise<void>;
}) {
    const optionSetKeys =
        editControl.kind === "select" && inlineEdit.isEditing ? [editControl.optionSetKey] : [];
    const { optionsBySetKey } = useOptionSetSelectOptions(optionSetKeys);
    const siteLocationId =
        editControl.kind === "placement_select" ? (editControl.siteLocationId ?? "").trim() : "";
    const programCategoryId =
        editControl.kind === "placement_select" ? (editControl.programCategoryId ?? "").trim() : "";
    const placement = useOperationalPlacementOptions(siteLocationId, programCategoryId);
    const selectOptions = useMemo(() => {
        if (editControl.kind === "select") {
            return optionsBySetKey[editControl.optionSetKey] ?? [];
        }
        if (editControl.kind === "placement_select") {
            if (editControl.placement === "site") {
                return placement.siteOptions ?? [];
            }
            // Category-id values only — Focus Panel saves `program_category_id` FK.
            return placement.programCategoryIdOptions ?? [];
        }
        return [];
    }, [
        editControl,
        optionsBySetKey,
        placement.programCategoryIdOptions,
        placement.siteOptions,
    ]);

    // Display may store the option label; `<select>` values are keys — map label → value on edit.
    const selectValue = useMemo(() => {
        if (editControl.kind !== "select" && editControl.kind !== "placement_select") {
            return controlledDraft;
        }
        const raw = controlledDraft.trim();
        if (!raw) {
            // Prefer stored FK when display value is the label or empty (incl. lead→child inherit).
            if (editControl.kind === "placement_select" && editControl.placement === "site" && siteLocationId) {
                return siteLocationId;
            }
            if (editControl.kind === "placement_select" && programCategoryId) return programCategoryId;
            return "";
        }
        if (selectOptions.some((o) => o.value === raw)) return raw;
        const byLabel = selectOptions.find((o) => o.label === raw);
        return byLabel?.value ?? raw;
    }, [controlledDraft, editControl, selectOptions, programCategoryId, siteLocationId]);

    useEffect(() => {
        if (
            (editControl.kind !== "select" && editControl.kind !== "placement_select")
            || !inlineEdit.isEditing
        ) {
            return;
        }
        if (selectValue === controlledDraft) return;
        if (shared) {
            inlineEdit.onDraftChange?.(selectValue);
        } else {
            setDraft(selectValue);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sync once options resolve label→value
    }, [selectValue, editControl.kind, inlineEdit.isEditing]);

    const onDraftChange = (next: string) => {
        if (shared) {
            inlineEdit.onDraftChange?.(next);
        } else {
            setDraft(next);
        }
    };

    const commitWithMeta = () => {
        if (editControl.kind === "select" || editControl.kind === "placement_select") {
            const label =
                selectOptions.find((o) => o.value === selectValue)?.label
                ?? null;
            return commit({
                displayLabel: selectValue.trim() ? label : null,
                valueOverride: selectValue,
            });
        }
        return commit();
    };

    let control: ReactNode;
    if (editControl.kind === "select" || editControl.kind === "placement_select") {
        const useAlloySelect =
            cell.fieldRef === "child.gender"
            || cell.fieldRef.endsWith(".gender")
            || cell.fieldRef.includes("assignment")
            || cell.fieldRef.includes("program")
            || cell.fieldRef.includes("location")
            || cell.fieldRef.includes("room")
            || cell.fieldRef.includes("schedule");
        const selectDisabled =
            Boolean(inlineEdit.busy)
            || (editControl.kind === "placement_select"
                && editControl.placement === "program"
                && placement.programDisabled);
        control = useAlloySelect ? (
            <AlloySelect
                value={selectValue}
                onChange={onDraftChange}
                options={selectOptions}
                disabled={selectDisabled}
                aria-label={cell.label}
                testId="identity-field-select"
            />
        ) : (
            <SelectFieldControl
                value={selectValue}
                onChange={onDraftChange}
                options={selectOptions}
                disabled={selectDisabled}
                className="identity-field-value__input identity-field-value__select"
                aria-label={cell.label}
                data-testid="identity-field-select"
            />
        );
    } else if (editControl.kind === "date") {
        control = (
            <input
                ref={inputRef}
                id={inputId}
                type="date"
                className="identity-field-value__input"
                value={controlledDraft}
                disabled={inlineEdit.busy}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        if (!shared) void commitWithMeta();
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        inlineEdit.onCancel();
                    }
                }}
                aria-label={cell.label}
            />
        );
    } else {
        control = (
            <input
                ref={inputRef}
                id={inputId}
                className="identity-field-value__input"
                type={editControl.inputType}
                value={controlledDraft}
                disabled={inlineEdit.busy}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        if (!shared) void commitWithMeta();
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        inlineEdit.onCancel();
                    }
                }}
                aria-label={cell.label}
            />
        );
    }

    return (
        <>
            {control}
            {!shared ? (
                <span className="identity-field-value__inline-actions">
                    <button
                        type="button"
                        className="identity-field-value__edit"
                        disabled={inlineEdit.busy}
                        onClick={() => void commitWithMeta()}
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
        </>
    );
}

export default function IdentityFieldValue({
    cell,
    className,
    savedFlash = false,
    inlineEdit,
    onEdit,
    onLink,
}: Props) {
    const [draft, setDraft] = useState(cell.value ?? "");
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    const shared = Boolean(inlineEdit?.sharedSession);

    const editControl = useMemo(
        () => cell.editControl ?? resolveIdentityFieldEditControl(cell.fieldRef),
        [cell.editControl, cell.fieldRef],
    );

    const controlledDraft = (() => {
        const raw = shared ? (inlineEdit?.draftValue ?? cell.value ?? "") : draft;
        if (editControl.kind === "date" && inlineEdit?.isEditing) {
            return normalizeDob(raw) ?? raw;
        }
        return raw;
    })();

    useEffect(() => {
        if (shared) return;
        if (!inlineEdit?.isEditing) {
            setDraft(cell.value ?? "");
        }
    }, [cell.value, inlineEdit?.isEditing, shared]);

    useEffect(() => {
        if (shared) return;
        if (!inlineEdit?.isEditing) return;
        const seed = (() => {
            if (editControl.kind === "placement_select" && editControl.programCategoryId?.trim()) {
                return editControl.programCategoryId.trim();
            }
            if (editControl.kind === "date") {
                return normalizeDob(cell.value) ?? "";
            }
            return cell.value ?? "";
        })();
        setDraft(seed);
        if (editControl.kind === "select" || editControl.kind === "placement_select") return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [inlineEdit?.isEditing, cell.value, shared, editControl]);

    const Icon = resolveIcon(cell.icon);
    const showLabel = cell.labelMode !== "hidden";
    const eyebrow = cell.labelMode === "eyebrow";
    const canInlineEdit = Boolean(cell.editable && inlineEdit);
    const canLegacyEdit = Boolean(cell.editable && onEdit && !inlineEdit);
    const canLink = Boolean(cell.linked && onLink && !canInlineEdit);
    const valueText = cell.value?.trim() ?? "";
    const displayValueText =
        editControl.kind === "date" && valueText
            ? (formatFocusPanelDate(valueText) ?? valueText)
            : valueText;
    // Empty/hidden fields are removed in `resolveIdentityFieldRows` before packing.
    // Never return null here — late nulls leave pair/triple grid holes (field collision).

    const commit = async (meta?: { displayLabel?: string | null; valueOverride?: string }) => {
        if (!inlineEdit || inlineEdit.busy) return;
        // Prefer selectValue when editing a choice field so Save writes the option key, not the label.
        // Date fields must commit ISO YYYY-MM-DD (never a formatted display string).
        const raw = meta?.valueOverride ?? (shared ? controlledDraft : draft);
        const value =
            editControl.kind === "date" ? (normalizeDob(raw) ?? raw.trim()) : raw;
        await inlineEdit.onCommit(value, meta);
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
            data-identity-edit-control={editControl.kind}
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
            ) : null}
            {inlineEdit?.isEditing ? (
                <span className="identity-field-value__value-row">
                    {!showLabel && Icon ? (
                        <Icon className="identity-field-value__icon identity-field-value__icon--solo" aria-hidden />
                    ) : null}
                    <IdentityInlineEditInput
                        cell={cell}
                        editControl={editControl}
                        controlledDraft={controlledDraft}
                        inlineEdit={inlineEdit}
                        shared={shared}
                        setDraft={setDraft}
                        inputId={inputId}
                        inputRef={inputRef}
                        commit={commit}
                    />
                </span>
            ) : (
                <span className="identity-field-value__value-row">
                    {!showLabel && Icon ? (
                        <Icon className="identity-field-value__icon identity-field-value__icon--solo" aria-hidden />
                    ) : null}
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
                            {displayValueText || "—"}
                        </button>
                    ) : canLink && onLink ? (
                        <button
                            type="button"
                            className="identity-field-value__value identity-field-value__value--clickable identity-field-value__value--linked"
                            title={cell.linkLabel ? `${cell.linkLabel}: ${displayValueText || cell.label}` : `Open ${cell.label}`}
                            onClick={onLink}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    onLink();
                                }
                            }}
                        >
                            <span className="identity-field-value__linked-text">{displayValueText || "—"}</span>
                            <span className="identity-field-value__nav-cue" aria-hidden>
                                →
                            </span>
                        </button>
                    ) : (
                        <span
                            className="identity-field-value__value"
                            title={displayValueText || undefined}
                        >
                            {displayValueText || "—"}
                        </span>
                    )}
                    {savedFlash ? (
                        <span
                            className="identity-field-value__saved"
                            data-identity-saved="true"
                            role="status"
                            aria-live="polite"
                        >
                            ✓ Saved
                        </span>
                    ) : canInlineEdit && inlineEdit ? (
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
            {cell.derivedSourceLabel ? (
                <span
                    className="identity-field-value__derived"
                    data-identity-derived-source={cell.fieldRef}
                >
                    {cell.derivedSourceLabel}
                </span>
            ) : null}
        </div>
    );
}
