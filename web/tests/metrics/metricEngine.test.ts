import { describe, expect, it } from "vitest";
import { isKnownOipMetricKey, parseOipMetricKeys, listMetricDefinitions, findUnknownMetricKeys } from "@/lib/metrics/registry";
import { parseMetricTimeWindow, resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import {
    computeMedianTimeToScheduleTourHours,
    computeTourConversionRate,
    isSupersededRescheduleRow,
} from "@/lib/metrics/resolvers/eventWindowMetrics";
import { countOverdueOpenTasks } from "@/lib/metrics/resolvers/entitySnapshotMetrics";
import { evaluateDurationKpiHealth, evaluateRateMinKpiHealth, evaluateCountMaxKpiHealth, evaluateKpiForMetric } from "@/lib/metrics/kpiEvaluator";
import { resolveKpiTargetConfig } from "@/lib/metrics/kpiRegistry";
import { computeDeliveryRate, countFailedDeliveryEvents } from "@/lib/metrics/resolvers/commsMetrics";
import { computeFormCompletionRate } from "@/lib/metrics/resolvers/formsMetrics";
import { computeWorkflowFailureRate } from "@/lib/metrics/resolvers/operationalHealthMetrics";

describe("OIP metric registry", () => {
    it("validates known keys", () => {
        expect(isKnownOipMetricKey("enrollment.time_to_schedule_tour")).toBe(true);
        expect(isKnownOipMetricKey("ops.work_overdue_count")).toBe(true);
        expect(isKnownOipMetricKey("org.pipeline.active_in_motion")).toBe(false);
    });

    it("parses comma-separated keys", () => {
        expect(parseOipMetricKeys("enrollment.tour_conversion_rate, ops.work_overdue_count")).toEqual([
            "enrollment.tour_conversion_rate",
            "ops.work_overdue_count",
        ]);
        expect(parseOipMetricKeys("bogus")).toEqual([]);
    });

    it("lists eleven MVP definitions", () => {
        expect(listMetricDefinitions().length).toBeGreaterThanOrEqual(11);
    });

    it("finds unknown keys", () => {
        expect(findUnknownMetricKeys("enrollment.tour_conversion_rate,bogus")).toEqual(["bogus"]);
    });
});

describe("metric time windows", () => {
    it("parses rolling windows", () => {
        expect(parseMetricTimeWindow("rolling_30d")).toBe("rolling_30d");
        expect(parseMetricTimeWindow("invalid")).toBeNull();
    });

    it("computes rolling_30d bounds", () => {
        const now = new Date("2026-06-23T12:00:00.000Z");
        const { windowStart, windowEnd } = resolveMetricTimeWindowBounds("rolling_30d", now);
        expect(windowEnd.toISOString()).toBe(now.toISOString());
        expect(windowStart.toISOString()).toBe("2026-05-24T12:00:00.000Z");
    });
});

describe("computeMedianTimeToScheduleTourHours", () => {
    const opps = [
        { id: "opp-1", created_at: "2026-06-01T00:00:00.000Z" },
        { id: "opp-2", created_at: "2026-06-01T00:00:00.000Z" },
        { id: "opp-3", created_at: "2026-06-01T00:00:00.000Z" },
    ];

    it("computes median hours from first confirmed booking per opportunity", () => {
        const bookings = [
            {
                id: "b1",
                opportunity_id: "opp-1",
                status_key: "confirmed",
                created_at: "2026-06-02T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "b2",
                opportunity_id: "opp-2",
                status_key: "confirmed",
                created_at: "2026-06-04T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "b3",
                opportunity_id: "opp-3",
                status_key: "confirmed",
                created_at: "2026-06-03T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
        ];
        const { medianHours, sampleSize } = computeMedianTimeToScheduleTourHours(opps, bookings);
        expect(sampleSize).toBe(3);
        expect(medianHours).toBe(48);
    });

    it("ignores superseded rescheduled rows", () => {
        const bookings = [
            {
                id: "b-old",
                opportunity_id: "opp-1",
                status_key: "rescheduled",
                created_at: "2026-06-02T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "b-new",
                opportunity_id: "opp-1",
                status_key: "confirmed",
                created_at: "2026-06-05T00:00:00.000Z",
                rescheduled_from_booking_id: "b-old",
            },
        ];
        const { medianHours, sampleSize } = computeMedianTimeToScheduleTourHours([opps[0]!], bookings);
        expect(isSupersededRescheduleRow({ status_key: "rescheduled" })).toBe(true);
        expect(sampleSize).toBe(1);
        expect(medianHours).toBe(96);
    });

    it("returns null when no eligible bookings", () => {
        const { medianHours, sampleSize } = computeMedianTimeToScheduleTourHours(opps, []);
        expect(medianHours).toBeNull();
        expect(sampleSize).toBe(0);
    });
});

describe("computeTourConversionRate", () => {
    it("computes completed / scheduled excluding rescheduled rows", () => {
        const bookings = [
            {
                id: "1",
                opportunity_id: "o1",
                status_key: "completed",
                created_at: "2026-06-01T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "2",
                opportunity_id: "o2",
                status_key: "confirmed",
                created_at: "2026-06-01T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "3",
                opportunity_id: "o3",
                status_key: "rescheduled",
                created_at: "2026-06-01T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
            {
                id: "4",
                opportunity_id: "o4",
                status_key: "no_show",
                created_at: "2026-06-01T00:00:00.000Z",
                rescheduled_from_booking_id: null,
            },
        ];
        const { rate, completed, scheduled } = computeTourConversionRate(bookings);
        expect(scheduled).toBe(3);
        expect(completed).toBe(1);
        expect(rate).toBeCloseTo(1 / 3);
    });

    it("returns null rate when denominator is zero", () => {
        const { rate, scheduled } = computeTourConversionRate([]);
        expect(scheduled).toBe(0);
        expect(rate).toBeNull();
    });
});

describe("countOverdueOpenTasks", () => {
    it("counts only open tasks past due_at", () => {
        const now = new Date("2026-06-23T12:00:00.000Z");
        const tasks = [
            { id: "1", status: "open", due_at: "2026-06-20T00:00:00.000Z", entity_id: "e1" },
            { id: "2", status: "open", due_at: "2026-06-25T00:00:00.000Z", entity_id: "e1" },
            { id: "3", status: "completed", due_at: "2026-06-20T00:00:00.000Z", entity_id: "e1" },
        ];
        expect(countOverdueOpenTasks(tasks, now)).toBe(1);
    });
});

describe("comms metrics pure functions", () => {
    it("computes delivery rate", () => {
        const messages = [
            { id: "m1", direction: "outbound", sent_at: "2026-06-01T00:00:00Z", replied_at: null, created_at: "" },
            { id: "m2", direction: "outbound", sent_at: "2026-06-01T00:00:00Z", replied_at: null, created_at: "" },
        ];
        const { rate, delivered } = computeDeliveryRate(messages, new Set(["m1"]));
        expect(delivered).toBe(1);
        expect(rate).toBe(0.5);
    });

    it("counts failed deliveries", () => {
        expect(
            countFailedDeliveryEvents([
                { event_type: "failed", message_id: "a", occurred_at: "" },
                { event_type: "delivered", message_id: "b", occurred_at: "" },
            ])
        ).toBe(1);
    });
});

describe("forms metrics pure functions", () => {
    it("computes form completion rate", () => {
        const { rate, submitted, created } = computeFormCompletionRate([
            { id: "1", status: "submitted", created_at: "", submitted_at: "" },
            { id: "2", status: "draft", created_at: "", submitted_at: null },
        ]);
        expect(created).toBe(2);
        expect(submitted).toBe(1);
        expect(rate).toBe(0.5);
    });
});

describe("workflow failure rate", () => {
    it("computes failed / terminal", () => {
        const { rate, failed } = computeWorkflowFailureRate([
            { status: "failed", started_at: "" },
            { status: "completed", started_at: "" },
            { status: "pending", started_at: "" },
        ]);
        expect(failed).toBe(1);
        expect(rate).toBe(0.5);
    });
});

describe("KPI health evaluation", () => {
    const target = resolveKpiTargetConfig("enrollment.time_to_schedule_tour");

    it("healthy at 48h", () => {
        expect(evaluateDurationKpiHealth(48, target)).toBe("healthy");
    });

    it("warning between 48h and 72h", () => {
        expect(evaluateDurationKpiHealth(60, target)).toBe("warning");
    });

    it("critical above 72h", () => {
        expect(evaluateDurationKpiHealth(80, target)).toBe("critical");
    });

    it("unknown when no observation", () => {
        expect(evaluateDurationKpiHealth(null, target)).toBe("unknown");
    });

    it("supports org metadata overlay for Phase 2", () => {
        const custom = resolveKpiTargetConfig("enrollment.time_to_schedule_tour", {
            kpi_targets: {
                "enrollment.time_to_schedule_tour": {
                    target_max_hours: 24,
                    healthy_max_hours: 24,
                    warning_max_hours: 36,
                },
            },
        });
        expect(custom.targetMaxHours).toBe(24);
        expect(evaluateDurationKpiHealth(30, custom)).toBe("warning");
    });

    it("evaluates tour conversion KPI via rate_min", () => {
        const target = resolveKpiTargetConfig("enrollment.tour_conversion_rate");
        expect(evaluateRateMinKpiHealth(0.55, target)).toBe("healthy");
        expect(evaluateRateMinKpiHealth(0.2, target)).toBe("critical");
    });

    it("evaluates overdue work KPI via count_max", () => {
        const target = resolveKpiTargetConfig("ops.work_overdue_count");
        expect(evaluateCountMaxKpiHealth(3, target)).toBe("healthy");
        expect(evaluateCountMaxKpiHealth(15, target)).toBe("critical");
    });

    it("evaluateKpiForMetric attaches status to metric", () => {
        const kpi = evaluateKpiForMetric({
            kpiKey: "comms.delivery_rate",
            metric: {
                key: "comms.delivery_rate",
                label: "Delivery rate",
                format: "percent",
                value: 0.96,
                formattedValue: "96.0%",
                window: "rolling_30d",
                windowStartIso: "",
                windowEndIso: "",
                computedAtIso: "",
                sources: [],
                resolveMode: "live",
            },
        });
        expect(kpi.status).toBe("healthy");
    });
});
