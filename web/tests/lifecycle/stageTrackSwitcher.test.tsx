/**
 * The four child-track stages were unreachable in the product.
 *
 * `activeTrackKey` existed, `stagesForTrack` filtered on it, and the load path reset it — but nothing
 * rendered a control, so the rail was permanently pinned to `tracks[0]` (Family) and Waitlist,
 * Enrolling, Enrolled and Closed/Withdrawn could not be opened at all. Overview counted 8 from the
 * same authority and was right; the rail counted 4 of a filtered list and did not say so.
 *
 * Rendered to string — no DOM in this suite — so these assert structure and copy. The handler's
 * selection behaviour is asserted at source, and the browser proof is reported separately.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BusinessProcessStagesListColumn from "@/components/adminV2/settings/businessProcess/BusinessProcessStagesListColumn";
import { stagesForTrack } from "@/lib/businessProcesses/businessProcessConfigReader";
import { activeStagesForProcess, type LifecycleBuilderProcessRecord, type LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const BOARD = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx"),
    "utf8",
);

const TRACKS = [
    { key: "family_track", label: "Family Track" },
    { key: "child_track", label: "Child Track" },
];

/** The certification tenant's shape: four family stages, four child stages. */
const STAGES: LifecycleBuilderStageRecord[] = [
    ["lead", "New Lead", "family_track"],
    ["tour", "Tour", "family_track"],
    ["decision", "Placement / Decision", "family_track"],
    ["closed", "Closed", "family_track"],
    ["waitlist", "Waitlist", "child_track"],
    ["enrolling", "Enrolling", "child_track"],
    ["enrolled", "Enrolled", "child_track"],
    ["closed_withdrawn", "Closed / Withdrawn", "child_track"],
].map(([key, label, track_key], i) => ({
    id: `s-${key}`, key, label, track_key, sort_order: i, is_active: true,
}) as LifecycleBuilderStageRecord);

const PROCESS = {
    id: "p1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity",
    sort_order: 0, is_active: true, stages: STAGES,
} as LifecycleBuilderProcessRecord;

const render = (trackKey: string) =>
    renderToStaticMarkup(
        <BusinessProcessStagesListColumn
            stages={stagesForTrack(PROCESS, trackKey)}
            activeStageKey=""
            onSelect={() => {}}
            onAddStageClick={() => {}}
            tracks={TRACKS}
            activeTrackKey={trackKey}
            onSelectTrack={() => {}}
        />,
    );

describe("the rail can reach both tracks", () => {
    it("renders a switcher for every configured track", () => {
        const html = render("family_track");
        expect(html).toContain('data-testid="business-process-track-switcher"');
        expect(html).toContain('data-testid="business-process-track-family_track"');
        expect(html).toContain('data-testid="business-process-track-child_track"');
        expect(html).toContain("Family Track");
        expect(html).toContain("Child Track");
    });

    it("lists the four child stages — including Enrolling — when the child track is active", () => {
        const html = render("child_track");
        for (const label of ["Waitlist", "Enrolling", "Enrolled", "Closed / Withdrawn"]) {
            expect(html, `${label} missing from the child track`).toContain(label);
        }
        // And only those: a family stage appearing here would mean the filter stopped working.
        expect(html).not.toContain("New Lead");
    });

    it("lists the four family stages when the family track is active", () => {
        const html = render("family_track");
        for (const label of ["New Lead", "Tour", "Placement / Decision"]) expect(html).toContain(label);
        expect(html).not.toContain("Enrolling");
    });
});

describe("the count says what it counted", () => {
    it("names the track rather than claiming the whole process", () => {
        // The exact defect: "4 configured" beside an Overview reading "8 stages", both truthful,
        // neither reconcilable by the operator.
        expect(render("family_track")).toContain("4 stages in Family Track");
        expect(render("child_track")).toContain("4 stages in Child Track");
    });

    it("still reads plainly when a process has no tracks to choose between", () => {
        const html = renderToStaticMarkup(
            <BusinessProcessStagesListColumn
                stages={STAGES.slice(0, 2)}
                activeStageKey=""
                onSelect={() => {}}
                onAddStageClick={() => {}}
            />,
        );
        expect(html).toContain("2 configured");
        expect(html).not.toContain('data-testid="business-process-track-switcher"');
    });

    it("agrees with the process-level count when both tracks are added up", () => {
        // One authority, two views. The views must reconcile by addition, not disagree.
        expect(activeStagesForProcess(PROCESS)).toHaveLength(8);
        expect(stagesForTrack(PROCESS, "family_track")).toHaveLength(4);
        expect(stagesForTrack(PROCESS, "child_track")).toHaveLength(4);
    });
});

describe("switching tracks moves the selection with it", () => {
    it("opens a stage in the newly chosen track when the current one is not in it", () => {
        expect(BOARD).toContain("const selectTrack = useCallback(");
        expect(BOARD).toContain("if (next.some((st) => st.key === stageKeyRef.current)) return;");
        expect(BOARD).toContain("void selectStage(next[0]!);");
    });

    it("changes nothing when the track is already active", () => {
        expect(BOARD).toContain("if (!key || key === activeTrackKey) return;");
    });

    it("writes no configuration — looking is not authoring", () => {
        const at = BOARD.indexOf("const selectTrack = useCallback(");
        const body = BOARD.slice(at, BOARD.indexOf("\n    const ", at + 10));
        expect(body).not.toContain("fetch(");
        expect(body).not.toContain("action:");
    });

    it("is actually wired into the rail", () => {
        expect(BOARD).toContain("tracks={processTracks?.tracks}");
        expect(BOARD).toContain("activeTrackKey={activeTrackKey}");
        expect(BOARD).toContain("onSelectTrack={selectTrack}");
    });
});
