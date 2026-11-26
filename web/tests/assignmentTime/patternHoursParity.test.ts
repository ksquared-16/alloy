/**
 * THE BACKFILL PARSER MUST AGREE WITH THE RUNTIME PARSER, EXACTLY.
 *
 * `readPatternDefaultHours` is the one current definition of "what hours does this
 * pattern default to". The backfill materializes Assignment time from the SAME
 * metadata through a SQL mirror of it, `pattern_default_hours_compat`.
 *
 * If the two ever disagree, an Assignment's hours change on the day the migration
 * runs — silently, and in the direction nobody reviewed. That is the one outcome a
 * backfill must never produce, so this drives BOTH implementations over the same
 * specimens and compares them, rather than testing either alone.
 *
 * The specimens deliberately include the boring-looking edges, because those are
 * where two parsers drift: a single-digit hour, seconds, whitespace, a reversed
 * range, and each of the three accepted shapes.
 */
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

/** Each specimen is metadata as it might really sit on a schedule_pattern row. */
const SPECIMENS: { name: string; metadata: Record<string, unknown> | null }[] = [
    { name: "empty object — the shape every cert pattern actually has", metadata: {} },
    { name: "null metadata", metadata: null },
    { name: "nested default_hours", metadata: { default_hours: { arrive: "08:00", depart: "16:30" } } },
    { name: "camel defaultHours", metadata: { defaultHours: { arrive: "09:00", depart: "17:30" } } },
    { name: "v3 hours opens_at/closes_at", metadata: { hours: { opens_at: "07:30", closes_at: "18:00" } } },
    { name: "v3 hours camel", metadata: { hours: { opensAt: "07:00", closesAt: "19:00" } } },
    { name: "flat defaultArrive/defaultDepart", metadata: { defaultArrive: "08:15", defaultDepart: "16:45" } },
    { name: "precedence: nested wins over v3", metadata: { default_hours: { arrive: "08:00", depart: "16:30" }, hours: { opens_at: "06:00", closes_at: "20:00" } } },
    { name: "precedence: v3 wins over flat", metadata: { hours: { opens_at: "07:30", closes_at: "18:00" }, defaultArrive: "06:00", defaultDepart: "20:00" } },
    { name: "single-digit hour is NOT a time", metadata: { default_hours: { arrive: "8:00", depart: "16:30" } } },
    { name: "seconds are NOT accepted", metadata: { default_hours: { arrive: "08:00:00", depart: "16:30:00" } } },
    { name: "24:00 is out of range", metadata: { default_hours: { arrive: "24:00", depart: "24:30" } } },
    { name: "reversed range rejected whole", metadata: { default_hours: { arrive: "16:30", depart: "08:00" } } },
    { name: "equal times rejected", metadata: { default_hours: { arrive: "08:00", depart: "08:00" } } },
    { name: "whitespace is trimmed", metadata: { default_hours: { arrive: " 08:00 ", depart: " 16:30 " } } },
    { name: "half a range is no range", metadata: { default_hours: { arrive: "08:00" } } },
    { name: "non-object default_hours", metadata: { default_hours: "08:00-16:30" } },
    { name: "falls through a bad nested shape to flat", metadata: { default_hours: { arrive: "nope" }, defaultArrive: "08:30", defaultDepart: "16:00" } },
];

describe.runIf(LIVE)("pattern default hours — SQL backfill parser vs runtime parser", () => {
    it("agrees with readPatternDefaultHours on every specimen", async () => {
        const disagreements: string[] = [];

        for (const s of SPECIMENS) {
            const ts = readPatternDefaultHours(s.metadata);

            const { data, error } = await db.rpc("pattern_default_hours_compat", {
                p_metadata: s.metadata,
            });
            expect(error, `${s.name}: rpc failed`).toBeNull();

            const rows = (data ?? []) as { arrive: string | null; depart: string | null }[];
            const sql = rows.length > 0 && rows[0].arrive
                ? { arrive: String(rows[0].arrive).slice(0, 5), depart: String(rows[0].depart).slice(0, 5) }
                : null;

            const same =
                (ts === null && sql === null) ||
                (ts !== null && sql !== null && ts.arrive === sql.arrive && ts.depart === sql.depart);

            if (!same) {
                disagreements.push(
                    `${s.name}: runtime=${JSON.stringify(ts)} backfill=${JSON.stringify(sql)}`
                );
            }
        }

        // Reported together: one drifting specimen usually means several, and fixing
        // them one failure at a time hides the pattern.
        expect(disagreements, `parser drift:\n${disagreements.join("\n")}`).toEqual([]);
    });

    it("the specimen set actually exercises both outcomes", async () => {
        // Guards the test above from passing because everything returned null.
        const results = SPECIMENS.map((s) => readPatternDefaultHours(s.metadata));
        expect(results.filter((r) => r !== null).length).toBeGreaterThanOrEqual(7);
        expect(results.filter((r) => r === null).length).toBeGreaterThanOrEqual(7);
    });
});
