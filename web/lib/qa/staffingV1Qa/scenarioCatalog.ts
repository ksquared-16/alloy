/**
 * STAFFING / SCHEDULING / COVERAGE V1 — THE HUMAN ACCEPTANCE CATALOG.
 *
 * Six slices certified this product automatically: authority, projection, mounted Calendar,
 * gap resolution. Automated certification proves the product does what the tests say. It
 * cannot prove an operator can understand what they are looking at, and it can never produce
 * a human acceptance. This catalog is the second thing.
 *
 * It follows the Core Financials Director QA catalog deliberately — same scenario shape, same
 * result vocabulary, same results table namespaced by suite. A second QA framework would be a
 * second thing to maintain and a second set of habits to learn.
 *
 * ── WHY A CATALOG AND NOT A SCRIPT ──
 *
 * The harness renders these. Figures the operator will see are DERIVED from the live fixture
 * when the page opens, never written down here: a scenario with baked-in numbers either drifts
 * into fiction or quietly forces a reseed of a shared tenant. What is written here is what
 * cannot be derived — what the step is for, what to do, what must change, what must NOT, and
 * the staffing law the step protects.
 */

/**
 * THE WORDING OF THE QUESTIONS, VERSIONED.
 *
 * An acceptance answers a specific question. Rewrite the question and the old answer stops
 * being an answer to it, so every recorded result carries the version it was given under.
 * Bump this whenever a scenario's meaning changes; adding a scenario counts, a typo does not.
 */
export const CATALOG_VERSION = "2026-09-22.1";

/** The acceptance program these scenarios belong to. Results are namespaced by it. */
export const SUITE_KEY = "staffing_v1_human_qa";

/**
 * HOW a scenario is proven. Not the same axis as whether it is runnable today.
 *
 *   HUMAN_WALKTHROUGH   the operator drives it in the product, start to finish
 *   FIXTURE_NEEDED      the product supports it; this environment has nothing to show it with
 */
export type ScenarioDisposition = "HUMAN_WALKTHROUGH" | "FIXTURE_NEEDED";

/** What must hold before a scenario can be driven. Checked live, never assumed. */
export type ScenarioPrecondition =
    | { kind: "fixture"; check: FixtureCheck; describe: string };

export type FixtureCheck =
    | "site_exists"
    | "room_exists"
    | "child_demand_on_qa_date"
    | "requirement_resolves"
    | "adequate_segment_exists"
    | "gap_segment_exists"
    | "staff_candidates_exist"
    | "attendance_observed_on_qa_date";

export type Scenario = {
    /** Stable across renumbering — results persist against this, never the position. */
    key: string;
    order: number;
    title: string;
    disposition: ScenarioDisposition;
    /** Plain language. What this proves, for someone who does not read code. */
    purpose: string;
    /** Business meaning, no engineering jargon. */
    whyItMatters: string;
    /** Required whenever the disposition is not HUMAN_WALKTHROUGH. */
    dispositionReason?: string;
    requires: ScenarioPrecondition[];
    /** Exact navigation, in the labels this build actually renders. */
    navigate: string[];
    doThis: string[];
    /** What must change. */
    expectChanges: string[];
    /** What must NOT change. Usually where the real defects hide. */
    expectUnchanged: string[];
    /** The one staffing law this step protects. */
    invariant: string;
    /** What a failure tends to look like, so a tester recognises one. */
    failSymptoms: string[];
};

