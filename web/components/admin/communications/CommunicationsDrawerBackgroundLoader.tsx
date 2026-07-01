"use client";

import { memo, useLayoutEffect } from "react";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import type { DrawerCommunicationsEntityType } from "@/lib/adminV2/messaging/drawerCommunicationsEntity";

type CommunicationsDrawerBackgroundLoaderProps = {
    apiEntityType: DrawerCommunicationsEntityType;
    entityId: string;
};

/**
 * Invisible preload — warms threads/messages/bindings while Overview is visible.
 * Arms shared prefetch slot (legacy parity) then mounts background section.
 */
function CommunicationsDrawerBackgroundLoader({
    apiEntityType,
    entityId,
}: CommunicationsDrawerBackgroundLoaderProps) {
    useLayoutEffect(() => {
        const id = entityId.trim();
        if (!id) return;
        scheduleDeferredCommunicationsDrawerPrefetch(apiEntityType, id);
    }, [apiEntityType, entityId]);

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
