"use client";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import type { DrawerCommunicationsEntityType } from "@/lib/adminV2/messaging/drawerCommunicationsEntity";

type CommunicationsDrawerBackgroundLoaderProps = {
    apiEntityType: DrawerCommunicationsEntityType;
    entityId: string;
};

/** Invisible preload — warms threads/messages/bindings while Overview is visible. */
export default function CommunicationsDrawerBackgroundLoader({
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
