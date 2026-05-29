"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { normalizePhone } from "@/lib/contactNormalize";
import {
    buildPersonContactCardPatch,
    isPersonContactCardDirty,
    patchLinkedPersonFromOpportunityDrawer,
    PERSON_CONTACT_CARD_SAVE_DELAY_MS,
    personContactCardHasEditableField,
    type PersonContactCardFieldGate,
    type PersonContactCardFieldKey,
    type PersonContactCardValues,
} from "@/lib/admin/drawer/primaryPersonCardEdit";
import { openViewPersonFromOpportunity, prefetchViewPersonOnHover, prefetchViewPersonOnPointerDown } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import { personDrawerOpenSeedFromContactValues } from "@/lib/admin/drawer/personDrawerOpenSeed";
import {
    logViewPersonClickLive,
    viewPersonLiveDiagAttrs,
} from "@/lib/admin/drawer/viewPersonClickLiveDiagnostics";
import ViewPersonDrawerIconButton from "@/components/admin/drawer/ViewPersonDrawerIconButton";
import {
    oppInqContactChannelLink,
    oppInqContactRow,
    oppInqContactSep,
    oppInqFieldInput,
    oppInqMutedEmpty,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

const FIELD_LABEL: Record<PersonContactCardFieldKey, string> = {
    first_name: "First name",
    last_name: "Last name",
    email: "Email",
    phone: "Phone",
};

const INLINE_INPUT =
    "w-full min-w-0 rounded-md border border-alloy-stone/20 bg-white px-1.5 py-1 text-[12px] font-medium text-alloy-midnight/90 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:cursor-not-allowed disabled:opacity-60";

export type EditablePersonContactCardProps = {
    personId: string | null;
    opportunityId?: string | null;
    initialValues: PersonContactCardValues;
    gates: Record<PersonContactCardFieldKey, PersonContactCardFieldGate>;
    canMutate: boolean;
    cardPad: string;
    variant: "default" | "summary";
    /** Optional override — defaults to AdminDrawerContext.openDrawer. */
    openDrawer?: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    onPersonUpdated?: (person: Record<string, unknown>) => void;
    /** Role badge, e.g. Parent */
    roleLabel?: string | null;
    roleBadgeClassName?: string;
    saveHint?: string;
    dataCardKind?: "primary" | "linked";
    className?: string;
    phoneHref?: (raw: string) => string | null;
};

export default function EditablePersonContactCard({
    personId,
    opportunityId,
    initialValues,
    gates,
    canMutate,
    cardPad,
    variant,
    openDrawer: openDrawerProp,
    onPersonUpdated,
    roleLabel,
    roleBadgeClassName,
    saveHint = "Edits save to linked person · not this opportunity",
    dataCardKind = "linked",
    className = "",
    phoneHref,
}: EditablePersonContactCardProps) {
    const pid = (personId ?? "").trim();
    const oppId = (opportunityId ?? "").trim();
    const anyEditable = personContactCardHasEditableField(gates) && Boolean(pid);
    const { openDrawer: contextOpenDrawer, drawer, stack } = useAdminDrawer();
    const openDrawer = openDrawerProp ?? contextOpenDrawer;
    const [clickFired, setClickFired] = useState(false);
    const [openCalled, setOpenCalled] = useState(false);
    const viewPersonClickGuardRef = useRef(false);

    const handleViewPersonClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!pid || viewPersonClickGuardRef.current) return;
            viewPersonClickGuardRef.current = true;
            window.setTimeout(() => {
                viewPersonClickGuardRef.current = false;
            }, 400);

            setClickFired(true);
            setOpenCalled(true);
            logViewPersonClickLive({
                personId: pid,
                opportunityId: oppId || null,
                targetType: "persons",
                targetId: pid,
                openCalled: false,
                currentDrawerType: drawer.type,
                currentDrawerId: drawer.id,
                stackDepth: stack.length,
            });

            const opened = openViewPersonFromOpportunity({
                openDrawer,
                personId: pid,
                opportunityId: oppId,
                openSeed: personDrawerOpenSeedFromContactValues(pid, initialValues),
            });

            if (opened) {
                logViewPersonClickLive({
                    personId: pid,
                    opportunityId: oppId || null,
                    targetType: "persons",
                    targetId: pid,
                    openCalled: true,
                    currentDrawerType: drawer.type,
                    currentDrawerId: drawer.id,
                    stackDepth: stack.length,
                });
            }
        },
        [drawer.id, drawer.type, openDrawer, oppId, pid, stack.length, initialValues]
    );

    const viewPersonDiagAttrs = pid
        ? viewPersonLiveDiagAttrs({
              personId: pid,
              clickFired,
              openCalled,
          })
        : {};

    const [draft, setDraft] = useState<PersonContactCardValues>(initialValues);
    const baselineRef = useRef(initialValues);
    const cardRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        baselineRef.current = initialValues;
        setDraft(initialValues);
        setSaveError(null);
        setSavedFlash(false);
    }, [initialValues, pid]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        };
    }, []);

    const dirty = useMemo(() => isPersonContactCardDirty(draft, baselineRef.current), [draft]);

    const cancelScheduledSave = useCallback(() => {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, []);

    const persistCard = useCallback(async () => {
        if (!pid || saving) return;
        const patch = buildPersonContactCardPatch(draft, baselineRef.current);
        if (Object.keys(patch).length === 0) return;

        const gatedPatch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            const gate = gates[key as PersonContactCardFieldKey];
            if (gate?.editable) gatedPatch[key] = value;
        }
        if (Object.keys(gatedPatch).length === 0) return;

        setSaving(true);
        setSaveError(null);
        setSavedFlash(false);
        try {
            const result = await patchLinkedPersonFromOpportunityDrawer({
                personId: pid,
                body: gatedPatch,
            });
            if (!result.ok) {
                if (result.status === 403) {
                    setSaveError("You do not have permission to edit the linked person.");
                } else {
                    setSaveError(result.error);
                }
                setDraft(baselineRef.current);
                return;
            }
            const nextValues: PersonContactCardValues = {
                first_name: trimStr(result.json.first_name),
                last_name: trimStr(result.json.last_name),
                email: trimStr(result.json.email),
                phone: trimStr(result.json.phone),
                display_name:
                    trimStr(result.json.full_name) ||
                    [result.json.first_name, result.json.last_name].filter(Boolean).join(" ").trim() ||
                    baselineRef.current.display_name,
            };
            baselineRef.current = nextValues;
            setDraft(nextValues);
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 2000);
            onPersonUpdated?.(result.json);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Save failed");
            setDraft(baselineRef.current);
        } finally {
            setSaving(false);
        }
    }, [draft, gates, onPersonUpdated, pid, saving]);

    const scheduleCardSave = useCallback(() => {
        if (!dirty) return;
        cancelScheduledSave();
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            void persistCard();
        }, PERSON_CONTACT_CARD_SAVE_DELAY_MS);
    }, [cancelScheduledSave, dirty, persistCard]);

    const handleCardBlur = useCallback(
        (e: React.FocusEvent<HTMLDivElement>) => {
            const next = e.relatedTarget;
            if (next instanceof Node && cardRef.current?.contains(next)) return;
            scheduleCardSave();
        },
        [scheduleCardSave]
    );

    const handleFieldFocus = useCallback(() => {
        cancelScheduledSave();
    }, [cancelScheduledSave]);

    const displayName =
        [draft.first_name, draft.last_name].filter(Boolean).join(" ").trim() ||
        draft.display_name ||
        "—";

    const viewPersonIcon =
        pid ? (
            <ViewPersonDrawerIconButton
                personId={pid}
                displayName={displayName}
                extraAttrs={viewPersonDiagAttrs}
                onMouseEnter={() => prefetchViewPersonOnHover(pid)}
                onPointerDown={() => prefetchViewPersonOnPointerDown(pid)}
                onClick={handleViewPersonClick}
            />
        ) : null;

    const cardStatus = saveError ? (
        <span className="text-[11px] font-medium text-alloy-ember" role="alert">
            {saveError}
        </span>
    ) : saving ? (
        <span className="text-[11px] font-medium text-alloy-midnight/45" aria-live="polite">
            Saving…
        </span>
    ) : savedFlash ? (
        <span className="text-[11px] font-medium text-emerald-800/75" aria-live="polite">
            Saved
        </span>
    ) : dirty ? (
        <span className="text-[11px] text-alloy-midnight/40">Unsaved changes</span>
    ) : null;

    const readOnlyReason =
        !pid
            ? "Contact is read-only until a person record is linked."
            : !canMutate
              ? "You do not have permission to edit."
              : !anyEditable
                ? gates.first_name.readOnlyReason ?? gates.email.readOnlyReason ?? null
                : null;

    const surfaceClass =
        dataCardKind === "primary" ?
            "rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-emerald-600/10"
        :   "rounded-lg border border-alloy-stone/18 border-t-2 border-t-alloy-blue/20 bg-alloy-stone/[0.035] shadow-sm ring-1 ring-alloy-stone/[0.05]";

    const outerClass = [surfaceClass, cardPad, className].filter(Boolean).join(" ");

    return (
        <div
            ref={cardRef}
            className={outerClass}
            data-editable-person-contact-card={dataCardKind}
            data-editable={anyEditable ? "true" : "false"}
            data-person-id={pid || undefined}
            onBlur={anyEditable ? handleCardBlur : undefined}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-1">
                    {viewPersonIcon}
                    {anyEditable ? (
                        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                        <div>
                            <span className="sr-only">{FIELD_LABEL.first_name}</span>
                            {gates.first_name.editable ? (
                                <input
                                    type="text"
                                    value={draft.first_name}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))}
                                    onFocus={handleFieldFocus}
                                    className={INLINE_INPUT}
                                    aria-label={FIELD_LABEL.first_name}
                                    autoComplete="given-name"
                                />
                            ) : (
                                <span className="text-[13px] font-semibold text-alloy-midnight/85">
                                    {draft.first_name || "—"}
                                </span>
                            )}
                        </div>
                        <div>
                            <span className="sr-only">{FIELD_LABEL.last_name}</span>
                            {gates.last_name.editable ? (
                                <input
                                    type="text"
                                    value={draft.last_name}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))}
                                    onFocus={handleFieldFocus}
                                    className={INLINE_INPUT}
                                    aria-label={FIELD_LABEL.last_name}
                                    autoComplete="family-name"
                                />
                            ) : (
                                <span className="text-[13px] font-semibold text-alloy-midnight/85">
                                    {draft.last_name || "—"}
                                </span>
                            )}
                        </div>
                        </div>
                    ) : (
                        <span className="min-w-0 truncate text-[13px] font-semibold text-alloy-midnight/85">
                            {displayName !== "—" ? displayName : "—"}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {roleLabel ? (
                        <span className={roleBadgeClassName ?? ""} title={roleLabel}>
                            {roleLabel}
                        </span>
                    ) : null}
                </div>
            </div>

            {anyEditable ? (
                <div className="mt-1.5 space-y-1.5">
                    <div
                        className={
                            variant === "summary" ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2" : "grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                        }
                    >
                        <div>
                            <label className="mb-0.5 block text-[9px] font-semibold tracking-wide text-alloy-midnight/45">
                                {FIELD_LABEL.phone}
                            </label>
                            {gates.phone.editable ? (
                                <input
                                    type="tel"
                                    value={draft.phone}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                                    onFocus={handleFieldFocus}
                                    className={variant === "summary" ? INLINE_INPUT : oppInqFieldInput}
                                    aria-label={FIELD_LABEL.phone}
                                    autoComplete="tel"
                                />
                            ) : (
                                <span className="text-[12px] text-alloy-midnight/70">
                                    {draft.phone ? formatPhoneUS(draft.phone) : "—"}
                                </span>
                            )}
                        </div>
                        <div>
                            <label className="mb-0.5 block text-[9px] font-semibold tracking-wide text-alloy-midnight/45">
                                {FIELD_LABEL.email}
                            </label>
                            {gates.email.editable ? (
                                <input
                                    type="email"
                                    value={draft.email}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                                    onFocus={handleFieldFocus}
                                    className={variant === "summary" ? INLINE_INPUT : oppInqFieldInput}
                                    aria-label={FIELD_LABEL.email}
                                    autoComplete="email"
                                />
                            ) : (
                                <span className="truncate text-[12px] text-alloy-midnight/70">{draft.email || "—"}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <p className="text-[10px] text-alloy-midnight/45">{saveHint}</p>
                        {cardStatus}
                    </div>
                </div>
            ) : (
                <div className="mt-1.5">
                    <ReadOnlyContactChannels phone={draft.phone} email={draft.email} phoneHref={phoneHref} />
                    {readOnlyReason ? (
                        <p className="mt-1 text-[10px] text-alloy-midnight/45">{readOnlyReason}</p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function trimStr(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

function ReadOnlyContactChannels(props: {
    phone: string;
    email: string;
    phoneHref?: (raw: string) => string | null;
}) {
    const { phone, email, phoneHref } = props;
    const p = phone.trim();
    const e = email.trim();
    if (!p && !e) {
        return <div className={oppInqMutedEmpty}>No contact details yet.</div>;
    }
    const tel = p ? (phoneHref ? phoneHref(p) : p.replace(/\s/g, "")) : "";
    const showPhone = Boolean(p && tel);
    const showEmail = Boolean(e);
    return (
        <div className={oppInqContactRow}>
            {showPhone ? (
                <span className="tabular-nums">
                    <a className={oppInqContactChannelLink} href={`tel:${tel}`}>
                        {formatPhoneUS(p)}
                    </a>
                </span>
            ) : null}
            {showPhone && showEmail ? <span className={oppInqContactSep}>·</span> : null}
            {showEmail ? (
                <span className="min-w-0 truncate">
                    <a className={oppInqContactChannelLink} href={`mailto:${e}`}>
                        {e}
                    </a>
                </span>
            ) : null}
        </div>
    );
}
