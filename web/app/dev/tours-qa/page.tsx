import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { notFound, redirect } from "next/navigation";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { classifyPublicRuntime } from "@/lib/publicAppUrl";
import { parseQaWalkthrough } from "@/lib/qa/parseQaWalkthrough";

import ToursQaWorkbook from "./ToursQaWorkbook";

/**
 * Tours, Public Forms & Communications — the Director's Human QA guide (V2).
 *
 * One document, `docs/platform/qa/tours-forms-comms-human-qa-v2.md`, read per request so an edit to
 * the guide is what the reader sees — no second copy to drift. This page adds only what a person
 * running the QA needs beside it: a status per test (PASS / FAIL / BLOCKED / NOT RUN), notes and an
 * evidence reference, a summary, and an export of the results. Results live in this browser only.
 *
 * Gated exactly like `/dev/real-enrollment-qa`: never on production; on a hosted preview only for a
 * signed-in operator; on the Mac mini (local / agent runtimes, candidate previews) the tailnet already
 * restricts who can reach the port.
 */
const GUIDE = join(process.cwd(), "..", "docs", "platform", "qa", "tours-forms-comms-human-qa-v2.md");
const GUIDE_SOURCE_PATH = "docs/platform/qa/tours-forms-comms-human-qa-v2.md";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tours, Forms & Communications — Human QA" };

export default async function ToursHumanQaPage() {
    const runtime = classifyPublicRuntime();
    if (runtime === "production") {
        notFound();
    }
    if (runtime === "hosted_preview") {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) {
            redirect(ctx.status === 401 ? "/login" : "/unauthorized");
        }
    }

    let markdown: string | null = null;
    try {
        markdown = await readFile(GUIDE, "utf8");
    } catch {
        markdown = null;
    }

    if (!markdown) {
        return (
            <main className="mx-auto max-w-2xl px-6 py-16 text-[14px] text-alloy-midnight/70">
                The QA guide could not be read from this checkout ({GUIDE_SOURCE_PATH}).
            </main>
        );
    }

    // The results a tester records belong to one version of the guide; the export names it.
    const guideVersion = createHash("sha256").update(markdown).digest("hex").slice(0, 12);

    return <ToursQaWorkbook blocks={parseQaWalkthrough(markdown)} guideVersion={guideVersion} sourcePath={GUIDE_SOURCE_PATH} />;
}
