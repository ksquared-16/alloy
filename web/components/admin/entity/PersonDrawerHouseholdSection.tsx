"use client";

import { useCallback, useState, type ReactNode } from "react";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import { patchHouseholdPrimaryContact } from "@/lib/admin/person/patchHouseholdPrimaryContact";
import {
    formatChildEnrollmentContextLine,
    resolveChildHouseholdCardLines,
    resolveSharedHouseholdPlacementContext,
} from "@/lib/admin/person/personDrawerLocationCategoryOwnership";
import {
    PERSON_DRAWER_UNLINKED_CHILD_FIX_HINT,
    PERSON_DRAWER_UNLINKED_CHILD_LABEL,
    PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP,
} from "@/lib/admin/person/personDrawerHouseholdUnlinkedChild";
import {
    resolvePersonDrawerHouseholdModel,
    type PersonDrawerHouseholdChildMember,
    type PersonDrawerHouseholdMember,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

type OpenDrawer = (type: string, id: string) => void;

const HOUSEHOLD_PERSON_CARD_CLASS =
    "flex min-w-0 items-start gap-2.5 rounded-lg border border-alloy-stone/15 bg-white/90 px-2.5 py-2 shadow-sm transition hover:border-alloy-stone/25";

function RoleChip({ label }: { label: string }) {
    return (
        <span className="rounded bg-alloy-blue/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-blue">
            {label}
        </span>
    );
}

function GuardianCard({
    row,
    customerId,
    canMutate,
    onOpenPerson,
    onPrimarySet,
}: {
    row: PersonDrawerHouseholdMember;
    customerId: string;
    canMutate: boolean;
    onOpenPerson: (id: string) => void;
    onPrimarySet: (customerId: string, personId: string) => Promise<void>;
}) {
    const [saving, setSaving] = useState(false);
    const isPrimary = row.is_primary;
    const personId = row.person_id;

    const setPrimary = useCallback(async () => {
        if (!personId || isPrimary || !canMutate || saving) return;
        setSaving(true);
        try {
            await onPrimarySet(customerId, personId);
        } finally {
            setSaving(false);
        }
    }, [canMutate, customerId, isPrimary, onPrimarySet, personId, saving]);

    const primaryControl =
        personId && canMutate ? (
            <label
                className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-alloy-midnight/55"
                data-person-drawer-primary-contact-control="true"
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    type="radio"
                    name={`household-primary-${customerId}`}
                    checked={isPrimary}
                    disabled={saving || isPrimary}
                    onChange={() => void setPrimary()}
                    className="h-3 w-3 border-alloy-stone/40 text-alloy-blue focus:ring-alloy-blue/30"
                    aria-label={`Set ${row.display_name} as primary contact`}
                />
                <span>{isPrimary ? "Primary contact" : "Set as primary contact"}</span>
            </label>
        ) : null;

    const body = (
        <>
            <PersonDrawerIdentityAvatar
                displayName={row.display_name}
                initials={row.initials}
                photoUrl={row.photo_url}
                size="sm"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-alloy-midnight/90">{row.display_name}</p>
                {isPrimary ? (
                    <div className="mt-1">
                        <RoleChip label="Primary" />
                    </div>
                ) : null}
                {primaryControl}
            </div>
        </>
    );

    if (personId) {
        return (
            <li>
                <button
                    type="button"
                    onClick={() => onOpenPerson(personId)}
                    className={`${HOUSEHOLD_PERSON_CARD_CLASS} w-full text-left`}
                    data-person-drawer-household-guardian-link="true"
                >
                    {body}
                </button>
            </li>
        );
    }

    return (
        <li>
            <div className={HOUSEHOLD_PERSON_CARD_CLASS}>{body}</div>
        </li>
    );
}

function ChildCard({
    row,
    onOpenChild,
}: {
    row: PersonDrawerHouseholdChildMember;
    onOpenChild: (personId: string) => void;
}) {
    const lines = resolveChildHouseholdCardLines(row);

    const body = (
        <>
            <PersonDrawerIdentityAvatar
                displayName={row.display_name}
                initials={row.initials}
                photoUrl={row.photo_url}
                size="sm"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-alloy-midnight/90">{row.display_name}</p>
                {lines.age_line ? (
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50" data-person-drawer-child-age="true">
                        {lines.age_line}
                    </p>
                ) : null}
                {lines.placement_line ? (
                    <p
                        className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55"
                        data-person-drawer-child-enrollment-context="true"
                    >
                        {lines.placement_line}
                    </p>
                ) : null}
                {lines.classroom_line ? (
                    <p
                        className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/45"
                        data-person-drawer-child-classroom="true"
                    >
                        {lines.classroom_line}
                    </p>
                ) : null}
            </div>
        </>
    );

    if (row.link_state === "openable" && row.person_id) {
        return (
            <li>
                <button
                    type="button"
                    onClick={() => onOpenChild(row.person_id!)}
                    className={`${HOUSEHOLD_PERSON_CARD_CLASS} w-full text-left`}
                    data-person-drawer-household-child-link="true"
                >
                    {body}
                </button>
            </li>
        );
    }

    return (
        <li>
            <div
                className={`${HOUSEHOLD_PERSON_CARD_CLASS} cursor-not-allowed opacity-75`}
                data-person-drawer-household-child-unlinked="true"
                title={PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP}
                aria-disabled="true"
            >
                {body}
                <span
                    className="shrink-0 text-[10px] font-medium text-alloy-midnight/45"
                    title={`${PERSON_DRAWER_UNLINKED_CHILD_TOOLTIP} ${PERSON_DRAWER_UNLINKED_CHILD_FIX_HINT}`}
                >
                    {PERSON_DRAWER_UNLINKED_CHILD_LABEL}
                </span>
            </div>
        </li>
    );
}

function HouseholdColumn({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div
            className="min-w-0"
            data-person-drawer-household-column={title.toLowerCase().replace(/\s+/g, "-")}
        >
            <h5 className={oppInqEyebrow}>{title}</h5>
            <ul className="mt-1.5 space-y-1.5">{children}</ul>
        </div>
    );
}

function BelowRowSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div data-person-drawer-household-row={title.toLowerCase().replace(/\s+/g, "-")}>
            <h5 className={`${oppInqEyebrow} mt-3`}>{title}</h5>
            <ul className="mt-1.5 space-y-1.5">{children}</ul>
        </div>
    );
}

