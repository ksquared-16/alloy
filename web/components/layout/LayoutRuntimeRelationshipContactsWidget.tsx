"use client";

import DrawerHouseholdPersonLinkAvatar, {
    DRAWER_HOUSEHOLD_PERSON_LINK_ITEM,
} from "@/components/layout/DrawerHouseholdPersonLinkAvatar";
import DrawerRelationshipOverflowText from "@/components/layout/DrawerRelationshipOverflowText";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { readLayoutEditorRelationshipWidgetConfig } from "@/lib/layout/layoutEditorRelationshipWidgetConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import {
    layoutRuntimeRelationshipWidgetEmptyMessage,
    resolveLayoutRuntimeOpportunityRelationshipContactGroups,
    resolveLayoutRuntimeRelatedChildrenForPerson,
    resolveLayoutRuntimeScopedRelationshipContacts,
    type RelationshipWidgetKey,
    type ScopedRelationshipContactGroup,
    type ScopedRelationshipContactRow,
} from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import { resolveLayoutRuntimeActiveRecordContext } from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_EMPTY_STATE,
    PRESENTATION_EMPTY_STATE_SOFT,
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

type Props = {
    record: ProofRuntimeRecord;
    item: LayoutItem;
    widgetKey: RelationshipWidgetKey;
    onAdornmentAction?: AdornmentActionHandler;
};

function ContactCard({
    contact,
    anchorRecord,
    onAdornmentAction,
}: {
    contact: ScopedRelationshipContactRow;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    const rowRecord: ProofRuntimeRecord = {
        id: contact.person_id ?? contact.contact_id ?? contact.display_name,
        person_id: contact.person_id ?? "",
        "person.id": contact.person_id ?? "",
        "person.primary_contact_name": contact.display_name,
    };
    const metaParts = [contact.role_label, contact.is_primary ? "Primary" : null].filter(Boolean);
    const metaLine = [...new Set(metaParts)].join(" · ");

    return (
        <li
            className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
            data-layout-runtime-relationship-contact="true"
        >
            <div className="flex items-start gap-2.5">
                <DrawerHouseholdPersonLinkAvatar
                    personId={contact.person_id}
                    displayName={contact.display_name}
                    initials={contact.display_name.slice(0, 2).toUpperCase()}
                    photoUrl={null}
                    rowRecord={rowRecord}
                    onAdornmentAction={onAdornmentAction}
                    componentName="LayoutRuntimeRelationshipContactsWidget"
                />
                <div className="min-w-0 flex-1">
                    {contact.person_id ?
                        <LayoutRuntimePersonLinkSurface
                            componentName="LayoutRuntimeRelationshipContactsWidget"
                            surface="drawer"
                            item={DRAWER_HOUSEHOLD_PERSON_LINK_ITEM}
                            personId={contact.person_id}
                            rowRecord={rowRecord}
                            anchorRecord={anchorRecord}
                            adornment={null}
                            display={contact.display_name}
                            onAction={onAdornmentAction}
                            className={`block text-left hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                        />
                    :   <DrawerRelationshipOverflowText
                            value={contact.display_name}
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

function ContactGroupBlock({
    group,
    anchorRecord,
    onAdornmentAction,
}: {
    group: ScopedRelationshipContactGroup;
    anchorRecord: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    return (
        <section className="min-w-0" data-layout-runtime-relationship-group={group.key}>
            <h4 className={`mb-1.5 px-1 ${PRESENTATION_LABEL}`}>{group.title}</h4>
            <ul className="flex flex-col gap-2">
                {group.contacts.map((contact) => (
                    <ContactCard
                        key={`${group.key}-${contact.person_id ?? contact.contact_id ?? contact.display_name}`}
                        contact={contact}
                        anchorRecord={anchorRecord}
                        onAdornmentAction={onAdornmentAction}
                    />
                ))}
            </ul>
        </section>
    );
}

export default function LayoutRuntimeRelationshipContactsWidget({
    record,
    item,
    widgetKey,
    onAdornmentAction,
}: Props) {
    const config = readLayoutEditorRelationshipWidgetConfig(item) ?? undefined;
    const anchorContext = resolveLayoutRuntimeActiveRecordContext(record);

    const grouped =
        widgetKey === "related_children_for_person" ?
            resolveLayoutRuntimeRelatedChildrenForPerson(record, widgetKey, config)
        : anchorContext.anchorEntity === "opportunity" ?
            resolveLayoutRuntimeOpportunityRelationshipContactGroups(record, widgetKey, config)
        :   null;

    const flatContacts =
        grouped ? [] : resolveLayoutRuntimeScopedRelationshipContacts(record, widgetKey, config);

    if (grouped && grouped.length > 0) {
        return (
            <div className="min-w-0" data-layout-runtime-relationship-widget={widgetKey}>
                <div className="flex flex-col gap-3">
                    {grouped.map((group) => (
                        <ContactGroupBlock
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

    if (flatContacts.length === 0) {
        return (
            <div className={`px-4 py-5 ${PRESENTATION_EMPTY_STATE}`} data-layout-runtime-relationship-empty="true">
                <p>{layoutRuntimeRelationshipWidgetEmptyMessage(widgetKey)}</p>
                <p className={`mt-1 ${PRESENTATION_EMPTY_STATE_SOFT}`}>
                    Child-scoped contacts are shown first; household fallback applies only when configured.
                </p>
            </div>
        );
    }

    return (
        <div className="min-w-0" data-layout-runtime-relationship-widget={widgetKey}>
            <ul className="flex flex-col gap-2">
                {flatContacts.map((contact) => (
                    <ContactCard
                        key={contact.person_id ?? contact.contact_id ?? contact.display_name}
                        contact={contact}
                        anchorRecord={record}
                        onAdornmentAction={onAdornmentAction}
                    />
                ))}
            </ul>
        </div>
    );
}
