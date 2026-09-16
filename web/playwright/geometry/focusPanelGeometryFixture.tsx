/**
 * THE FIXTURE THE BROWSER GEOMETRY GATE MOUNTS.
 *
 * This imports the REAL `FocusPanelCardGrid`, which pulls in the real `useColumnAwareStack`,
 * the real `focusPanelVisualBands` and the real `focusPanelRowHeights`. Nothing here
 * reimplements band derivation, chain grouping or height solving — a test that duplicates the
 * algorithm certifies the duplicate, not the product.
 *
 * What IS synthetic is the card content: each cell is a block of a height the spec controls, so
 * the measured geometry depends on no font, no tenant, no network and no card component. The
 * card's own content height is still a real DOM box laid out by a real engine, which is the
 * only thing the solver is entitled to read.
 *
 * `window.__fp` is the whole contract with the spec: choose a scenario, change a card's content
 * height, wait for a deterministic settle, read rectangles.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import type { FocusPanelGridArea } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

type Scenario = { areas: FocusPanelGridArea[]; heights: Record<string, number> };

const area = (
    card: string,
    colStart: number,
    colSpan: number,
    rowStart: number,
    rowSpan: number,
): FocusPanelGridArea => ({ card, colStart, colSpan, rowStart, rowSpan } as FocusPanelGridArea);

export const SCENARIOS: Record<string, Scenario> = {
    /*
     * A — THE SHAPE PR #989 GOT WRONG.
     *
     * Read off the live Firefly published composition. `rowStart` is 1 and 2: the operator
     * composed these side by side, and column-aware placement staggered the coordinate. An
     * engine equalising on `rowStart === rowStart` leaves these 237 and 325.
     */
    differentRowStartSameBand: {
        areas: [area("business_process", 1, 8, 1, 2), area("financials", 9, 4, 2, 2)],
        heights: { business_process: 237, financials: 325 },
    },

    /* The same band authored WITHOUT the stagger, so the contract is width-of-coordinate-free. */
    sameRowStartSameBand: {
        areas: [area("left", 1, 6, 1, 4), area("right", 7, 6, 1, 4)],
        heights: { left: 237, right: 325 },
    },

    /*
     * B — two stacked against one spanning.
     *
     *     upper │
     *     ──────│ tall
     *     lower │
     */
    stackedAndSpanning: {
        areas: [area("upper", 1, 6, 1, 2), area("lower", 1, 6, 3, 2), area("tall", 7, 6, 1, 4)],
        heights: { upper: 180, lower: 260, tall: 200 },
    },

    /*
     * The discriminating negative control: two bands that must NOT be equalised.
     *
     * An implementation that equalised everything — or that let a band span rows no card
     * occupies, the 268px defect the column-aware model was built to kill — fails here while
     * passing every scenario above.
     */
    differentBandsStayIndependent: {
        areas: [area("upper", 1, 12, 1, 2), area("lower", 1, 12, 3, 2)],
        heights: { upper: 120, lower: 400 },
    },
};

declare global {
    interface Window {
        __fp: {
            setScenario: (name: string) => Promise<void>;
            setHeight: (card: string, px: number) => Promise<void>;
            settle: (maxFrames?: number) => Promise<{ settled: boolean; frames: number }>;
            geometry: () => Record<string, CardGeometry>;
            counts: () => { resize: number; mutation: number };
        };
        __obs: { resize: number; mutation: number };
    }
}

export type CardGeometry = {
    /** The wrapper the composition assigns to. */
    top: number;
    bottom: number;
    height: number;
    left: number;
    width: number;
    /** The card the operator sees. */
    cardTop: number;
    cardBottom: number;
    cardHeight: number;
    /** The intrinsic node. Positive means content is spilling out of its assigned band. */
    overflow: number;
};

function App() {
    const [name, setName] = useState("differentRowStartSameBand");
    const [overrides, setOverrides] = useState<Record<string, number>>({});

    const scenario = SCENARIOS[name];
    const heights = useMemo(() => ({ ...scenario.heights, ...overrides }), [scenario, overrides]);

    // Publish only the two controls that need React state. `settle`, `geometry` and `counts`
    // are installed before the root mounts and are never replaced.
    useEffect(() => {
        window.__fp.setScenario = async (next: string) => {
            setOverrides({});
            setName(next);
        };
        window.__fp.setHeight = async (card: string, px: number) => {
            setOverrides((prev) => ({ ...prev, [card]: px }));
        };
    }, []);

    const renderCell = useCallback(
        (key: string) => (
            <div
                data-geometry-content={key}
                style={{ height: `${heights[key] ?? 100}px`, background: "#eef" }}
            />
        ),
        [heights],
    );

    return (
        <FocusPanelCardGrid
            rows={[]}
            publishedLayout={{ rows: [], grid: { columns: 12, areas: scenario.areas } } as never}
            renderCell={renderCell}
        />
    );
}

/*
 * SETTLED IS A MEASURED CONDITION, NEVER A SLEEP.
 *
 * Three consecutive animation frames whose geometry string is byte-identical. Three rather than
 * two because the MutationObserver half of the engine coalesces to one read per frame, so a
 * content change legitimately takes a frame to reach the solver; two would call the midpoint of
 * a two-step settle "settled". The frame count comes back so the caller can bound it — a layout
 * that oscillates never produces three identical frames and reports `settled: false` rather than
 * hanging.
 */
function geometryOf(): Record<string, CardGeometry> {
    const out: Record<string, CardGeometry> = {};
    for (const wrapper of Array.from(document.querySelectorAll("[data-fp-grid-area]"))) {
        const key = wrapper.getAttribute("data-fp-grid-area");
        if (!key) continue;
        const intrinsic = wrapper.querySelector("[data-fp-card-intrinsic]");
        const card = intrinsic?.firstElementChild;
        const w = wrapper.getBoundingClientRect();
        const i = intrinsic?.getBoundingClientRect();
        const c = card?.getBoundingClientRect();
        out[key] = {
            top: +w.top.toFixed(2),
            bottom: +w.bottom.toFixed(2),
            height: +w.height.toFixed(2),
            left: +w.left.toFixed(2),
            width: +w.width.toFixed(2),
            cardTop: c ? +c.top.toFixed(2) : Number.NaN,
            cardBottom: c ? +c.bottom.toFixed(2) : Number.NaN,
            cardHeight: c ? +c.height.toFixed(2) : Number.NaN,
            overflow: i ? +(i.height - w.height).toFixed(2) : Number.NaN,
        };
    }
    return out;
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settle(maxFrames = 180): Promise<{ settled: boolean; frames: number }> {
    let previous = "";
    let identical = 0;
    for (let frames = 1; frames <= maxFrames; frames += 1) {
        await frame();
        const current = JSON.stringify(geometryOf());
        if (current === previous && current !== "{}") {
            identical += 1;
            if (identical >= 3) return { settled: true, frames };
        } else {
            identical = 0;
            previous = current;
        }
    }
    return { settled: false, frames: maxFrames };
}

const host = document.getElementById("root");
if (host) {
    window.__fp = {
        setScenario: async () => {},
        setHeight: async () => {},
        settle,
        geometry: geometryOf,
        counts: () => ({ ...window.__obs }),
    };
    createRoot(host).render(<App />);
}
