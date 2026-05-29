"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { normalizePhone } from "@/lib/contactNormalize";
import { DrawerRelationshipPanelSkeleton } from "@/components/admin/workspace/DrawerRelationshipPanelSkeleton";
import type { FieldDefForLinkedEdit } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import {
    resolveLeadSummaryPrimaryPersonId,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import EditablePersonContactCard from "@/components/admin/opportunity/EditablePersonContactCard";
import PrimaryPersonContactCard from "@/components/admin/opportunity/PrimaryPersonContactCard";
import {
    INQUIRY_FAMILY_CONTACTS_ADDITIONAL_ROW_RESERVE_CLASS,
    INQUIRY_FAMILY_CONTACTS_PRIMARY_SLOT_CLASS,
    INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import {
    personContactCardValuesFromOpportunityPersonRow,
    resolveLinkedPersonContactCardFieldGates,
} from "@/lib/admin/drawer/primaryPersonCardEdit";
import {
    oppDrawerRolePillComfortable,
    oppInqContactChannelLink,
    oppInqContactRow,
    oppInqContactSep,
    oppInqEyebrow,
    oppInqMutedEmpty,
    oppInqRolePill,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

export type OpportunityPersonRow = {
    id: string;
    person_id: string;
    role_type: string;
    name: string | null;
    phone: string | null;
    email: string | null;
};

/** Humanize stored role keys (e.g. family_member → Family member). Data stays authoritative; no hardcoded role enums. */
function formatRoleTypeLabel(key: string): string {
    const s = key.trim();
    if (!s || s === "—") return s || "—";
    if (/\s/.test(s)) {
        return s
            .split(/\s+/)
            .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
            .join(" ");
    }
    const words = s.split(/[_.-]+/).filter(Boolean);
    if (words.length === 0) return s;
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Matches primary person card footprint in summary (loaded state). */
function SummaryPrimaryPersonCardSkeleton({ cardPad }: { cardPad: string }) {
    return (
        <div
            className={`mt-1 rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06] ${cardPad}`}
            aria-busy="true"
            aria-label="Loading primary contact"
        >
            <div className="skeleton-pulse h-[13px] w-[min(55%,12rem)] rounded bg-alloy-stone/14" aria-hidden />
            <div className="mt-2 skeleton-pulse h-[12px] w-[min(88%,16rem)] rounded bg-alloy-stone/11" aria-hidden />
        </div>
    );
}

/** One-line placeholder matching “No additional people linked yet.” height (no oversized cards). */
function SummaryAdditionalPeopleLineSkeleton() {
    return (
        <div className="mt-1.5 flex min-h-[1.125rem] items-center" aria-busy="true" aria-label="Loading people">
            <div className="skeleton-pulse h-3 w-[min(78%,13rem)] rounded bg-alloy-stone/11" aria-hidden />
        </div>
    );
}

/** Summary-variant card shell — reserved when server reports additional-contact count before names hydrate. */
function SummaryAdditionalPersonCardSkeleton({ cardPad }: { cardPad: string }) {
    return (
        <div
            className={`${cardPad} rounded-lg border border-alloy-stone/12 bg-white/80`}
            aria-busy="true"
            aria-label="Loading contact"
        >
            <div className="skeleton-pulse h-3 w-[min(70%,11rem)] rounded bg-alloy-stone/14" aria-hidden />
            <div className="mt-2 skeleton-pulse h-3 w-[min(88%,14rem)] rounded bg-alloy-stone/10" aria-hidden />
        </div>
    );
}

export function OppInquiryContactChannelsRow(props: {
    phone: string | null | undefined;
    email: string | null | undefined;
    phoneHref?: (raw: string) => string | null;
}): ReactNode {
    const { phone, email, phoneHref } = props;
    const p = phone != null ? String(phone).trim() : "";
    const e = email != null ? String(email).trim() : "";
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

export function FamilyContactsPanel(props: {
    opportunityId: string;
    record: Record<string, unknown>;
    canMutate: boolean;
    sectionKey: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Keys already shown on record_header — avoids duplicate CTAs when placement moves to header. */
    excludeActionKeys?: Set<string>;
    router: { push: (href: string) => void; refresh: () => void };
    openDrawer: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    onRegistryApplied: () => void;
    /** Bumps when the parent refetches opportunity payload after a successful add. */
    refreshKey: number;
    /** While `drawer_initial` / visible shell is active (deprecated — prefer opportunityFullHydrate*). */
    recordHydrationPending?: boolean;
    /** True while `drawer_visible` is on-screen and background `surface=full` has not merged. */
    opportunityFullHydratePending?: boolean;
    opportunityFullHydrateApplied?: boolean;
    /** True only after background `surface=full` hydrate failed (not primary pending/skipped). */
    opportunityRelationshipsFullHydrateFailed?: boolean;
    /** Summary card in inquiry header vs overview body (layout-only body mount is deprecated). */
    variant?: "default" | "summary";
    /** Opportunity field definitions for linked-person policy gates (optional). */
    fieldDefinitions?: FieldDefForLinkedEdit[];
    /** When false, defers `surface=record_section` registry actions until enrichment is allowed. */
    actionsFetchEnabled?: boolean;
    /** Server shell count for additional contacts — reserves card rows before `_opportunity_persons` names arrive. */
    shellReservedAdditionalCount?: number;
    /** After primary person PATCH from this card — parent should merge hydration + refetch. */
    onPrimaryPersonUpdated?: (person: Record<string, unknown>) => void;
    /** After linked opportunity_person row person PATCH — parent merges `_opportunity_persons` + refetch. */
    onLinkedPersonUpdated?: (personId: string, person: Record<string, unknown>) => void;
}) {
    const {
        opportunityId,
        record,
        canMutate,
        sectionKey,
        departmentId,
        workUnitId,
        excludeActionKeys,
        router,
        openDrawer,
        openForm,
        onRegistryApplied,
        refreshKey,
        recordHydrationPending = false,
        opportunityFullHydratePending,
        opportunityFullHydrateApplied,
        opportunityRelationshipsFullHydrateFailed = false,
        variant = "default",
        fieldDefinitions = [],
        actionsFetchEnabled = true,
        shellReservedAdditionalCount = 0,
        onPrimaryPersonUpdated,
        onLinkedPersonUpdated,
    } = props;

    const relationshipRowsAwaitingFullHydrate =
        !opportunityRelationshipsFullHydrateFailed &&
        opportunityFullHydratePending === true &&
        opportunityFullHydrateApplied !== true;
    const primaryContactAwaitingFullHydrate =
        !opportunityRelationshipsFullHydrateFailed &&
        opportunityFullHydratePending === true &&
        opportunityFullHydrateApplied !== true;

    const timingEnabled =
        typeof window === "undefined"
            ? process.env.NODE_ENV !== "production"
            : process.env.NODE_ENV !== "production" || /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname);

    useEffect(() => {
        if (!timingEnabled) return;
        console.info("[timing][drawer]", {
            key: `opportunities:${opportunityId}`,
            phase: "family_contacts_panel_mount",
            section_key: sectionKey,
            variant,
        });
    }, [opportunityId, sectionKey, variant, timingEnabled]);

    const primaryPersonId = resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>) ?? "";

    const rows = useMemo(() => {
        const raw = (record._opportunity_persons as unknown[]) ?? [];
        if (!Array.isArray(raw)) return [] as OpportunityPersonRow[];
        return raw
            .map((x) => {
                const r = x as Record<string, unknown>;
                return {
                    id: String(r.id ?? ""),
                    person_id: String(r.person_id ?? ""),
                    role_type: String(r.role_type ?? "—"),
                    name: r.name != null ? String(r.name) : null,
                    phone: r.phone != null ? String(r.phone) : null,
                    email: r.email != null ? String(r.email) : null,
                } satisfies OpportunityPersonRow;
            })
            .filter((r) => r.id && r.person_id);
    }, [record._opportunity_persons, refreshKey]);

    const sorted = useMemo(
        () => sortOpportunityFamilyContactRows(rows, primaryPersonId || null),
        [rows, primaryPersonId]
    );

    const eyebrow = oppInqEyebrow;
    const cardPad = variant === "summary" ? "px-1.5 py-0.5" : "px-3 py-2.5";

    const roleBadge = variant === "summary" ? oppInqRolePill : oppDrawerRolePillComfortable;

    const registryDensity = variant === "summary" ? "summary" : "default";

    return (
        <div
            className={
                variant === "summary"
                    ? INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS
                    : "space-y-3"
            }
            data-family-contacts-panel={sectionKey}
        >
            <div className={`min-w-0 ${variant === "summary" ? INQUIRY_FAMILY_CONTACTS_PRIMARY_SLOT_CLASS : ""}`}>
                {variant === "default" ? <div className={eyebrow}>Primary person</div> : null}
                {primaryPersonId ? (
                    <PrimaryPersonContactCard
                        record={record}
                        opportunityId={opportunityId}
                        canMutate={canMutate}
                        fieldDefinitions={fieldDefinitions}
                        cardPad={cardPad}
                        variant={variant}
                        openDrawer={openDrawer}
                        onPersonUpdated={onPrimaryPersonUpdated}
                    />
                ) : primaryContactAwaitingFullHydrate ? (
                    variant === "summary" ? (
                        <SummaryPrimaryPersonCardSkeleton cardPad={cardPad} />
                    ) : (
                        <DrawerRelationshipPanelSkeleton density="compact" rows={1} label="Primary contact loading" />
                    )
                ) : (
                    <p className={`mt-1 ${oppInqMutedEmpty}`}>No primary person on this opportunity.</p>
                )}
            </div>

            {variant === "default" ? (
                <div>
                    <div className={eyebrow}>Opportunity people</div>
                    <p className="mt-0.5 text-xs text-alloy-midnight/55">Linked on this inquiry only (opportunity_persons).</p>
                </div>
            ) : null}

            {variant !== "summary" ? (
                <OpportunityRecordSectionRegistryActions
                    opportunityId={opportunityId}
                    sectionKey={sectionKey}
                    departmentId={departmentId ?? null}
                    workUnitId={workUnitId ?? null}
                    excludeActionKeys={excludeActionKeys}
                    canMutate={canMutate}
                    router={router}
                    openDrawer={openDrawer}
                    openForm={openForm}
                    onApplied={onRegistryApplied}
                    layoutDensity={registryDensity}
                    actionsFetchEnabled={actionsFetchEnabled}
                />
            ) : null}

            <div className={`min-w-0 ${variant === "summary" ? "mt-0" : "flex-1"}`}>
                {sorted.length === 0 ? (
                    opportunityRelationshipsFullHydrateFailed ? (
                        <div
                            className={
                                variant === "summary"
                                    ? "rounded-md border border-amber-200/80 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-950"
                                    : "rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-sm text-amber-950"
                            }
                        >
                            Full record did not load. Relationships may be incomplete — try refreshing the drawer or reopening the
                            opportunity.
                        </div>
                    ) : relationshipRowsAwaitingFullHydrate && shellReservedAdditionalCount <= 0 ? (
                        variant === "summary" ? (
                            <SummaryAdditionalPeopleLineSkeleton />
                        ) : (
                            <DrawerRelationshipPanelSkeleton density="comfortable" rows={1} />
                        )
                    ) : shellReservedAdditionalCount > 0 && sorted.length === 0 ? (
                        <ul className={`${variant === "summary" ? "space-y-0.5" : "space-y-2.5"} ${variant === "summary" ? "mt-0" : "mt-0.5"} list-none`}>
                            {Array.from({ length: shellReservedAdditionalCount }).map((_, i) => (
                                <li
                                    key={`additional-contact-shell-${i}`}
                                    className={variant === "summary" ? INQUIRY_FAMILY_CONTACTS_ADDITIONAL_ROW_RESERVE_CLASS : undefined}
                                >
                                    <SummaryAdditionalPersonCardSkeleton cardPad={cardPad} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        null
                    )
                ) : (
                    <>
                        <div
                            className={
                                variant === "summary" ?
                                    "mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45"
                                :   "mt-2.5 text-[11px] font-semibold tracking-wide text-alloy-forge/55"
                            }
                        >
                            Additional contacts
                        </div>
                        <ul className={`${variant === "summary" ? "space-y-0.5" : "space-y-2.5"} ${variant === "summary" ? "mt-0" : "mt-0.5"} list-none`}>
                        {sorted.map((r) => {
                            const personId = String(r.person_id ?? "").trim();
                            const initialValues = personContactCardValuesFromOpportunityPersonRow(r);
                            const gates = resolveLinkedPersonContactCardFieldGates(personId, canMutate);
                            return (
                                <li key={r.id}>
                                    <EditablePersonContactCard
                                        personId={personId || null}
                                        opportunityId={opportunityId}
                                        initialValues={initialValues}
                                        gates={gates}
                                        canMutate={canMutate}
                                        cardPad={cardPad}
                                        variant={variant}
                                        openDrawer={openDrawer}
                                        roleLabel={formatRoleTypeLabel(r.role_type)}
                                        roleBadgeClassName={roleBadge}
                                        saveHint=""
                                        saveTrigger={variant === "summary" ? "explicit" : "blur"}
                                        dataCardKind="linked"
                                        phoneHref={(raw) => normalizePhone(raw) ?? raw.replace(/\D/g, "")}
                                        onPersonUpdated={(person) => onLinkedPersonUpdated?.(personId, person)}
                                    />
                                </li>
                            );
                        })}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
}
