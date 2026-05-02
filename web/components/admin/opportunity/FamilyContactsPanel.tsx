"use client";

import { useEffect, useMemo } from "react";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { formatPhoneUS } from "@/lib/adminFormatters";
import { normalizePhone } from "@/lib/contactNormalize";
import { DrawerRelationshipPanelSkeleton } from "@/components/admin/workspace/DrawerRelationshipPanelSkeleton";

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
    opportunityFullHydrateFailed?: boolean;
    /** Summary card in inquiry header vs overview body (layout-only body mount is deprecated). */
    variant?: "default" | "summary";
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
        opportunityFullHydrateFailed = false,
        variant = "default",
    } = props;

    const relationshipRowsAwaitingFullHydrate =
        !opportunityFullHydrateFailed &&
        (opportunityFullHydratePending === true ||
            (opportunityFullHydratePending === undefined &&
                opportunityFullHydrateApplied !== true &&
                recordHydrationPending));
    const primaryContactAwaitingFullHydrate =
        !opportunityFullHydrateFailed &&
        (opportunityFullHydratePending === true ||
            (opportunityFullHydratePending === undefined &&
                opportunityFullHydrateApplied !== true &&
                recordHydrationPending));

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

    const primaryPersonId = record.primary_person_id != null ? String(record.primary_person_id).trim() : "";
    const primaryName = record._primary_person_name != null ? String(record._primary_person_name).trim() : "";
    const primaryEmail = record._primary_person_email != null ? String(record._primary_person_email) : null;
    const primaryPhone = record._primary_person_phone != null ? String(record._primary_person_phone) : null;

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

    const sorted = useMemo(() => {
        const filtered = primaryPersonId
            ? rows.filter((r) => String(r.person_id).trim() !== primaryPersonId)
            : rows;
        return [...filtered].sort((a, b) => {
            const ra = String(a.role_type ?? "");
            const rb = String(b.role_type ?? "");
            if (ra !== rb) return ra.localeCompare(rb);
            return String(a.name ?? "").localeCompare(String(b.name ?? ""));
        });
    }, [rows, primaryPersonId]);

    const tinyLabel =
        variant === "summary"
            ? "mb-0.5 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45"
            : "text-[11px] font-semibold tracking-wide text-alloy-forge/55";
    const cardPad = variant === "summary" ? "px-2 py-1.5" : "px-3 py-2.5";
    const nameLink =
        variant === "summary"
            ? "text-left text-[12px] font-semibold text-alloy-blue hover:underline"
            : "text-left text-[15px] font-semibold leading-snug text-alloy-blue hover:underline";
    const contactRow =
        variant === "summary"
            ? "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/70"
            : "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-alloy-midnight/80";
    const contactMuted = variant === "summary" ? "text-alloy-midnight/45" : "text-alloy-midnight/50";
    const contactLink =
        variant === "summary"
            ? "font-semibold text-alloy-blue hover:underline underline-offset-2"
            : "font-semibold text-alloy-blue hover:underline underline-offset-2";
    const roleBadge =
        variant === "summary"
            ? "inline-flex max-w-[9.5rem] items-center rounded-full border border-alloy-stone/20 bg-alloy-stone/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-alloy-midnight/70"
            : "inline-flex max-w-[11rem] items-center rounded-full border border-alloy-blue/20 bg-alloy-blue/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-alloy-midnight/85";

    return (
        <div className={variant === "summary" ? "space-y-2" : "space-y-3"} data-family-contacts-panel={sectionKey}>
            <div>
                {variant === "default" ? <div className={tinyLabel}>Primary person</div> : null}
                {primaryPersonId ? (
                    <div className={`mt-1 rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06] ${cardPad}`}>
                        <button type="button" onClick={() => openDrawer({ type: "persons", id: primaryPersonId })} className={nameLink}>
                            {primaryName && primaryName !== "—" ? primaryName : "View person"}
                        </button>
                        <div className={contactRow}>
                            {primaryPhone ? (
                                <span className="tabular-nums">
                                    <span className={contactMuted}>Phone </span>
                                    <a className={contactLink} href={`tel:${primaryPhone}`}>
                                        {formatPhoneUS(primaryPhone)}
                                    </a>
                                </span>
                            ) : (
                                <span className={contactMuted}>Phone —</span>
                            )}
                            {primaryEmail ? (
                                <span className="min-w-0 truncate">
                                    <span className={contactMuted}>Email </span>
                                    <a className={contactLink} href={`mailto:${primaryEmail}`}>
                                        {primaryEmail}
                                    </a>
                                </span>
                            ) : (
                                <span className={contactMuted}>Email —</span>
                            )}
                        </div>
                    </div>
                ) : primaryContactAwaitingFullHydrate ? (
                    <DrawerRelationshipPanelSkeleton density="compact" rows={1} label="Primary contact loading" />
                ) : (
                    <p className={`mt-1 ${variant === "summary" ? "text-[12px] text-alloy-midnight/55" : "text-sm text-alloy-forge/60"}`}>
                        No primary person on this opportunity.
                    </p>
                )}
            </div>

            {variant === "default" ? (
                <div>
                    <div className={tinyLabel}>Opportunity people</div>
                    <p className="mt-0.5 text-xs text-alloy-forge/60">Linked on this inquiry only (opportunity_persons).</p>
                </div>
            ) : null}

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
            />

            {sorted.length === 0 ? (
                opportunityFullHydrateFailed ? (
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
                ) : relationshipRowsAwaitingFullHydrate ? (
                    <DrawerRelationshipPanelSkeleton density={variant === "summary" ? "compact" : "comfortable"} rows={2} />
                ) : (
                    <div className={variant === "summary" ? "text-[12px] text-alloy-midnight/55" : "text-sm text-alloy-forge/60"}>
                        No additional people linked yet.
                    </div>
                )
            ) : (
                <ul className={`${variant === "summary" ? "space-y-1.5" : "space-y-2.5"} list-none`}>
                    {sorted.map((r) => (
                        <li
                            key={r.id}
                            className={`rounded-lg border border-alloy-stone/20 bg-white shadow-sm ring-1 ring-alloy-stone/[0.06] ${cardPad}`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => openDrawer({ type: "persons", id: r.person_id })}
                                    className={`min-w-0 flex-1 truncate ${nameLink}`}
                                >
                                    {r.name && r.name.trim() ? r.name : "View person"}
                                </button>
                                <span className={roleBadge} title={r.role_type}>
                                    {formatRoleTypeLabel(r.role_type)}
                                </span>
                            </div>
                            <div className={contactRow}>
                                {r.phone ? (
                                    <span className="tabular-nums">
                                        <span className={contactMuted}>Phone </span>
                                        <a
                                            className={contactLink}
                                            href={`tel:${normalizePhone(r.phone) ?? r.phone.replace(/\D/g, "")}`}
                                        >
                                            {formatPhoneUS(r.phone)}
                                        </a>
                                    </span>
                                ) : (
                                    <span className={contactMuted}>Phone —</span>
                                )}
                                {r.email ? (
                                    <span className="min-w-0 truncate">
                                        <span className={contactMuted}>Email </span>
                                        <a className={contactLink} href={`mailto:${r.email}`}>
                                            {r.email}
                                        </a>
                                    </span>
                                ) : (
                                    <span className={contactMuted}>Email —</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
