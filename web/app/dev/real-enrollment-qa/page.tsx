import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { notFound } from "next/navigation";

import { classifyPublicRuntime, isHostedRuntime } from "@/lib/publicAppUrl";
import { parseQaWalkthrough } from "@/lib/qa/parseQaWalkthrough";

import HumanQaGuide from "./HumanQaGuide";
import QaNotesPad from "./QaNotesPad";
import QaWalkthroughReader from "./QaWalkthroughReader";

/**
 * The Real Enrollment human QA page.
 *
 * ## Simple on top, everything else behind a disclosure
 *
 * This page used to open with the whole lifecycle: eight gates, every expectation, the implementation
 * history, three candidate source documents and an argument for which one to use. The person using it
 * is testing a product. So the top of the page is one step, and the ledger, the gate states, the known
 * gaps and the engineering walkthrough sit behind **Technical QA details**, collapsed.
 *
 * ## No preselected anything
 *
 * There is deliberately no "use this document" or "open Dax's journey" control. H1 exists to find out
 * whether Alloy can accept the operator's OWN paperwork; handing over a document Alloy already knows
 * about would answer a different question. The guide points at Processing and stops.
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

// Read per request so editing the document changes what the reader sees, with no second copy to drift.
export const dynamic = "force-dynamic";

export const metadata = { title: "Real Enrollment QA" };

export default async function RealEnrollmentQaPage() {
    /*
     * GATED ON WHERE THIS IS RUNNING, NOT ON HOW IT WAS BUILT. The QA server is deliberately a
     * production build, so a `NODE_ENV` check would 404 the one page it is meant to serve.
     */
    if (isHostedRuntime(classifyPublicRuntime())) {
        notFound();
    }

    let markdown: string | null = null;
    try {
        markdown = await readFile(WALKTHROUGH, "utf8");
    } catch {
        markdown = null;
    }

    return (
        <>
            <main className="mx-auto max-w-2xl px-6 pb-28 pt-12">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-alloy-bend-pine">
                    Real Enrollment QA
                </p>
                <HumanQaGuide />

                <details className="mt-12 rounded-2xl border border-alloy-midnight/12 bg-alloy-midnight/[0.02] p-4">
                    <summary className="cursor-pointer text-[13px] font-semibold text-alloy-midnight/70">
                        Technical QA details
                    </summary>
                    <p className="mt-2 text-[12px] leading-relaxed text-alloy-midnight/60">
                        You do not need any of this to do the QA. It is here so the engineering record and the
                        human record stay in one place.
                    </p>
                    <div className="mt-4 text-[13px]">
                        {markdown ? (
                            <QaWalkthroughReader blocks={parseQaWalkthrough(markdown)} embedded />
                        ) : (
                            <p className="text-alloy-midnight/60">The technical appendix could not be read from this checkout.</p>
                        )}
                    </div>
                </details>
            </main>
            {/* Fixed to the viewport, so it is reachable from any step rather than only from the top. */}
            <QaNotesPad />
        </>
    );
}
