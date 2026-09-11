import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { notFound } from "next/navigation";

import { parseQaWalkthrough } from "@/lib/qa/parseQaWalkthrough";

import QaWalkthroughReader from "./QaWalkthroughReader";

/**
 * The Real Enrollment QA walkthrough, readable beside the product.
 *
 * A QA script that exists only in the repository is not usable as a manual QA artifact — the person
 * running the certification cannot open it. This serves the SAME file the certification owns, so
 * editing the document changes what the operator reads and no second copy can drift.
 *
 * ONE document, named here. There is no path parameter, no directory listing and no way to ask this
 * route for any other file: the only argument it takes is the one on the next line.
 */
const WALKTHROUGH = join(
    process.cwd(),
    "..",
    "docs",
    "audits",
    "active",
    "real-enrollment-certification-v1",
    "KELLY-QA-WALKTHROUGH.md",
);

// The document is read per request so an edit shows up on refresh — this is a QA reader, not a
// published page, and staleness here would be worse than the read.
export const dynamic = "force-dynamic";

export const metadata = { title: "Real Enrollment QA walkthrough" };

export default async function RealEnrollmentQaPage() {
    // Same gate every other /dev surface uses.
    if (process.env.NODE_ENV === "production") {
        notFound();
    }

    let markdown: string;
    try {
        markdown = await readFile(WALKTHROUGH, "utf8");
    } catch {
        // Say which document is missing rather than rendering an empty page.
        return (
            <main className="mx-auto max-w-3xl px-6 py-16">
                <h1 className="text-xl font-semibold text-alloy-midnight">QA walkthrough unavailable</h1>
                <p className="mt-3 text-sm text-alloy-midnight/70">
                    The certification document could not be read from this checkout.
                </p>
            </main>
        );
    }

    return <QaWalkthroughReader blocks={parseQaWalkthrough(markdown)} />;
}
