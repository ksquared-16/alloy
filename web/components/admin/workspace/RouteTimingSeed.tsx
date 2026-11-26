import {
    ROUTE_TIMING_SCRIPT_ID,
    routeTimingEnabled,
    type RouteTimingMarks,
} from "@/lib/perf/routeTimingDiagnostic";

/**
 * Emits the route's collected server spans into the document so a cold-load harness can read them.
 *
 * A script tag rather than a header because these boundaries run while the response is already
 * streaming — headers are long gone by then. Renders nothing when the flag is off.
 *
 * Slice 12A: rendered by the PAGE segment, not the layout. Both boundaries write into one
 * request-scoped collector and the page — which finishes last and owns the compose — emits the
 * single payload, so two authorities can never disagree about the same route. The marks are a
 * PARTIAL by design: a boundary that did not run contributes no field, and its absence is honest
 * where a zero would read as a measurement.
 */
export default function RouteTimingSeed({ marks }: { marks: Partial<RouteTimingMarks> | null }) {
    if (!routeTimingEnabled() || !marks) return null;
    return (
        <script
            id={ROUTE_TIMING_SCRIPT_ID}
            type="application/json"
            // Durations and one epoch — no subject, operator, or tenant data.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(marks) }}
        />
    );
}
