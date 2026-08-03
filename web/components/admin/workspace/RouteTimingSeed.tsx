import {
    ROUTE_TIMING_SCRIPT_ID,
    routeTimingEnabled,
    type RouteTimingMarks,
} from "@/lib/perf/routeTimingDiagnostic";

/**
 * Emits the layout's server spans into the document so a cold-load harness can read them.
 *
 * A script tag rather than a header because the layout runs while the response is already
 * streaming — headers are long gone by then. Renders nothing when the flag is off.
 */
export default function RouteTimingSeed({ marks }: { marks: RouteTimingMarks | null }) {
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
