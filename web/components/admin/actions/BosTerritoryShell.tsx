"use client";

import type { CSSProperties, ReactNode } from "react";
import {
    BosCloudTerritoryEdgeOverlay,
    BosCloudTerritorySvg,
} from "@/components/admin/actions/BosCloudTerritorySvg";
import { BosTerritoryAtmosphere } from "@/components/admin/actions/BosTerritoryAtmosphere";
import {
    BOS_CANVAS_HEIGHT,
    BOS_CANVAS_WIDTH,
    BOS_TERRITORY_DROP_SHADOW,
    BOS_WORKSPACE_HEIGHT,
    BOS_WORKSPACE_RADIUS,
    BOS_WORKSPACE_SHADOW,
    BOS_WORKSPACE_TOP_OFFSET,
    BOS_WORKSPACE_WIDTH,
} from "@/lib/admin/actions/bosCloudTerritoryPath";

type Props = {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
};

/**
 * BOS room / desk — cloud territory wraps a smaller premium workspace card inside.
 * Cloud is outer frame only; workspace is never clipped.
 */
export function BosTerritoryShell({ children, className = "", style }: Props) {
    return (
        <div
            className={`relative overflow-visible ${className}`}
            style={{
                position: "relative",
                width: BOS_CANVAS_WIDTH,
                height: BOS_CANVAS_HEIGHT,
                filter: BOS_TERRITORY_DROP_SHADOW,
                ...style,
            }}
            data-action-workspace-bos-cloud-territory="true"
            data-bos-territory-shell="true"
            data-bos-territory-v2="true"
            data-bos-cloud-frame="true"
            data-bos-cloud-room="true"
        >
            <BosTerritoryAtmosphere />
            <BosCloudTerritorySvg />
            <BosCloudTerritoryEdgeOverlay />

            <div
                className="relative z-10 mx-auto flex min-h-0 flex-col overflow-hidden bg-white"
                style={{
                    width: BOS_WORKSPACE_WIDTH,
                    height: BOS_WORKSPACE_HEIGHT,
                    marginTop: BOS_WORKSPACE_TOP_OFFSET,
                    borderRadius: BOS_WORKSPACE_RADIUS,
                    ...BOS_WORKSPACE_SHADOW,
                }}
                data-bos-workspace="true"
                data-bos-workspace-desk="true"
                data-action-workspace-cloud-safe-zone="true"
                data-action-workspace-panel="true"
            >
                {children}
            </div>
        </div>
    );
}
