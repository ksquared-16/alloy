"use client";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import type { FamilyComposeDraftSeed } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import type { FamilySendWorkConsequence } from "@/lib/communications/v2/familyWorkspace/familySendWorkConsequence";

/**
 * THE record-scoped New Message composer — one presentation, one send lifecycle.
 *
 * Current Work (Contact Family / Send Message / Tour Invitation) and Manage → Send Message both
 * render this, so both reach the Family Communication runtime and `family-send`: preview →
 * confirmation → send, canonical reply binding, shared templates / Send later / BOS.
 *
 * What legitimately differs between the entry points is passed in, never inferred here:
 *  - `draftSeed`        — recipient / channel / subject / body / Tour invitation prefill;
 *  - `entryContext`     — Current Work returns to What's Next on Done;
 *  - `workConsequence`  — whether a confirmed send performs the open Contact Family work.
 *                         Only Current Work declares it. Manage is a message, not a completion.
 */
export default function FamilyNewMessageComposer({
    opportunityId,
    draftSeed = null,
    entryContext = null,
    workConsequence = null,
    onSendAcknowledged = null,
}: {
    opportunityId: string;
    draftSeed?: FamilyComposeDraftSeed | null;
    entryContext?: "current_work" | null;
    workConsequence?: FamilySendWorkConsequence | null;
    onSendAcknowledged?: (() => void) | null;
}) {
    return (
        <div className="alloy-os-activity-cockpit__comms" data-family-new-message-composer="true">
            <div className="alloy-os-activity-workspace__embed" data-activity-cockpit-embed="true">
                <CommunicationsDrawerSection
                    apiEntityType="opportunities"
                    entityId={opportunityId}
                    embedded
                    embeddedHeaderMode="description_only"
                    surfaceVariant="activity_embed"
                    entryContext={entryContext}
                    composeIntent="new_message"
                    draftSeed={draftSeed}
                    workConsequence={workConsequence}
                    onSendAcknowledged={onSendAcknowledged}
                />
            </div>
        </div>
    );
}
