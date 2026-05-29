"use client";

import type { ReactNode } from "react";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

type OpenDrawer = (type: string, id: string) => void;

const SUBHEADING = "text-xs font-semibold tracking-wide text-alloy-midnight/50 mb-2";

function RelationshipList({
    items,
    onOpenPerson,
    onOpenMember,
    emptyCopy,
}: {
    items: Array<{
        person_id: string | null;
        customer_member_id?: string | null;
        display_name: string | null;
        relationship_label: string | null;
    }>;
    onOpenPerson: (id: string) => void;
    onOpenMember?: (id: string) => void;
    emptyCopy: string;
}) {
    if (items.length === 0) {
        return <p className="text-sm text-alloy-midnight/60">{emptyCopy}</p>;
    }
    return (
        <ul className="space-y-2 text-sm">
            {items.map((row) => {
                const key = row.person_id ?? row.customer_member_id ?? row.display_name ?? "row";
                const label = row.display_name?.trim() || "Unnamed";
                return (
                    <li key={key}>
                        {row.person_id ? (
                            <button
                                type="button"
                                onClick={() => onOpenPerson(row.person_id!)}
                                className="text-alloy-blue hover:underline text-left font-medium"
                            >
                                {label}
                            </button>
                        ) : row.customer_member_id && onOpenMember ? (
                            <button
                                type="button"
                                onClick={() => onOpenMember(row.customer_member_id!)}
                                className="text-alloy-blue hover:underline text-left font-medium"
                            >
                                {label}
                            </button>
                        ) : (
                            <span className="text-alloy-midnight/85">{label}</span>
                        )}
                        {row.relationship_label ? (
                            <span className="text-alloy-muted ml-1">· {row.relationship_label}</span>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

function GroupBlock({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <h4 className={SUBHEADING}>{title}</h4>
            {children}
        </div>
    );
}

export function PersonDrawerRelationshipsOverview({
    record,
    onOpenDrawer,
}: {
    record: Record<string, unknown>;
    onOpenDrawer: OpenDrawer;
}) {
    const groups = buildPersonDrawerRelationshipGroups({
        person_id: String(record.id ?? ""),
        customer_persons: (record._customer_persons as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["customer_persons"]) ?? [],
        person_relationships: (record._person_relationships as Parameters<typeof buildPersonDrawerRelationshipGroups>[0]["person_relationships"]) ?? [],
        sibling_links: (record._sibling_links as PersonSiblingLinkRow[]) ?? [],
    });

    const openPerson = (id: string) => onOpenDrawer("persons", id);
    const openMember = (id: string) => onOpenDrawer("customer_members", id);

    const hasAny =
        groups.parents.length > 0 ||
        groups.guardians.length > 0 ||
        groups.emergency_contacts.length > 0 ||
        groups.children.length > 0 ||
        groups.siblings.length > 0;

    if (!hasAny) {
        return <p className="text-sm text-alloy-midnight/60">No family relationships on file.</p>;
    }

    return (
        <div className="space-y-5" data-person-drawer-relationships-grouped="true">
            {groups.parents.length > 0 ? (
                <GroupBlock title="Parents">
                    <RelationshipList items={groups.parents} onOpenPerson={openPerson} emptyCopy="" />
                </GroupBlock>
            ) : null}
            {groups.guardians.length > 0 ? (
                <GroupBlock title="Guardians">
                    <RelationshipList items={groups.guardians} onOpenPerson={openPerson} emptyCopy="" />
                </GroupBlock>
            ) : null}
            {groups.emergency_contacts.length > 0 ? (
                <GroupBlock title="Emergency contacts">
                    <RelationshipList items={groups.emergency_contacts} onOpenPerson={openPerson} emptyCopy="" />
                </GroupBlock>
            ) : null}
            {groups.children.length > 0 ? (
                <GroupBlock title="Children">
                    <RelationshipList
                        items={groups.children}
                        onOpenPerson={openPerson}
                        onOpenMember={openMember}
                        emptyCopy=""
                    />
                </GroupBlock>
            ) : null}
            {groups.siblings.length > 0 ? (
                <GroupBlock title="Siblings">
                    <RelationshipList
                        items={groups.siblings}
                        onOpenPerson={openPerson}
                        onOpenMember={openMember}
                        emptyCopy=""
                    />
                </GroupBlock>
            ) : null}
        </div>
    );
}

export function PersonDrawerEnrollmentMirror({
    rows,
    onOpenDrawer,
}: {
    rows: PersonEnrollmentMirrorRow[];
    onOpenDrawer: OpenDrawer;
}) {
    if (rows.length === 0) {
        return <p className="text-sm text-alloy-midnight/60">No enrollment inquiries linked to this person.</p>;
    }

    return (
        <div className="space-y-4" data-person-drawer-enrollment-mirror="true">
            {rows.map((row) => (
                <div
                    key={row.id}
                    className="rounded-lg border border-alloy-forge/10 bg-white/60 px-3 py-2.5 text-sm"
                >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <button
                            type="button"
                            onClick={() => onOpenDrawer("opportunities", row.opportunity_id)}
                            className="text-alloy-blue hover:underline text-left font-medium"
                        >
                            {row.opportunity_name?.trim() || "Enrollment inquiry"}
                        </button>
                        {row.outcome_status_label || row.outcome_status_key ? (
                            <span className="text-alloy-muted text-xs">
                                {row.outcome_status_label ?? row.outcome_status_key}
                            </span>
                        ) : null}
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-alloy-midnight/75 sm:grid-cols-2">
                        {row.location_label ? (
                            <div>
                                <dt className="text-alloy-midnight/45">Location</dt>
                                <dd>{row.location_label}</dd>
                            </div>
                        ) : null}
                        {row.program_label ? (
                            <div>
                                <dt className="text-alloy-midnight/45">Program</dt>
                                <dd>{row.program_label}</dd>
                            </div>
                        ) : null}
                        {row.room_label ? (
                            <div>
                                <dt className="text-alloy-midnight/45">Room</dt>
                                <dd>{row.room_label}</dd>
                            </div>
                        ) : null}
                    </dl>
                    <p className="mt-2 text-[11px] text-alloy-midnight/45">
                        Placement details are managed on the enrollment inquiry.
                    </p>
                </div>
            ))}
        </div>
    );
}

export function PersonDrawerEnrollmentOpportunitiesMirror({
    rows,
    onOpenDrawer,
}: {
    rows: PersonEnrollmentOpportunityRow[];
    onOpenDrawer: OpenDrawer;
}) {
    if (rows.length === 0) {
        return <p className="text-sm text-alloy-midnight/60">No related enrollment inquiries.</p>;
    }

    return (
        <ul className="space-y-2 text-sm" data-person-drawer-enrollment-opportunities="true">
            {rows.map((row) => (
                <li key={row.opportunity_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <button
                        type="button"
                        onClick={() => onOpenDrawer("opportunities", row.opportunity_id)}
                        className="text-alloy-blue hover:underline text-left font-medium"
                    >
                        {row.opportunity_name?.trim() || "Enrollment inquiry"}
                    </button>
                    {row.status_label || row.status_key ? (
                        <span className="text-alloy-muted text-xs">{row.status_label ?? row.status_key}</span>
                    ) : null}
                    {row.role_label ? <span className="text-alloy-midnight/55 text-xs">· {row.role_label}</span> : null}
                </li>
            ))}
        </ul>
    );
}
