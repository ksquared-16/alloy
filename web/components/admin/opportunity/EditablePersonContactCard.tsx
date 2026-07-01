"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    editableCardIsSaving,
    editableCardStatusLabel,
} from "@/lib/experience/editing/editableCardRuntime";
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
import { drawerLinkPendingKeyForPersonFromOpportunity } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import { personDrawerOpenSeedFromContactValues } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
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
    /** Summary Lead Summary uses explicit Save; default drawer body keeps blur save. */
    saveTrigger?: "blur" | "explicit";
    dataCardKind?: "primary" | "linked";
    className?: string;
    phoneHref?: (raw: string) => string | null;
};

/**
 * Edit lifecycle is owned by the canonical Editable Card Runtime (`useEditableCardRuntime`):
 * Card Runtime owns the state machine; the ONE `drawerOperatingSaveCoordinator` owns Save-All +
 * the dirty guard. No self-managed `saving`/`savedFlash`/`saveError`. Authoritative-confirmed save;
 * on failure the operator's edit is retained (no silent loss). Doctrine:
 * docs/platform/experience/editable-card-runtime.md.
 */
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
    saveTrigger = "blur",
    dataCardKind = "linked",
    className = "",
    phoneHref,
}: EditablePersonContactCardProps) {
    const pid = (personId ?? "").trim();
    const oppId = (opportunityId ?? "").trim();
    const anyEditable = personContactCardHasEditableField(gates) && Boolean(pid);
    const { openDrawer: contextOpenDrawer, drawer, stack, drawerLinkPending } = useAdminDrawer();
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
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                openSeed: personDrawerOpenSeedFromContactValues(pid, initialValues, {
                    presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
                }),
                linkPending: drawerLinkPending,
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
        [
            drawer.id,
            drawer.type,
            drawer.opportunityWorkspaceContext,
            drawerLinkPending,
            openDrawer,
            oppId,
            pid,
            stack.length,
            initialValues,
        ]
    );

    const personOpenPendingKey = useMemo(() => {
        if (!pid || !oppId) return null;
        return drawerLinkPendingKeyForPersonFromOpportunity({
            personId: pid,
            opportunityId: oppId,
            openSeed: personDrawerOpenSeedFromContactValues(pid, initialValues, {
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            }),
            opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
        });
    }, [pid, oppId, initialValues, drawer.opportunityWorkspaceContext]);

    const linkPendingActive =
        personOpenPendingKey != null && drawerLinkPending.isPending(personOpenPendingKey);
    const linkPendingError =
        personOpenPendingKey != null ? drawerLinkPending.errorForKey(personOpenPendingKey) : null;

    const viewPersonDiagAttrs = pid
        ? viewPersonLiveDiagAttrs({
              personId: pid,
              clickFired,
              openCalled,
          })
        : {};

    const [draft, setDraft] = useState<PersonContactCardValues>(initialValues);
    const baselineRef = useRef(initialValues);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const cardRef = useRef<HTMLDivElement>(null);
    const saveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        };
    }, []);

    const dirty = useMemo(() => isPersonContactCardDirty(draft, baselineRef.current), [draft]);

    const useExplicitSave = saveTrigger === "explicit" && variant === "summary";

    // Card Runtime owns the edit lifecycle; the ONE save coordinator owns Save-All + the dirty
    // guard (registered via sectionId). Authoritative-confirmed save (cross-entity linked person)
    // — no optimistic pre-apply. On failure the operator's edit is RETAINED (runtime → dirty +
    // error), never reverted: no silent data loss (Operational Experience Doctrine, Law 5).
    const edit = useEditableCardRuntime({
        dirty,
        sectionId: pid ? `person_contact:${pid}` : undefined,
        acknowledgeMs: 2000,
        save: async () => {
            const patch = buildPersonContactCardPatch(draftRef.current, baselineRef.current);
            const gatedPatch: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(patch)) {
                const gate = gates[key as PersonContactCardFieldKey];
                if (gate?.editable) gatedPatch[key] = value;
            }
            if (!pid || Object.keys(gatedPatch).length === 0) return { ok: true };
            try {
                const result = await patchLinkedPersonFromOpportunityDrawer({ personId: pid, body: gatedPatch });
                if (!result.ok) {
                    return {
                        ok: false,
                        error:
                            result.status === 403
                                ? "You do not have permission to edit the linked person."
                                : result.error,
                    };
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
                onPersonUpdated?.(result.json);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
            }
        },
    });
    const editRef = useRef(edit);
    editRef.current = edit;

    const saving = editableCardIsSaving(edit.state);
    const statusLabel = editableCardStatusLabel(edit.state);

    useEffect(() => {
        baselineRef.current = initialValues;
        setDraft(initialValues);
        editRef.current.reset();
    }, [initialValues, pid]);

    const cancelScheduledSave = useCallback(() => {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, []);

    const handleFieldChange = useCallback((field: PersonContactCardFieldKey, value: string) => {
        const next = { ...draftRef.current, [field]: value };
        setDraft(next);
        editRef.current.notifyChange(isPersonContactCardDirty(next, baselineRef.current));
    }, []);

    const scheduleCardSave = useCallback(() => {
        if (!isPersonContactCardDirty(draftRef.current, baselineRef.current)) return;
        cancelScheduledSave();
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            void editRef.current.commit();
        }, PERSON_CONTACT_CARD_SAVE_DELAY_MS);
    }, [cancelScheduledSave]);

    const handleCardBlur = useCallback(
        (e: React.FocusEvent<HTMLDivElement>) => {
            const next = e.relatedTarget;
            if (next instanceof Node && cardRef.current?.contains(next)) return;
            editRef.current.onBlur();
            scheduleCardSave();
        },
        [scheduleCardSave]
    );

    const handleFieldFocus = useCallback(() => {
        cancelScheduledSave();
        editRef.current.onFocus();
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
                isPending={linkPendingActive}
                extraAttrs={viewPersonDiagAttrs}
                onMouseEnter={() =>
                    prefetchViewPersonOnHover(pid, {
                        openSource: "opportunity_primary_contact",
                        openSeed: personDrawerOpenSeedFromContactValues(pid, initialValues, {
                            presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
                        }),
                        opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                    })
                }
                onPointerDown={() =>
                    prefetchViewPersonOnPointerDown(pid, {
                        openSource: "opportunity_primary_contact",
                        openSeed: personDrawerOpenSeedFromContactValues(pid, initialValues, {
                            presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
                        }),
                        opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                    })
                }
                onClick={handleViewPersonClick}
            />
        ) : null;

    const cardStatus = statusLabel === "error" ? (
        <span className="text-[11px] font-medium text-alloy-ember" role="alert">
            {edit.state.error}
        </span>
    ) : statusLabel === "saving" ? (
        <span className="text-[11px] font-medium text-alloy-midnight/45" aria-live="polite">
            Saving…
        </span>
    ) : statusLabel === "saved" ? (
        <span className="text-[11px] font-medium text-emerald-800/75" aria-live="polite">
            Saved
        </span>
    ) : statusLabel === "unsaved" ? (
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

    const outerClass = [
        surfaceClass,
        cardPad,
        linkPendingActive ? "ring-2 ring-alloy-blue/25 border-alloy-blue/35" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            ref={cardRef}
            className={outerClass}
            data-editable-person-contact-card={dataCardKind}
            data-editable={anyEditable ? "true" : "false"}
            data-person-id={pid || undefined}
            data-drawer-link-pending={linkPendingActive ? "true" : undefined}
            onBlur={anyEditable && !useExplicitSave ? handleCardBlur : undefined}
        >
            {linkPendingActive ?
                <p className="mb-1 text-[10px] font-medium text-alloy-blue" aria-live="polite">
                    Opening…
                </p>
            :   null}
            {linkPendingError ?
                <p className="mb-1 text-[10px] font-medium text-alloy-ember" role="alert">
                    {linkPendingError}
                </p>
            :   null}
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
                                    onChange={(e) => handleFieldChange("first_name", e.target.value)}
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
                                    onChange={(e) => handleFieldChange("last_name", e.target.value)}
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
                                    onChange={(e) => handleFieldChange("phone", e.target.value)}
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
                                    onChange={(e) => handleFieldChange("email", e.target.value)}
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
                        {saveHint?.trim() && !useExplicitSave ? (
                            <p className="text-[10px] text-alloy-midnight/45">{saveHint}</p>
                        ) : (
                            <span />
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            {useExplicitSave && dirty && canMutate ? (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void editRef.current.commit()}
                                    className="rounded-md border border-alloy-blue/35 bg-alloy-blue/[0.08] px-2 py-0.5 text-[10px] font-semibold text-alloy-blue hover:bg-alloy-blue/10 disabled:opacity-60"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            ) : null}
                            {cardStatus}
                        </div>
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
