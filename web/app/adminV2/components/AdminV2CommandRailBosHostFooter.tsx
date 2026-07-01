"use client";

import { useCommandRailBosHostRef } from "@/app/adminV2/components/CommandRailBosMount";

/** BOS host for surfaces without a workspace Actions command column (settings, forms, etc.). */
export default function AdminV2CommandRailBosHostFooter() {
    const bosHostRef = useCommandRailBosHostRef();

    return (
        <div
            ref={bosHostRef}
            data-adminv2-command-rail-bos-host
            className="adminv2-main-column-bos-host shrink-0 border-t border-alloy-forge/10 bg-white/80 px-2 pb-2 pt-1 backdrop-blur-sm"
        />
    );
}
