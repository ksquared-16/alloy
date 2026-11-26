/**
 * THE PROCESS CARD'S COMMAND REGION, AT AN AUTHORED WIDTH.
 *
 * `ProcessCard` maps `evidence.actions` straight into the platform's `ActionRow` / `Action` inside
 * `.alloy-os-process__work-actions`, and adds no geometry of its own. So that wrapper and those
 * two real components ARE the region under certification — the rules being proven live entirely in
 * `operationalCardsShared.css` and `alloyOsRuntime.css`, both of which the harness injects.
 *
 * The width is the variable, because that is what broke: the region is correct at the wide
 * composition and truncated at the authored Business Process width. The spec drives a matrix.
 */

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Action, ActionRow } from "@/components/cardLab/CardLabKit";

/** The configured set from the Firefly Enrollment stage, in its configured order. */
const COMMANDS: { label: string; primary?: boolean; disabled?: boolean }[] = [
    { label: "Contact Family", primary: true },
    { label: "Tour ▾" },
    { label: "Move to Waitlist" },
    { label: "Add Child" },
];

/** A longer configured set, to prove wrapping rather than truncation as the set grows. */
const LONG_COMMANDS: { label: string; primary?: boolean; disabled?: boolean }[] = [
    { label: "Contact Family", primary: true },
    { label: "Schedule a tour ▾" },
    { label: "Move to Waitlist" },
    { label: "Change lead location" },
    { label: "Send form", disabled: true },
];

export const COMMAND_SETS: Record<string, typeof COMMANDS> = {
    configured: COMMANDS,
    long: LONG_COMMANDS,
    /* One command, to prove a short set does not stretch to fill the line. */
    single: [{ label: "Contact Family", primary: true }],
};

declare global {
    interface Window {
        __cmd: {
            setRegionWidth: (px: number) => Promise<void>;
            setCommandSet: (name: string) => Promise<void>;
            measure: () => CommandRegionMeasurement;
        };
    }
}

export type CommandRegionMeasurement = {
    region: { width: number; clientWidth: number; scrollWidth: number; top: number; bottom: number; left: number; right: number };
    commands: {
        label: string;
        top: number;
        bottom: number;
        left: number;
        right: number;
        width: number;
        height: number;
        /** Whether the label is laid out wider than the box drawing it. */
        clipped: boolean;
    }[];
    /** Distinct y positions the commands occupy — how many rows the region wrapped onto. */
    rows: number;
    /** Where the outcome link sits, which must stay below the stage copy and outside the region. */
    outcomeLinkTop: number;
};

function App() {
    const [width, setWidth] = useState(300);
    const [setName, setSetName] = useState("configured");

    useEffect(() => {
        window.__cmd.setRegionWidth = async (px: number) => setWidth(px);
        window.__cmd.setCommandSet = async (name: string) => setSetName(name);
    }, []);

    const commands = COMMAND_SETS[setName] ?? COMMANDS;

    return (
        /* The authored column the Process work band gives this region. */
        <div style={{ width: `${width}px` }} data-command-region-host="true">
            <div className="alloy-os-process__stage-copy" data-stage-copy="true">
                <strong>Lead</strong> · Reach the family, understand their needs, and determine the
                next step.
            </div>
            {/* Record outcome is a LINK below the stage information, not part of the button region. */}
            <button type="button" className="alloy-os-process__outcome-link" data-outcome-link="true">
                Record outcome
            </button>
            <div className="alloy-os-process__work-actions">
                <ActionRow>
                    {commands.map((command) => (
                        <Action key={command.label} primary={command.primary} disabled={command.disabled}>
                            {command.label}
                        </Action>
                    ))}
                </ActionRow>
            </div>
        </div>
    );
}

function measure(): CommandRegionMeasurement {
    const row = document.querySelector(".alloy-os-currentwork__helpful-row") as HTMLElement | null;
    const outcome = document.querySelector("[data-outcome-link]") as HTMLElement | null;
    if (!row) throw new Error("command region did not render");
    const r = row.getBoundingClientRect();
    const commands = Array.from(row.children).map((child) => {
        const el = child as HTMLElement;
        const box = el.getBoundingClientRect();
        return {
            label: (el.textContent ?? "").trim(),
            top: +box.top.toFixed(2),
            bottom: +box.bottom.toFixed(2),
            left: +box.left.toFixed(2),
            right: +box.right.toFixed(2),
            width: +box.width.toFixed(2),
            height: +box.height.toFixed(2),
            // The label needs more room than the box gives it — an ellipsis, i.e. a truncation.
            clipped: el.scrollWidth > el.clientWidth + 1,
        };
    });
    return {
        region: {
            width: +r.width.toFixed(2),
            clientWidth: row.clientWidth,
            scrollWidth: row.scrollWidth,
            top: +r.top.toFixed(2),
            bottom: +r.bottom.toFixed(2),
            left: +r.left.toFixed(2),
            right: +r.right.toFixed(2),
        },
        commands,
        rows: new Set(commands.map((c) => Math.round(c.top))).size,
        outcomeLinkTop: outcome ? +outcome.getBoundingClientRect().top.toFixed(2) : Number.NaN,
    };
}

const host = document.getElementById("root");
if (host) {
    window.__cmd = {
        setRegionWidth: async () => {},
        setCommandSet: async () => {},
        measure,
    };
    createRoot(host).render(<App />);
}
