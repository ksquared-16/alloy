"use client";

import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import {
    resolvePersonOverviewRelatedPeopleGroups,
    type PersonOverviewRelatedPeopleGroup,
} from "@/lib/layout/runtime/resolvePersonOverviewRelatedPeopleGroups";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { PersonDrawerHouseholdMember } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    record: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
};

const PERSON_LINK_ITEM: LayoutItem = {
    id: "person-related-people-link",
    kind: "field",
    refKey: "person.primary_contact_name",
    adornment: { position: "left", icon: "person", action: { type: "open_drawer", entity: "person", idPath: "person.id" } },
};

function RelatedPersonCard({
    member,
    anchorRecord,
    onAdornmentAction,
}: {
    member: PersonDrawerHouseholdMember;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    const rowRecord: ProofRuntimeRecord = {
        id: member.person_id ?? member.display_name,
        person_id: member.person_id ?? "",
        "person.id": member.person_id ?? "",
        "person.primary_contact_name": member.display_name,
    };
    const metaParts = [
        member.role_label,
        member.is_primary ? "Primary" : null,
        ...member.role_chips,
    ].filter(Boolean);
    const metaLine = [...new Set(metaParts)].join(" · ");

    return (
        <li
            className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
            data-person-related-people-card="true"
        >
            <div className="flex items-start gap-2.5">
                <PersonDrawerIdentityAvatar
                    displayName={member.display_name}
                    initials={member.initials}
                    photoUrl={member.photo_url}
                    size="sm"
                />
                <div className="min-w-0 flex-1">
                    {member.person_id ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="PersonRelatedPeopleGroupsWidget"
                            surface="drawer"
                            item={PERSON_LINK_ITEM}
                            personId={member.person_id}
                            rowRecord={rowRecord}
                            anchorRecord={anchorRecord}
                            adornment={PERSON_LINK_ITEM.adornment}
                            display={member.display_name}
                            onAction={onAdornmentAction}
                            className={`block truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    :   <p className={`truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                            {member.display_name}
                        </p>
                    }
                    {metaLine ?
                        <p className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}>{metaLine}</p>
                    :   null}
                </div>
            </div>
        </li>
    );
}

function RelatedPeopleGroupBlock({
    group,
    anchorRecord,
    onAdornmentAction,
}: {
    group: PersonOverviewRelatedPeopleGroup;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    return (
        <div className="space-y-2" data-person-related-people-group={group.key}>
            <h4 className={PRESENTATION_LABEL}>
                {group.title}
            </h4>
            <ul className="flex flex-col gap-2">
                {group.members.map((member) => (
                    <RelatedPersonCard
                        key={member.person_id ?? member.display_name}
                        member={member}
                        anchorRecord={anchorRecord}
                        onAdornmentAction={onAdornmentAction}
                    />
                ))}
            </ul>
        </div>
    );
}

/** Grouped household adults — read-only cards sourced from VM household projection. */
export default function PersonRelatedPeopleGroupsWidget({ record, onAdornmentAction }: Props) {
    const groups = resolvePersonOverviewRelatedPeopleGroups(record);
    if (groups.length === 0) {
        return <p className={PRESENTATION_EMPTY_STATE}>No related people linked yet.</p>;
    }

    return (
        <div className="space-y-4" data-person-related-people-groups="true">
            {groups.map((group) => (
                <RelatedPeopleGroupBlock
                    key={group.key}
                    group={group}
                    anchorRecord={record}
                    onAdornmentAction={onAdornmentAction}
                />
            ))}
        </div>
    );
}
