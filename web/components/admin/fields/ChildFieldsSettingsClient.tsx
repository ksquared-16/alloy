"use client";

import EntityFieldsClient from "@/components/admin/EntityFieldsClient";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";

const MANAGE_OPTION_SETS_HREF = "/settings/option-sets";

type Props = {
    manageOptionSetsHref?: string;
    adminV2Chrome?: boolean;
    hideSettingsHeader?: boolean;
};

/** Child tab — merged customer_member + inquiry_child under operator label Child. */
export default function ChildFieldsSettingsClient({
    manageOptionSetsHref = MANAGE_OPTION_SETS_HREF,
    adminV2Chrome = true,
    hideSettingsHeader = true,
}: Props) {
    const { labels } = useEntityLabels();
    const childLabel = adminFieldEntitySingularLabel(labels, "inquiry_child");

    return (
        <EntityFieldsClient
            entityType="customer_member"
            hubEntity="inquiry_child"
            title={`${childLabel} Fields`}
            manageOptionSetsHref={manageOptionSetsHref}
            adminV2Chrome={adminV2Chrome}
            hideSettingsHeader={hideSettingsHeader}
            workspaceCatalogMode
            sectionGroupTitle={childLabel}
        />
    );
}