/** The staffing laws the harness restates beside the scenarios that depend on them. */
export const STAFFING_INVARIANTS = Object.freeze({
    UNKNOWN_IS_NOT_ZERO:
        "Not knowing and knowing nothing is needed are different answers. A requirement the platform cannot resolve says Unknown in neutral grey; it never renders as zero, as adequate, or as a gap.",
    HOURS_UNKNOWN_IS_NOT_ALL_DAY:
        "An assignment that recurs without recorded hours is a day whose hours nobody wrote down. It is never treated as all day, and the child or staff member is counted in no segment.",
    BOUNDARIES_ARE_DERIVED:
        "The day is cut where the facts change — hours starting, a shift ending, Coverage moving somebody. Never into fixed buckets, because a bucket hides the short stretch it spans.",
    PLAN_IS_NOT_AVAILABILITY:
        "Someone unavailable is still PLANNED — the schedule said so, and erasing it hides why the room is short. They simply stop counting toward the requirement.",
    PLAN_IS_NOT_ACTUAL:
        "Where someone is planned and where they were observed are two facts. The product shows the divergence and never edits one to match the other.",
    EXPECTED_IS_NOT_ACTUAL:
        "Expected children come from the schedule; actual children come from Attendance. Neither is rewritten to agree with the other.",
    ONE_EMPLOYMENT_COUNTS_ONCE:
        "A person planned at the site and moved into a room by Coverage is one person in that room, never one in each.",
    COVERAGE_IS_NOT_CANCELLED_FOR_YOU:
        "Recording that someone cannot work never withdraws their Coverage. The rooms they were covering are the operator's decision.",
    AVAILABILITY_HAS_THREE_ANSWERS:
        "Available, unavailable, and not recorded. The third is not a quiet version of either other one, and nobody is hidden from a list for lacking a record.",
    NOBODY_IS_RANKED:
        "The product offers facts about who could cover and no opinion about who should. No scoring, no recommendation, no best candidate.",
    ASSIGNMENT_IS_THE_BASELINE:
        "Coverage specialises one day. It never rewrites the durable Assignment, and neither does anything else on this screen.",
});

const S = (s: Scenario) => s;

