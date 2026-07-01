"use client";

import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import DrawerRelationshipOverflowText from "@/components/layout/DrawerRelationshipOverflowText";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import {
    resolvePersonOverviewRelatedPeopleGroups,
    type PersonOverviewRelatedPeopleGroup,
} from "@/lib/layout/runtime/resolvePersonOverviewRelatedPeopleGroups";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { PersonDrawerHouseholdMember } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_EMPTY_STATE_SOFT,
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    record: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
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
                <DrawerHouseholdPersonLinkAvatar
                    personId={member.person_id}
                    displayName={member.display_name}
                    initials={member.initials}
                    photoUrl={member.photo_url}
                    rowRecord={rowRecord}
                    onAdornmentAction={onAdornmentAction}
                    componentName="PersonRelatedPeopleGroupsWidget"
                />
                <div className="min-w-0 flex-1">
                    {member.person_id ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="PersonRelatedPeopleGroupsWidget"
                            surface="drawer"
                            item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                            personId={member.person_id}
                            rowRecord={rowRecord}
                            anchorRecord={anchorRecord}
                            adornment={null}
                            display={member.display_name}
                            onAction={onAdornmentAction}
                            className={`block text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    :   <DrawerRelationshipOverflowText
                            value={member.display_name}
                            as="p"
                            className={PRESENTATION_DATA_VALUE_COMPACT}
                        />
                    }
                    {metaLine ?
                        <DrawerRelationshipOverflowText
                            value={metaLine}
                            as="p"
                            lineClamp={3}
                            className={`mt-0.5 ${PRESENTATION_SUPPORTING}`}
                        />
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
        <section className="min-w-0" data-person-related-people-group={group.key}>
            <h4 className={`mb-1.5 px-1 ${PRESENTATION_LABEL}`}>
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
        </section>
    );
}

/** Grouped household adults — read-only cards sourced from VM household projection. */
export default function PersonRelatedPeopleGroupsWidget({ record, onAdornmentAction }: Props) {
    const groups = resolvePersonOverviewRelatedPeopleGroups(record);
    if (groups.length === 0) {
        return (
            <div
                className={`px-4 py-5 ${PRESENTATION_EMPTY_STATE}`}
                data-person-related-people-empty="true"
            >
                <p>No linked family members yet.</p>
                <p className={`mt-1 ${PRESENTATION_EMPTY_STATE_SOFT}`}>
                    Related adults and guardians appear here when linked on the household record.
                </p>
            </div>
        );
    }

    return (
        <div className="min-w-0" data-person-related-people-groups="true">
            <div className="flex flex-col gap-3">
                {groups.map((group) => (
                    <RelatedPeopleGroupBlock
                        key={group.key}
                        group={group}
                        anchorRecord={record}
                        onAdornmentAction={onAdornmentAction}
                    />
                ))}
            </div>
        </div>
    );
}
