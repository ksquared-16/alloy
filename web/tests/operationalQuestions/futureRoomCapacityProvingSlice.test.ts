import { describe, expect, it } from "vitest";
import {
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
    getOperationalQuestion,
    listOperationalQuestions,
} from "@/lib/operationalQuestions/catalog";
import { buildFutureRoomCapacityActions } from "@/lib/operationalQuestions/actions";
import { findFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/answerFutureRoomCapacity";
import { buildMeasurementHealthAttentionEvent } from "@/lib/operationalQuestions/proactiveBoundary";
import {
    defaultEffectiveDateForRelativeMonth,
    parseFutureRoomCapacityBosIntent,
} from "@/lib/operationalQuestions/bos/parseFutureRoomCapacityIntent";
import { routeCommandSurface } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import {
    assertMeasurementSemanticParity,
    snapshotMeasurementParity,
} from "./measurementParity";
import type { OiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcMeasurements";

describe("Operational Question catalog", () => {
    it("exposes Future Room Capacity as Measure strategy", () => {
        const q = getOperationalQuestion(FUTURE_ROOM_CAPACITY_QUESTION_KEY);
        expect(q).not.toBeNull();
        expect(q!.answer_strategy).toBe("measure");
        expect(q!.category).toBe("Capacity");
        expect(q!.question.toLowerCase()).toContain("seats");
        expect(listOperationalQuestions().length).toBeGreaterThanOrEqual(1);
        expect(listOperationalQuestions().some((q) => q.key === FUTURE_ROOM_CAPACITY_QUESTION_KEY)).toBe(true);
    });

    it("unknown question returns null", () => {
        expect(getOperationalQuestion("not_a_question")).toBeNull();
    });
});

describe("Future Room Capacity actions", () => {
    const question = getOperationalQuestion(FUTURE_ROOM_CAPACITY_QUESTION_KEY)!;

    it("configuration_required offers start measuring", () => {
        const actions = buildFutureRoomCapacityActions({
            question,
            status: "configuration_required",
            measurementId: null,
            roomId: null,
        });
        expect(actions.map((a) => a.key)).toContain("start_measuring");
    });

    it("answered exposes shared action keys", () => {
        const actions = buildFutureRoomCapacityActions({
            question,
            status: "answered",
            measurementId: "m1",
            roomId: "r1",
            hasNewerVersion: true,
        });
        const keys = actions.map((a) => a.key);
        expect(keys).toEqual(
            expect.arrayContaining([
                "view_room",
                "review_history",
                "change_goal",
                "manage_measurement",
                "explain_answer",
                "use_newer_source_version",
            ]),
        );
    });
});

describe("findFutureRoomCapacityMeasurement", () => {
    it("prefers question_key match", () => {
        const rows = [
            {
                id: "a",
                key: "org.future_capacity.other",
                name: "Other",
                status: "active",
                question_key: null,
            },
            {
                id: "b",
                key: "org.future_capacity.frc",
                name: "FRC",
                status: "active",
                question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            },
        ] as unknown as OiOrgCalcMeasurement[];
        expect(findFutureRoomCapacityMeasurement(rows)?.id).toBe("b");
    });
});

describe("BOS Future Room Capacity intent", () => {
    it("parses seat questions", () => {
        const i = parseFutureRoomCapacityBosIntent("How many seats will Bears have next month?");
        expect(i.kind).toBe("answer");
        if (i.kind === "answer") {
            expect(i.room_hint?.toLowerCase()).toContain("bears");
            expect(i.relative_month).toBe(true);
        }
    });

    it("parses configure intent", () => {
        expect(parseFutureRoomCapacityBosIntent("Help me start measuring future room capacity").kind).toBe(
            "configure",
        );
    });

    it("parses goal change", () => {
        const i = parseFutureRoomCapacityBosIntent("Change the minimum goal to 18 seats");
        expect(i.kind).toBe("change_goal");
        if (i.kind === "change_goal") expect(i.goal_seats).toBe(18);
    });

    it("parses capacity meaning for configure", () => {
        const i = parseFutureRoomCapacityBosIntent(
            "Lowest of physical and licensed seats with a goal of 16 seats",
        );
        expect(i.kind).toBe("configure");
        if (i.kind === "configure") {
            expect(i.product_type_id).toBe("capacity_lowest_physical_licensed");
            expect(i.target_min_seats).toBe(16);
        }
    });

    it("parses history and newer definition intents", () => {
        expect(parseFutureRoomCapacityBosIntent("Show me recent history for future room capacity").kind).toBe(
            "review_history",
        );
        expect(parseFutureRoomCapacityBosIntent("Use the newer definition").kind).toBe(
            "use_newer_source_version",
        );
    });

    it("ignores unrelated", () => {
        expect(parseFutureRoomCapacityBosIntent("text the Mitchell family").kind).toBe("none");
    });

    it("default relative month is ISO date", () => {
        expect(defaultEffectiveDateForRelativeMonth(new Date("2026-07-28T00:00:00Z"))).toMatch(
            /^\d{4}-\d{2}-\d{2}$/,
        );
    });
});

describe("command surface routes operational questions", () => {
    it("routes capacity NL to operational_question before task assist", () => {
        const r = routeCommandSurface("What is the future capacity for Giraffe on 2026-08-15?");
        expect(r.route).toBe("operational_question");
        expect(r.operationalQuestionIntent?.kind).toBe("answer");
    });
});

describe("proactive health boundary", () => {
    it("emits event only for below_goal", () => {
        expect(
            buildMeasurementHealthAttentionEvent({
                measurementId: "m1",
                health: "on_goal",
            }),
        ).toBeNull();
        const ev = buildMeasurementHealthAttentionEvent({
            measurementId: "m1",
            health: "below_goal",
            value: 14,
            goalValue: 18,
            roomLabel: "Sunflower",
        });
        expect(ev?.eligible_for_bos_surfacing).toBe(true);
        expect(ev?.question_key).toBe(FUTURE_ROOM_CAPACITY_QUESTION_KEY);
    });
});

describe("measurement semantic parity helper", () => {
    it("treats entry_point as non-semantic", () => {
        const base = {
            id: "1",
            key: "org.future_capacity.x",
            name: "FRC",
            description: null,
            status: "active" as const,
            source: {
                type: "organization_calculation" as const,
                calculation_id: "c1",
                calculation_version_id: "v1",
                calculation_name: "Cap",
                version_number: 1,
            },
            subject_grain: "room" as const,
            unit: "seats" as const,
            output_type: "numeric" as const,
            target: { kind: "count_min" as const, value: 18 },
            question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            created_at: "",
            updated_at: "",
            created_by: null,
        };
        const ui = snapshotMeasurementParity({ ...base, entry_point: "ui" });
        const bos = snapshotMeasurementParity({ ...base, entry_point: "bos" });
        assertMeasurementSemanticParity(ui, bos);
    });
});