function SharedHouseholdPlacementNote({
    program_label,
    location_label,
}: {
    program_label: string | null;
    location_label: string | null;
}) {
    const line = formatChildEnrollmentContextLine({ program_label, location_label });
    if (!line) return null;
    return (
        <p
            className="text-[11px] leading-snug text-alloy-midnight/50"
            data-person-drawer-household-shared-placement="true"
        >
            <span className="font-medium text-alloy-midnight/60">All children share: </span>
            {line}
        </p>
    );
}

/** Relationship-based household layout — shared by parent and child person drawers. */
export default function PersonDrawerHouseholdSection({
    record,
    onOpenDrawer,
    onOpenLinkedPerson,
    viewingPersonId,
    dataDrawerVariant = "shared",
    canMutate = false,
    onRecordUpdated,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
    /** Typed person ↔ person navigation with drawer open seeds (preferred over onOpenDrawer for persons). */
    onOpenLinkedPerson?: (personId: string) => void;
    viewingPersonId?: string | null;
    dataDrawerVariant?: "parent" | "child" | "shared";
    canMutate?: boolean;
    onRecordUpdated?: (next: Record<string, unknown>) => void;
}) {
    const viewingId =
        viewingPersonId ??
        (typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : null);
    const model = resolvePersonDrawerHouseholdModel(record, {
        viewing_person_id: viewingId,
    });
    if (model.groups.length === 0) {
        return null;
    }

    const openPerson = (id: string) => {
        if (onOpenLinkedPerson) {
            onOpenLinkedPerson(id);
            return;
        }
        onOpenDrawer("persons", id);
    };
    const openChild = (personId: string) => openPerson(personId);
    const isParentDrawer = dataDrawerVariant === "parent";

    const handlePrimarySet = useCallback(
        async (customerId: string, personId: string) => {
            await patchHouseholdPrimaryContact(customerId, personId);
            const next = applyHouseholdPrimaryContactToRecord(record, customerId, personId);
            onRecordUpdated?.(next);
        },
        [onRecordUpdated, record]
    );

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-household="true"
            data-person-drawer-household-variant={dataDrawerVariant}
            data-person-drawer-parent-location-agnostic={isParentDrawer ? "true" : undefined}
            aria-label="Household"
        >
            <h4 className={`${oppInqEyebrow} px-0.5`}>Household</h4>
            <div className="mt-2 space-y-3">
                {model.groups.map((group) => {
                    const sharedPlacement =
                        isParentDrawer && group.children.length > 0
                            ? resolveSharedHouseholdPlacementContext(group.children)
                            : null;

                    return (
                        <div
                            key={group.customer_id}
                            className={`${oppInqInnerCardCompact} space-y-3`}
                            data-person-drawer-household-group={group.customer_id}
                        >
                            {group.household_label ? (
                                <p className="text-[15px] font-semibold text-alloy-midnight/90">
                                    {group.household_label}
                                </p>
                            ) : null}

                            {sharedPlacement ? (
                                <SharedHouseholdPlacementNote
                                    program_label={sharedPlacement.program_label}
                                    location_label={sharedPlacement.location_label}
                                />
                            ) : null}

                            {group.guardians.length > 0 || group.children.length > 0 ? (
                                <div
                                    className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2"
                                    data-person-drawer-household-columns="paired"
                                >
                                    <HouseholdColumn title="Guardians">
                                        {group.guardians.length > 0 ? (
                                            group.guardians.map((row) => (
                                                <GuardianCard
                                                    key={row.person_id ?? row.display_name}
                                                    row={row}
                                                    customerId={group.customer_id}
                                                    canMutate={canMutate}
                                                    onOpenPerson={openPerson}
                                                    onPrimarySet={handlePrimarySet}
                                                />
                                            ))
                                        ) : (
                                            <li className="text-[11px] text-alloy-midnight/40">—</li>
                                        )}
                                    </HouseholdColumn>
                                    <HouseholdColumn title="Children">
                                        {group.children.length > 0 ? (
                                            group.children.map((row) => (
                                                <ChildCard
                                                    key={
                                                        row.person_id ??
                                                        row.customer_member_id ??
                                                        row.display_name
                                                    }
                                                    row={row}
                                                    onOpenChild={openChild}
                                                />
                                            ))
                                        ) : (
                                            <li className="text-[11px] text-alloy-midnight/40">—</li>
                                        )}
                                    </HouseholdColumn>
                                </div>
                            ) : null}

                            {group.emergency_contacts.length > 0 ? (
                                <BelowRowSection title="Emergency contacts">
                                    {group.emergency_contacts.map((row) => (
                                        <GuardianCard
                                            key={row.person_id ?? row.display_name}
                                            row={row}
                                            customerId={group.customer_id}
                                            canMutate={false}
                                            onOpenPerson={openPerson}
                                            onPrimarySet={handlePrimarySet}
                                        />
                                    ))}
                                </BelowRowSection>
                            ) : null}

                            {group.authorized_pickups.length > 0 ? (
                                <BelowRowSection title="Authorized pickups">
                                    {group.authorized_pickups.map((row) => (
                                        <GuardianCard
                                            key={row.person_id ?? row.display_name}
                                            row={row}
                                            customerId={group.customer_id}
                                            canMutate={false}
                                            onOpenPerson={openPerson}
                                            onPrimarySet={handlePrimarySet}
                                        />
                                    ))}
                                </BelowRowSection>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
