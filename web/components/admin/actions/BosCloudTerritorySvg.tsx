"use client";

import { useId } from "react";

/**
 * Asymmetric BOS room silhouette — large top canopy, soft sides, broad calm base.
 * Decorative frame only; never clips functional UI.
 */
export const BOS_CLOUD_FRAME_PATH = `
  M 178 348
  C 92 278, 48 168, 108 98
  C 142 28, 308 -4, 428 58
  C 518 8, 688 14, 798 82
  C 928 38, 1108 62, 1188 148
  C 1288 168, 1368 258, 1348 358
  C 1408 448, 1388 568, 1328 638
  C 1358 718, 1288 798, 1178 808
  C 1108 858, 978 868, 868 828
  C 758 858, 608 848, 518 792
  C 418 822, 288 788, 228 682
  C 168 592, 158 442, 228 342
  C 158 282, 108 182, 178 348
  Z
`;

/** Thick soft cloud body — mint room fill behind desk card. */
export function BosCloudTerritorySvg() {
    const uid = useId().replace(/:/g, "");
    const roomFillId = `bosRoomFill-${uid}`;
    const roomDepthId = `bosRoomDepth-${uid}`;

    return (
        <svg
            viewBox="0 0 1400 920"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
            aria-hidden
            data-bos-cloud-territory-svg="true"
        >
            <defs>
                <radialGradient id={roomFillId} cx="48%" cy="34%" r="88%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
                    <stop offset="42%" stopColor="#F6FCFA" stopOpacity="0.96" />
                    <stop offset="72%" stopColor="#E6F5F0" stopOpacity="0.88" />
                    <stop offset="100%" stopColor="#C8E8DC" stopOpacity="0.78" />
                </radialGradient>
                <radialGradient id={roomDepthId} cx="50%" cy="88%" r="62%">
                    <stop offset="0%" stopColor="#D8EFE8" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#B8DFD4" stopOpacity="0.32" />
                </radialGradient>
            </defs>

            <path fill={`url(#${roomFillId})`} d={BOS_CLOUD_FRAME_PATH} />
            <path fill={`url(#${roomDepthId})`} d={BOS_CLOUD_FRAME_PATH} opacity="0.72" />
        </svg>
    );
}

/** Low-contrast perimeter whisper — not a traced border. */
export function BosCloudTerritoryEdgeOverlay() {
    return (
        <svg
            viewBox="0 0 1400 920"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
            aria-hidden
            data-bos-cloud-territory-edge="true"
        >
            <path
                d={BOS_CLOUD_FRAME_PATH}
                fill="none"
                stroke="rgba(0,162,131,0.14)"
                strokeWidth="6"
            />
            <path
                d={BOS_CLOUD_FRAME_PATH}
                fill="none"
                stroke="rgba(255,255,255,0.38)"
                strokeWidth="2"
            />
        </svg>
    );
}
