"use client";

import { memo } from "react";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import type { DrawerCommunicationsEntityType } from "@/lib/adminV2/messaging/drawerCommunicationsEntity";

type CommunicationsDrawerBackgroundLoaderProps = {
    apiEntityType: DrawerCommunicationsEntityType;
    entityId: string;
};

/**
 * Invisible preload — warms threads/messages/bindings while Overview is visible.
 * Memoized so sibling/parent re-renders don't re-drive the preload child; it only
 * re-renders when the warmed entity (type/id) actually changes.
 */
function CommunicationsDrawerBackgroundLoader({
    apiEntityType,
    entityId,
}: CommunicationsDrawerBackgroundLoaderProps) {
    return (
        <div className="hidden" aria-hidden data-adminv2-comms-background-loader="true">
            <CommunicationsDrawerSection
                apiEntityType={apiEntityType}
                entityId={entityId}
                embedded
                active={false}
                backgroundPreload
            />
        </div>
    );
}

export default memo(CommunicationsDrawerBackgroundLoader);
