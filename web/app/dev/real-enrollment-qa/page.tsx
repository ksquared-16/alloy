import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { notFound } from "next/navigation";

import { classifyPublicRuntime, isHostedRuntime } from "@/lib/publicAppUrl";
import { parseQaWalkthrough } from "@/lib/qa/parseQaWalkthrough";

import H1SourceCard from "./H1SourceCard";
import ParticipantJourneyCard from "./ParticipantJourneyCard";
import QaNotesPad from "./QaNotesPad";
import QaWalkthroughReader from "./QaWalkthroughReader";
import { readH1Readiness } from "./readH1Readiness";
import { readRealEnrollmentQaJourney } from "./readQaJourney";

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

export const metadata = { title: "Enrollment V0.5 — human QA" };

export default async function RealEnrollmentQaPage() {
    /*
     * GATED ON WHERE THIS IS RUNNING, NOT ON HOW IT WAS BUILT.
     *
     * The other `/dev` surfaces refuse when `NODE_ENV === "production"`, which reads as "not a
     * customer environment" only while every non-customer environment happens to run `next dev`.
     * That stopped being true: the QA server is deliberately a PRODUCTION BUILD, because dev mode's
     * Fast Refresh was reloading the page under the person doing manual QA. So the one document the
     * certification is run from 404ed on the only server it is meant to be read beside.
     *
     * `classifyPublicRuntime` already draws the line this page actually needs — a Vercel production
     * or preview deployment is hosted and has real recipients; a managed agent slot or a developer
     * machine is not — and it is the same classifier the public-origin rules trust for a decision
     * with far more at stake. Reusing it beats inventing a QA flag that would then need its own
     * doctrine about when it is safe to set.
     */
    if (isHostedRuntime(classifyPublicRuntime())) {
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

    const [journey, h1] = await Promise.all([readRealEnrollmentQaJourney(), readH1Readiness()]);

    return (
        <>
            {/*
             * The one thing the document cannot carry: a journey that is still live when it is read.
             * It sits above the script because Track A's first instruction is to open it. The notes
             * dock is fixed to the viewport instead, so it does not scroll away mid-walkthrough.
             */}
            <div className="mx-auto max-w-3xl px-6 pt-10">
                <H1SourceCard readiness={h1} />
                <details className="my-8 rounded-2xl border border-alloy-midnight/12 bg-alloy-midnight/[0.02] p-5">
                    <summary className="cursor-pointer text-[14px] font-semibold text-alloy-midnight">
                        H4 · the participant journey — locked until H1 to H3 are done by hand
                    </summary>
                    <p className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/70">
                        This journey is real and still open. It is kept here because H4 will use it, not because it
                        is where to begin: reaching it through H1, H2 and H3 is the point of the reset. Opening it
                        changes nothing.
                    </p>
                    <div className="mt-2">
                {journey.ok ? (
                    <ParticipantJourneyCard journey={journey.journey} />
                ) : (
                    <section className="my-8 rounded-2xl border border-alloy-ember/25 bg-alloy-ember/[0.06] p-5">
                        <h2 className="text-[15px] font-semibold text-alloy-ember">The QA journey could not be read</h2>
                        <p className="mt-1 text-[13px] leading-relaxed text-alloy-ember/90">{journey.reason}</p>
                        <p className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/70">
                            Track B below does not depend on this and can still be read.
                        </p>
                    </section>
                )}
                    </div>
                </details>
            </div>
            {/* Fixed to the viewport, so it is reachable from anywhere in the script rather than only
                from the top of it. Rendered outside the column for that reason. */}
            <QaNotesPad />
            <QaWalkthroughReader blocks={parseQaWalkthrough(markdown)} />
        </>
    );
}
