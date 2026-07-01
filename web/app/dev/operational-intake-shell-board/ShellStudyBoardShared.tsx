"use client";

import type { ReactNode } from "react";

import { BosSmoke } from "@/app/adminV2/components/bos/identity/BosSmoke";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { BOS_IDENTITY } from "@/lib/bos/bosIdentityTokens";

import { BaselineWorkspaceBody } from "../operational-intake-geometry/OperationalIntakeGeometryShared";

import {
    SHELL_CANVAS_H,
    SHELL_CANVAS_W,
    SHELL_INTERIOR_X,
    SHELL_INTERIOR_Y,
    SILHOUETTE_SPECS,
} from "./shellSilhouettePaths";

/** Production Create Lead interior — fixed pixels; never resize per shell study. */
export const FROZEN_INTERIOR_WIDTH_PX = 1200;
export const FROZEN_INTERIOR_HEIGHT_PX = 560;

const BEND_PINE = BOS_IDENTITY.bendPine;

export type ShellStudyId = keyof typeof SILHOUETTE_SPECS;

type ShellStudyMeta = {
    id: ShellStudyId;
    label: string;
    note: string;
};

export const SHELL_STUDIES: ShellStudyMeta[] = [
    {
        id: "horizontal-capsule",
        label: "1 · Horizontal Capsule",
        note: "Elongated manufactured pill — strong rounded ends",
    },
    {
        id: "stadium-object",
        label: "2 · Stadium Object",
        note: "Larger end curvature — readable across a room",
    },
    {
        id: "superellipse",
        label: "3 · Superellipse",
        note: "Apple hardware curve — smooth mathematical perimeter",
    },
    {
        id: "rounded-hexagon",
        label: "4 · Rounded Hexagon",
        note: "Six-sided softened chassis — premium object",
    },
    {
        id: "rounded-octagon",
        label: "5 · Rounded Octagon",
        note: "Subtle faceting — architectural, not sci-fi",
    },
    {
        id: "winged-stadium",
        label: "6 · Winged Stadium",
        note: "Outward flare at side thirds — airflow silhouette",
    },
    {
        id: "shield",
        label: "7 · Shield",
        note: "Wider top, tapered lower edge — stable object",
    },
    {
        id: "cloud-core",
        label: "8 · Cloud-Core",
        note: "Superellipse chassis + atmospheric aura outside only",
    },
];

/** Identical interior block — same in every shell study. */
export function FrozenCreateLeadInterior() {
    return (
        <div
            className="flex flex-col overflow-hidden bg-white"
            style={{
                width: FROZEN_INTERIOR_WIDTH_PX,
                height: FROZEN_INTERIOR_HEIGHT_PX,
            }}
            data-frozen-interior="create-lead"
        >
            <BaselineWorkspaceBody />
        </div>
    );
}

/**
 * True silhouette shell — SVG path defines the physical perimeter.
 * Interior sits in a fixed rectangular safe inset; content is never clip-pathed.
 */
export function ShellStudyPerimeter({
    studyId,
    children,
}: {
    studyId: ShellStudyId;
    children: ReactNode;
}) {
    const spec = SILHOUETTE_SPECS[studyId];
    const fillId = `shell-fill-${studyId}`;
    const shadowId = `shell-shadow-${studyId}`;

    return (
        <div
            className="relative inline-block"
            data-shell-study={studyId}
            style={{ width: SHELL_CANVAS_W, height: SHELL_CANVAS_H }}
        >
            {spec.aura === "cloud-core" ? (
                <div
                    className="pointer-events-none absolute -inset-x-8 -inset-y-5 opacity-[0.32]"
                    aria-hidden
                >
                    <BosSmoke state="thinking" />
                </div>
            ) : null}

            <svg
                width={SHELL_CANVAS_W}
                height={SHELL_CANVAS_H}
                viewBox={`0 0 ${SHELL_CANVAS_W} ${SHELL_CANVAS_H}`}
                className="absolute inset-0"
                aria-hidden
            >
                <defs>
                    <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.99)" />
                        <stop offset="100%" stopColor="rgba(245,248,250,1)" />
                    </linearGradient>
                    <filter id={shadowId} x="-8%" y="-12%" width="116%" height="128%">
                        <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="rgba(39,63,82,0.14)" />
                        <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,162,131,0.07)" />
                    </filter>
                </defs>
                <path
                    d={spec.path}
                    fill={`url(#${fillId})`}
                    stroke={BEND_PINE}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    filter={`url(#${shadowId})`}
                />
            </svg>

            <div
                className="absolute overflow-hidden bg-white"
                style={{
                    left: SHELL_INTERIOR_X,
                    top: SHELL_INTERIOR_Y,
                    width: FROZEN_INTERIOR_WIDTH_PX,
                    height: FROZEN_INTERIOR_HEIGHT_PX,
                    boxShadow: "inset 0 0 0 1px rgba(39,63,82,0.05)",
                }}
                data-shell-safe="true"
            >
                {children}
            </div>
        </div>
    );
}

/** Scale entire shell+interior uniformly for comparison board cells. */
export const BOARD_CELL_SCALE = 0.365;

export function ShellStudyCell({ study }: { study: ShellStudyMeta }) {
    const scaledW = SHELL_CANVAS_W * BOARD_CELL_SCALE;
    const scaledH = SHELL_CANVAS_H * BOARD_CELL_SCALE;

    return (
        <div className="flex flex-col" data-shell-cell={study.id}>
            <div className="mb-2 min-h-[2.75rem]">
                <p className="text-[11px] font-semibold text-alloy-midnight">{study.label}</p>
                <p className="text-[10px] leading-snug text-alloy-midnight/45">{study.note}</p>
            </div>
            <div style={{ width: scaledW, height: scaledH, overflow: "visible" }}>
                <div
                    style={{
                        transform: `scale(${BOARD_CELL_SCALE})`,
                        transformOrigin: "top left",
                    }}
                >
                    <ShellStudyPerimeter studyId={study.id}>
                        <FrozenCreateLeadInterior />
                    </ShellStudyPerimeter>
                </div>
            </div>
        </div>
    );
}
