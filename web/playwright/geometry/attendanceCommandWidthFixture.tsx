/**
 * THE REAL APPROVED ATTENDANCE CARD, with its commands, at authored card widths.
 *
 * The rule under certification is scoped to `[data-universal-card-key="attendance"]`, which the card
 * emits itself. Mounting the real component is therefore the whole point: a hand-written div with
 * that attribute would prove the selector matches a div, not that the shipped card carries it.
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import AttendanceCard from "@/components/operationalCards/AttendanceCard";
import type { AttendanceEvidence } from "@/lib/cardLab/cardLabTypes";

declare global {
    interface Window {
        __att: {
            setCardWidth: (px: number) => Promise<void>;
            measure: () => AttendanceCommandMeasurement;
        };
    }
}

export type AttendanceCommandMeasurement = {
    card: { width: number; left: number; right: number };
    row: { width: number; left: number; right: number };
    commands: {
        label: string;
        left: number;
        right: number;
        width: number;
        height: number;
        top: number;
        /** Laid out wider than the box drawing it — a truncated command. */
        clipped: boolean;
    }[];
    /** Distinct y positions the commands occupy. */
    rows: number;
};

/** The empty day the screenshot shows: nothing recorded, both commands offered. */
const EVIDENCE: AttendanceEvidence = {
    answerLine: "No attendance recorded today",
    supportingLine: "Expected in Monkeys. Nothing recorded yet.",
    statusChip: "Not arrived",
    statusTone: "due",
    expected: { fromLabel: "8:00 AM", toLabel: "4:30 PM", fromMin: 480, toMin: 990 },
    actual: { fromMin: 480, toMin: 480 },
    events: [],
    tickMinutes: [],
    correctionNote: null,
    recentDays: [],
    emptyLine: "Expected in Monkeys. Nothing recorded yet.",
};

function App() {
    const [width, setWidth] = useState(640);
    useEffect(() => {
        window.__att.setCardWidth = async (px: number) => setWidth(px);
    }, []);
    return (
        <div style={{ width: `${width}px` }} data-attendance-card-host="true">
            <AttendanceCard
                evidence={EVIDENCE}
                commands={{ checkIn: () => {}, markAbsent: () => {}, running: null }}
                onViewHistory={() => {}}
            />
        </div>
    );
}

function measure(): AttendanceCommandMeasurement {
    const card = document.querySelector('[data-universal-card-key="attendance"]') as HTMLElement | null;
    const row = document.querySelector(".alloy-os-currentwork__helpful-row") as HTMLElement | null;
    if (!card) throw new Error("the attendance card did not render its identity attribute");
    if (!row) throw new Error("the attendance command row did not render");
    const cardBox = card.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const commands = Array.from(row.children).map((child) => {
        const el = child as HTMLElement;
        const box = el.getBoundingClientRect();
        return {
            label: (el.textContent ?? "").trim(),
            left: +box.left.toFixed(2),
            right: +box.right.toFixed(2),
            width: +box.width.toFixed(2),
            height: +box.height.toFixed(2),
            top: +box.top.toFixed(2),
            clipped: el.scrollWidth > Math.ceil(box.width) + 1,
        };
    });
    return {
        card: { width: +cardBox.width.toFixed(2), left: +cardBox.left.toFixed(2), right: +cardBox.right.toFixed(2) },
        row: { width: +rowBox.width.toFixed(2), left: +rowBox.left.toFixed(2), right: +rowBox.right.toFixed(2) },
        commands,
        rows: new Set(commands.map((c) => Math.round(c.top))).size,
    };
}

window.__att = { setCardWidth: async () => {}, measure };
createRoot(document.getElementById("root")!).render(<App />);
