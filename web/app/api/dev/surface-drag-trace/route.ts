import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/**
 * Dev-only sink for Surface Builder drag traces.
 *
 * Operator QA kept coming back as "your scripted gesture works, mine does not",
 * and the lane could not see the difference because the recording lived in the
 * operator's own browser. This writes the trace somewhere the lane can read, so
 * the human gesture and the automated one can be diffed against each other
 * rather than argued about.
 *
 * Refused outside development: it writes files to disk and exists only to make a
 * local debugging session inspectable.
 */
export const dynamic = "force-dynamic";

const DIR = "/tmp/alloy-surface-drag-traces";

export async function POST(request: Request) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ ok: false, error: "development_only" }, { status: 404 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const label = typeof (body as { label?: unknown })?.label === "string"
        ? String((body as { label: string }).label).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40)
        : "drag";
    await mkdir(DIR, { recursive: true });
    const file = join(DIR, `${stamp}-${label}.json`);
    await writeFile(file, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true, file });
}