export const SCENARIOS: readonly Scenario[] = Object.freeze([
    S({
        key: "operations_orientation",
        order: 1,
        title: "You can find the operating day without being told how",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Open Operations, choose the QA site, and reach the Calendar on the QA date.",
        whyItMatters:
            "Everything else in this walkthrough happens on one screen. If an operator cannot reach it and orient themselves on it, nothing below matters.",
        requires: [{ kind: "fixture", check: "site_exists", describe: "the QA site resolves" }],
        navigate: ["Open Operations from the left sidebar.", "Choose the QA site in the picker, top right.", "Click the Calendar tab, beside Roster."],
        doThis: ["Use the arrows to reach the QA date.", "Read the row labels down the left."],
        expectChanges: ["The date in the header becomes the QA date."],
        expectUnchanged: ["Your site selection survives switching between Roster and Calendar."],
        invariant: STAFFING_INVARIANTS.BOUNDARIES_ARE_DERIVED,
        failSymptoms: ["No Calendar tab.", "The date resets when you switch tabs.", "Rooms are not listed as rows."],
    }),
    S({
        key: "baseline_child_demand",
        order: 2,
        title: "Children appear only during the hours they are expected",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm the expected child shows up for their own hours, and that a different weekday uses different hours.",
        whyItMatters:
            "One child can attend different hours on different days. A product that flattens that into one daily shape will quietly staff the wrong part of the day.",
        requires: [{ kind: "fixture", check: "child_demand_on_qa_date", describe: "a child is expected on the QA date" }],
        navigate: ["Stay on the Calendar, on the QA date.", "Click the block covering the middle of the day."],
        doThis: ["Read the expected children figure.", "Move back one day and read it again."],
        expectChanges: ["The hours the child occupies differ between the two days."],
        expectUnchanged: ["The child is counted in no stretch outside their own hours."],
        invariant: STAFFING_INVARIANTS.HOURS_UNKNOWN_IS_NOT_ALL_DAY,
        failSymptoms: ["The child spans the whole day.", "Both weekdays look identical.", "A child with no recorded hours is counted anyway."],
    }),
    S({
        key: "baseline_staffing",
        order: 3,
        title: "Staff appear where they are actually placed",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Tell a room-assigned staff member from a site-level one.",
        whyItMatters:
            "Site-level and float staff are real placements, not missing data. Inventing a room for them would put people in rooms nobody assigned them to.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "staff are assigned at the QA site" }],
        navigate: ["Click a block in the QA room.", "Then look at the Site — no room row."],
        doThis: ["Read who is planned in the room and why (Assignment or Coverage).", "Read who sits on the site row."],
        expectChanges: [],
        expectUnchanged: ["Nobody appears in two places for the same stretch.", "Site-level staff are shown at the site, not given a room."],
        invariant: STAFFING_INVARIANTS.ONE_EMPLOYMENT_COUNTS_ONCE,
        failSymptoms: ["A site-level person shown inside a room.", "The same person counted twice.", "An empty Site row when site staff exist."],
    }),
    S({
        key: "staffing_requirement",
        order: 4,
        title: "The room states what it needs",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Read the required-staff figure and check it follows the configured ratio.",
        whyItMatters:
            "The requirement is the whole basis of adequate versus short. If it cannot be resolved the product must say Unknown rather than imply zero.",
        requires: [{ kind: "fixture", check: "requirement_resolves", describe: "a ratio rule covers the QA room" }],
        navigate: ["Read the QA room's summary line."],
        doThis: ["Compare needs N against the expected children and the configured ratio."],
        expectChanges: [],
        expectUnchanged: ["A room the platform cannot evaluate reads Unknown, never zero."],
        invariant: STAFFING_INVARIANTS.UNKNOWN_IS_NOT_ZERO,
        failSymptoms: ["needs 0 in a room with children.", "A green room whose requirement could not be resolved."],
    }),
    S({
        key: "adequate_room",
        order: 5,
        title: "A covered stretch says so, and says why",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Open the adequately covered stretch and read its explanation.",
        whyItMatters:
            "Operators scan for trouble. A room that is fine must be quietly and obviously fine, with the reasoning available if they want it.",
        requires: [{ kind: "fixture", check: "adequate_segment_exists", describe: "an adequate stretch exists" }],
        navigate: ["Click the covered block in the QA room."],
        doThis: ["Read expected children, required staff and planned staff."],
        expectChanges: [],
        expectUnchanged: ["The chip reads Staffed and the arithmetic in the panel agrees with it."],
        invariant: STAFFING_INVARIANTS.UNKNOWN_IS_NOT_ZERO,
        failSymptoms: ["Staffed with fewer planned than required.", "An explanation that contradicts the chip."],
    }),
    S({
        key: "coverage_gap",
        order: 6,
        title: "A gap is visible and explains itself",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Find the short stretch and understand it without doing arithmetic.",
        whyItMatters:
            "This is the product's reason to exist. A gap the operator has to compute themselves is a gap they will miss.",
        requires: [{ kind: "fixture", check: "gap_segment_exists", describe: "a short stretch exists" }],
        navigate: ["Click the gold block in the QA room."],
        doThis: ["Read the four lines: expected, required, planned, short by how many."],
        expectChanges: [],
        expectUnchanged: ["The shortfall matches required minus planned for that stretch."],
        invariant: STAFFING_INVARIANTS.BOUNDARIES_ARE_DERIVED,
        failSymptoms: ["A short room not marked.", "A shortfall you cannot reconcile.", "The gap spanning hours it should not."],
    }),
    S({
        key: "who_could_cover",
        order: 7,
        title: "Who could cover — facts, not opinions",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Open the chooser on the gap and read each person's availability status.",
        whyItMatters:
            "A list that hides people with no recorded availability leaves the operator stuck. A list that calls them available is lying. Both were real failures here.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "candidates are offered" }],
        navigate: ["In the gap panel, read Who could cover this stretch."],
        doThis: ["Read every candidate's status and any conflict note."],
        expectChanges: [],
        expectUnchanged: [
            "Nobody without a record is described as available.",
            "Nobody is hidden for lacking a record.",
            "Nobody is ranked, scored or recommended.",
            "Anyone already planned elsewhere says so.",
        ],
        invariant: STAFFING_INVARIANTS.AVAILABILITY_HAS_THREE_ANSWERS,
        failSymptoms: ["An empty list beside a real gap.", "Unknown shown as Available.", "A best match or a star.", "A conflict shown as nothing at all."],
    }),
    S({
        key: "plan_coverage",
        order: 8,
        title: "Gap to action to resolved, without leaving the screen",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Plan Coverage into the gap from the chooser.",
        whyItMatters:
            "The context is already on screen — site, room, date, interval. Asking the operator to retype it is how a fix becomes a chore that does not happen.",
        requires: [{ kind: "fixture", check: "gap_segment_exists", describe: "a short stretch to fill" }],
        navigate: ["In the gap panel, click Plan ⟨name⟩ here."],
        doThis: ["Choose someone and confirm.", "Watch the day reload."],
        expectChanges: ["That person appears in the room for that stretch, marked Coverage.", "The room's state improves."],
        expectUnchanged: ["Their durable Assignment is untouched.", "Nothing was retyped."],
        invariant: STAFFING_INVARIANTS.ASSIGNMENT_IS_THE_BASELINE,
        failSymptoms: ["A form asking for room, date or time again.", "The day not refreshing.", "The assignment changing."],
    }),
    S({
        key: "split_day_coverage",
        order: 9,
        title: "One person, two rooms, counted once",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Plan the same person into a second, non-overlapping stretch.",
        whyItMatters:
            "Float staff move through the day. The product must represent that without ever counting one person as two.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "someone to move" }],
        navigate: ["Pick another stretch in another room on the same day."],
        doThis: ["Plan the same person there."],
        expectChanges: ["They appear in both places, at different times."],
        expectUnchanged: ["No stretch shows them twice.", "Their Assignment is unchanged."],
        invariant: STAFFING_INVARIANTS.ONE_EMPLOYMENT_COUNTS_ONCE,
        failSymptoms: ["A refusal for a non-overlapping interval.", "The same person counted in two rooms at one moment."],
    }),
    S({
        key: "change_coverage",
        order: 10,
        title: "Changing a plan, the way this version actually does it",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Move someone by cancelling and re-planning.",
        whyItMatters:
            "V1 ships cancel-then-plan rather than a direct change button. That is a real product decision and the walkthrough states it rather than implying a control that is not there.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "a Coverage allocation to move" }],
        navigate: ["Open a stretch where someone was placed by Coverage."],
        doThis: ["Cancel Coverage, then plan them into the intended stretch."],
        expectChanges: ["The old placement stops applying; the new one takes effect."],
        expectUnchanged: ["The Assignment is unchanged."],
        invariant: STAFFING_INVARIANTS.ASSIGNMENT_IS_THE_BASELINE,
        failSymptoms: ["A Change button that does nothing.", "The old placement still effective."],
    }),
    S({
        key: "cancel_coverage",
        order: 11,
        title: "Cancelling returns them to their baseline",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Cancel a Coverage allocation and watch the room settle back.",
        whyItMatters:
            "Withdrawing a plan must not erase that it was made, and the room must return to what the Assignment says.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "a Coverage allocation to cancel" }],
        navigate: ["Open a stretch with a Coverage placement."],
        doThis: ["Click Cancel Coverage."],
        expectChanges: ["They drop back to where their Assignment puts them."],
        expectUnchanged: ["The Assignment is unchanged."],
        invariant: STAFFING_INVARIANTS.ASSIGNMENT_IS_THE_BASELINE,
        failSymptoms: ["The person vanishing entirely.", "The room keeping the cancelled placement."],
    }),
    S({
        key: "staff_call_out",
        order: 12,
        title: "A call-out changes what you see, immediately",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record that a planned person cannot work, and read the consequence.",
        whyItMatters:
            "This is the original question the product had to answer: what changes if someone calls out? For a long time the answer was nothing visible.",
        requires: [{ kind: "fixture", check: "adequate_segment_exists", describe: "someone planned and counting" }],
        navigate: ["Open a stretch where that person is planned."],
        doThis: ["Click Called out beside them."],
        expectChanges: [
            "They are marked Unavailable, with the reason.",
            "They stop counting toward the requirement.",
            "The room goes short if the requirement is no longer met.",
        ],
        expectUnchanged: ["They are STILL listed as planned.", "Their Coverage was not cancelled for you."],
        invariant: STAFFING_INVARIANTS.PLAN_IS_NOT_AVAILABILITY,
        failSymptoms: ["Nothing changes on screen.", "Their plan disappears.", "Their Coverage is silently withdrawn."],
    }),
    S({
        key: "replace_called_out",
        order: 13,
        title: "Replacing someone who called out",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Fill the gap the call-out opened.",
        whyItMatters:
            "The operator should recover in the same place they discovered the problem.",
        requires: [{ kind: "fixture", check: "staff_candidates_exist", describe: "a replacement to choose" }],
        navigate: ["Stay on the stretch that just went short."],
        doThis: ["Open the chooser and plan a replacement."],
        expectChanges: ["The replacement appears and the room recovers."],
        expectUnchanged: ["The called-out person is still shown truthfully as planned but unavailable."],
        invariant: STAFFING_INVARIANTS.PLAN_IS_NOT_AVAILABILITY,
        failSymptoms: ["The called-out person disappearing once replaced.", "No candidates offered."],
    }),
    S({
        key: "plan_vs_actual",
        order: 14,
        title: "Planned in one room, seen in another",
        disposition: "FIXTURE_NEEDED",
        dispositionReason:
            "Nobody has been observed on the QA date, so there is no actual to compare the plan against. Check someone in through Presence for the QA date to run it.",
        purpose: "Confirm planned place and observed place are shown side by side.",
        whyItMatters:
            "The product must never quietly rewrite the plan to match where somebody actually turned up.",
        requires: [{ kind: "fixture", check: "attendance_observed_on_qa_date", describe: "an observation exists" }],
        navigate: ["Open a stretch where someone is planned."],
        doThis: ["Compare who is planned against who was observed."],
        expectChanges: [],
        expectUnchanged: ["Coverage is not edited to match the observation."],
        invariant: STAFFING_INVARIANTS.PLAN_IS_NOT_ACTUAL,
        failSymptoms: ["Coverage silently moved to the observed room."],
    }),
    S({
        key: "expected_vs_actual_children",
        order: 15,
        title: "Expected children and actual children stay apart",
        disposition: "FIXTURE_NEEDED",
        dispositionReason:
            "No child has been checked in on the QA date. Check one in through Attendance for the QA date to run it.",
        purpose: "Confirm expected and actual child figures are separate.",
        whyItMatters:
            "A child who was expected and did not come, and one who came unexpectedly, are both ordinary. Neither may overwrite the other.",
        requires: [{ kind: "fixture", check: "attendance_observed_on_qa_date", describe: "attendance exists" }],
        navigate: ["Open a stretch with expected children."],
        doThis: ["Compare the expected and actual figures."],
        expectChanges: [],
        expectUnchanged: ["The Assignment stays the baseline; Attendance stays the actual."],
        invariant: STAFFING_INVARIANTS.EXPECTED_IS_NOT_ACTUAL,
        failSymptoms: ["One figure replacing the other.", "Actual shown as zero on a day nothing was observed."],
    }),
    S({
        key: "roster_calendar_relationship",
        order: 16,
        title: "Roster and Calendar are two questions about one day",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Move between the two lenses and open a person's record.",
        whyItMatters:
            "If the two disagree, or if moving between them loses your place, they stop being one product.",
        requires: [{ kind: "fixture", check: "site_exists", describe: "the site resolves" }],
        navigate: ["Click the Roster tab, then back to Calendar.", "Click a person's name."],
        doThis: ["Check the site and date survived.", "Read their record panel."],
        expectChanges: ["The record opens in the usual panel."],
        expectUnchanged: ["Site and date are unchanged by switching lens."],
        invariant: STAFFING_INVARIANTS.ONE_EMPLOYMENT_COUNTS_ONCE,
        failSymptoms: ["The date resetting.", "Staffing figures that contradict the Calendar."],
    }),
    S({
        key: "unknown_discipline",
        order: 17,
        title: "What the system does not know, it says",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Find an unknown state and check how it is drawn.",
        whyItMatters:
            "Unknown rendered as zero, available or adequate is the single most dangerous thing a staffing product can do, because it looks like good news.",
        requires: [{ kind: "fixture", check: "site_exists", describe: "the site resolves" }],
        navigate: ["Look at availability labels in the chooser, and at any room with nobody expected."],
        doThis: ["Read the wording and the colour."],
        expectChanges: [],
        expectUnchanged: [
            "Availability not recorded is neutral, never green.",
            "A room with no demand reads No one expected, not Staffed.",
        ],
        invariant: STAFFING_INVARIANTS.UNKNOWN_IS_NOT_ZERO,
        failSymptoms: ["Green on an unresolved room.", "Unknown availability shown as available.", "A blank where a state should be."],
    }),
    S({
        key: "authorization_scope",
        order: 18,
        title: "You see your own organisation and your chosen site",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Confirm the scope of what is visible.",
        whyItMatters:
            "Hiding a control is not a boundary. The server refuses out-of-scope work; this checks the operator's ordinary view is also correct.",
        requires: [{ kind: "fixture", check: "site_exists", describe: "the site resolves" }],
        navigate: ["Look at the site picker and the rooms listed."],
        doThis: ["Confirm only your organisation's sites and staff appear."],
        expectChanges: [],
        expectUnchanged: ["No other tenant's people or rooms are visible."],
        invariant: STAFFING_INVARIANTS.ASSIGNMENT_IS_THE_BASELINE,
        failSymptoms: ["A site you do not run.", "Staff from another organisation in the chooser."],
    }),
    S({
        key: "performance_usability",
        order: 19,
        title: "It is quick enough to use for real",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Judge the feel of loading, navigating and refreshing.",
        whyItMatters:
            "A screen an operator avoids because it is slow is a screen that does not do its job. No stopwatch needed — your impression is the measurement.",
        requires: [{ kind: "fixture", check: "site_exists", describe: "the site resolves" }],
        navigate: ["Use the Calendar normally for a minute."],
        doThis: ["Note the Calendar load, date navigation, Coverage refresh, chooser opening and call-out refresh."],
        expectChanges: [],
        expectUnchanged: ["Nothing feels blocking."],
        invariant: STAFFING_INVARIANTS.BOUNDARIES_ARE_DERIVED,
        failSymptoms: ["A wait long enough that you doubt the click registered."],
    }),
    S({
        key: "final_operator_verdict",
        order: 20,
        title: "Would you run a day on this?",
        disposition: "HUMAN_WALKTHROUGH",
        purpose: "Record the overall acceptance.",
        whyItMatters:
            "Counts do not decide this. A product can pass every step and still not be one an operator would trust on a Monday morning, and that judgement is the thing being asked for.",
        requires: [],
        navigate: ["Return to this page."],
        doThis: ["Record your verdict, with a note if anything qualifies it."],
        expectChanges: [],
        expectUnchanged: [],
        invariant: STAFFING_INVARIANTS.UNKNOWN_IS_NOT_ZERO,
        failSymptoms: [],
    }),
]);
