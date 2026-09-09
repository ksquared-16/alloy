/**
 * What the Attendance overview says about today — pure, and derived only from
 * the roster model the workspace already loaded.
 *
 * ── THE DISTINCTION THIS MODULE EXISTS TO KEEP ──
 *
 * There are two honest answers to "how many children are in Toddler 1", and the
 * workspace needs both:
 *
 *   - ROSTER PRESENCE — how many children placed in Toddler 1 made it in today.
 *     Answers "is my class here". Counts a child who walked to the playground.
 *   - PHYSICAL OCCUPANCY — how many children are standing in Toddler 1 right now.
 *     Answers "how many am I looking at". Counts visitors from other rooms and
 *     excludes her.
 *
 * The pre-existing `cell.actualChildrenPresent` is the first. The overview used
 * it to answer the second, which is only correct on a day when nobody moves.
 * Rather than redefine a certified field, this derives the second alongside it
 * and the UI labels which is which.
 *
 * No new Attendance truth: `actualRoomLocationId` is the certified whereabouts
 * fold's answer, resolved upstream in `buildCombinedRoster`.
 */

/** The subset of a roster child this model reads. */
export type OverviewChild = {
    customerMemberId: string;
    displayName: string;
    actual: {
        state: "present" | "checked_out" | "absent" | "no_record";
        actualRoomLocationId: string | null;
    };
};

/** The subset of a roster cell (room·date) this model reads. */
export type OverviewCell = {
    roomLocationId: string;
    roomName: string;
    children: readonly OverviewChild[];
};

export type AwayFromPlacement = {
    key: string;
    customerMemberId: string;
    displayName: string;
    /** The room the child is placed in — where their roster row lives. */
    placedIn: string;
    /** The room the child is actually in right now. */
    nowIn: string;
};

export type AttendanceOverviewModel = {
    /** Children physically in each room right now, keyed by room location id. */
    hereNowByRoom: ReadonlyMap<string, number>;
    /** Present children who are not in the room they are placed in. */
    awayFromPlacement: AwayFromPlacement[];
    counts: {
        expected: number;
        present: number;
        notArrived: number;
        checkedOut: number;
        absent: number;
    };
};

export function buildAttendanceOverviewModel(
    cells: readonly OverviewCell[]
): AttendanceOverviewModel {
    const roomNameById = new Map(cells.map((c) => [c.roomLocationId, c.roomName]));

    const hereNowByRoom = new Map<string, number>();
    const awayFromPlacement: AwayFromPlacement[] = [];
    const counts = { expected: 0, present: 0, notArrived: 0, checkedOut: 0, absent: 0 };

    for (const cell of cells) {
        for (const child of cell.children) {
            counts.expected += 1;

            switch (child.actual.state) {
                case "present":
                    counts.present += 1;
                    break;
                case "checked_out":
                    counts.checkedOut += 1;
                    break;
                case "absent":
                    counts.absent += 1;
                    break;
                default:
                    counts.notArrived += 1;
            }

            if (child.actual.state !== "present") continue;

            // A present child with no resolved location is counted where she is
            // placed — the fold could not say otherwise, and dropping her would
            // make the room totals quietly disagree with the header count.
            const at = child.actual.actualRoomLocationId ?? cell.roomLocationId;
            hereNowByRoom.set(at, (hereNowByRoom.get(at) ?? 0) + 1);

            if (at !== cell.roomLocationId) {
                awayFromPlacement.push({
                    key: `away:${child.customerMemberId}`,
                    customerMemberId: child.customerMemberId,
                    displayName: child.displayName,
                    placedIn: cell.roomName,
                    nowIn: roomNameById.get(at) ?? "another room",
                });
            }
        }
    }

    return { hereNowByRoom, awayFromPlacement, counts };
}
