/**
 * CANONICAL ATTENDANCE READ MODEL → THE LOCKED ATTENDANCE CARD'S INPUT.
 *
 * ── WHY AN ADAPTER AND NOT A SECOND CARD ──
 *
 * There were two implementations of one approved card. The approved specimen is a horizontal DAY
 * TIMELINE at full row width — a track from arrival to departure with ticks, a scale, and the day's
 * movements on a progression band beneath it. Production drew a four-slot grid instead
 * (EXPECTED / ARRIVED / NOW / DEPARTED), which is not a denser version of the timeline; it is a
 * different card.
 *
 * There is now ONE presentation (`components/operationalCards/AttendanceCard.tsx`), rendered by both
 * the lab and the real Focus Panel.
 *
 * ── THE PLATFORM DOES NOT OWN AN EXPECTED TIME WINDOW ──
 *
 * The approved specimen reads "Expected 8:00 AM – 4:30 PM · 4h 1m so far" and draws its track
 * between those two times. Alloy cannot answer that today:
 *
 *   `ExpectedAttendanceEntry`  date · weekday · agreement · member · site · room · pattern · type
 *   `schedule_patterns`        start_date / end_date — DATES, not times of day
 *
 * Scheduling is day-grain. There is no canonical expected arrival or departure TIME anywhere in the
 * model, so the specimen's window is fixture-only. Inventing one — a site default, an 8-to-6
 * assumption — would put a number on the card that no record backs, on the one card an operator
 * uses to check whether the day was recorded correctly.
 *
 * So the track spans what the platform DOES own: the child's actual presence, arrival to now or to
 * checkout. When there is no expected window the card states the times it has rather than a window
 * it does not. The gap is named here rather than papered over, because closing it is a scheduling
 * decision, not a presentation one.
 */

import type {
    AttendanceCardVM,
    AttendanceMovementVM,
} from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import type { AttendanceEvidence, ProgressionStep } from "@/lib/cardLab/cardLabTypes";

/** Minutes from midnight, in the viewer's zone. Null when the timestamp is absent or unparseable. */
function minutesOf(iso: string | null): number | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getHours() * 60 + d.getMinutes();
}

function timeLabel(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function durationLabel(fromMin: number, toMin: number): string {
    const total = Math.max(0, toMin - fromMin);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
}

function movementStep(m: AttendanceMovementVM): ProgressionStep {
    return {
        state: "done",
        label: timeLabel(m.at) ?? "",
        value: m.toRoomLabel ?? "Moved",
        note: m.fromRoomLabel ? `from ${m.fromRoomLabel}` : null,
    };
}

const STATE_CHIP: Record<AttendanceCardVM["state"], { chip: string; tone: "ready" | "due" | "neutral" }> = {
    present: { chip: "Present", tone: "ready" },
    checked_out: { chip: "Checked out", tone: "neutral" },
    absent: { chip: "Absent", tone: "due" },
    not_arrived: { chip: "Not arrived", tone: "due" },
    no_record: { chip: "No record", tone: "neutral" },
};

export function adaptAttendanceVmToAttendanceCard(vm: AttendanceCardVM): AttendanceEvidence {
    const checkInMin = minutesOf(vm.checkInAt);
    const checkOutMin = minutesOf(vm.checkOutAt);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    const fromMin = checkInMin;
    const toMin = checkOutMin ?? (checkInMin != null ? Math.max(checkInMin, nowMin) : null);

    /*
     * THE TRACK'S BOUNDS ARE THE DAY'S OWN SPAN, padded so the arrival tick is not flush against
     * the left edge. With no arrival there is no span, and the card renders its empty state.
     */
    const pad = 30;
    const trackFrom = fromMin != null ? Math.max(0, fromMin - pad) : 0;
    const trackTo = toMin != null ? Math.min(24 * 60, toMin + pad) : 0;

    const steps: ProgressionStep[] = [];
    if (vm.checkInAt) {
        steps.push({
            state: "done",
            label: timeLabel(vm.checkInAt) ?? "",
            value: "Checked in",
            note: vm.expected.roomLabel ?? null,
        });
    }
    for (const m of vm.movements) steps.push(movementStep(m));
    if (vm.checkOutAt) {
        steps.push({
            state: "done",
            label: timeLabel(vm.checkOutAt) ?? "",
            value: "Checked out",
            note: null,
        });
    } else if (vm.checkInAt) {
        steps.push({
            state: "current",
            label: "Now",
            value: vm.currentRoomLabel ?? vm.expected.roomLabel ?? "Present",
            note: null,
        });
    }

    const chip = STATE_CHIP[vm.state];

    /*
     * THE ANSWER LINE, from what is recorded. "In Nap Room since 12:05 PM" when the child is
     * present and the room is known; otherwise the plainest true statement available.
     */
    const answerLine =
        vm.state === "present" ?
            vm.currentRoomLabel && vm.checkInAt ?
                `In ${vm.currentRoomLabel} since ${timeLabel(vm.checkInAt)}`
            :   `Checked in ${timeLabel(vm.checkInAt) ?? ""}`.trim()
        : vm.state === "checked_out" ?
            `Checked out ${timeLabel(vm.checkOutAt) ?? ""}`.trim()
        : vm.state === "absent" ? "Absent today"
        : vm.state === "not_arrived" ? "Not arrived"
        : "No record for today";

    const supportingLine =
        fromMin != null && toMin != null ?
            `${timeLabel(vm.checkInAt)}${vm.checkOutAt ? ` – ${timeLabel(vm.checkOutAt)}` : ""} · ${durationLabel(fromMin, toMin)} so far`
        : vm.expected.roomLabel ? `Expected in ${vm.expected.roomLabel}`
        : "";

    return {
        answerLine,
        supportingLine,
        statusChip: chip.chip,
        statusTone: chip.tone,
        /*
         * `expected` names the TRACK's bounds, which is all the component uses it for. The labels
         * are the day's own first and last recorded times — never an expected window, because the
         * platform has none to give.
         */
        expected: {
            fromLabel: timeLabel(vm.checkInAt) ?? "",
            toLabel: timeLabel(vm.checkOutAt) ?? "Now",
            fromMin: trackFrom,
            toMin: trackTo || trackFrom + 1,
        },
        actual: { fromMin: fromMin ?? 0, toMin: toMin ?? 0 },
        // Empty steps is what makes the component render its empty state, so this must stay honest.
        events: steps,
        tickMinutes: [],
        correctionNote: vm.corrected ? "Today's record carries a correction." : null,
        /*
         * The empty line, built from what IS known. Never "Expected  – Now", which is what the
         * specimen's default produces when the platform has no expected window to fill it with.
         */
        emptyLine:
            vm.state === "absent" ? "Marked absent today."
            : vm.expected.roomLabel ?
                `Expected in ${vm.expected.roomLabel}. Nothing recorded yet.`
            : vm.expected.expected ? "Expected today. Nothing recorded yet."
            : "Not scheduled today. Nothing recorded.",
        recentDays: vm.recentDays.map((d) => ({
            day: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
            state: d.absent ? "absent" : d.missingCheckout ? "partial" : d.present ? "present" : "absent",
            hours:
                d.firstCheckInAt && d.lastCheckOutAt ?
                    durationLabel(minutesOf(d.firstCheckInAt) ?? 0, minutesOf(d.lastCheckOutAt) ?? 0)
                :   "—",
        })),
    };
}
