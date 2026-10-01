import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { notFound, redirect } from "next/navigation";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { classifyPublicRuntime } from "@/lib/publicAppUrl";
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
     * WHERE IT IS RUNNING DECIDES, AND ON STAGING ALSO WHO IS LOOKING.
     *
     * Human QA needs a stable deployed build — a development server reloads the page under the reader
     * whenever a file is saved, which makes it unusable for judging a product. So this now renders on
     * deployed staging. It must never render on the customer production site, and on staging it must
     * never render for participant or customer traffic, which has no operator session at all.
     *
     * Three outcomes, deliberately not two:
     *   production      → not found, always. There is no flag that opens it.
     *   hosted_preview  → an authenticated operator only; everyone else is sent to sign in.
     *   local / agent   → as before. The tailnet already restricts who can reach the port.
     */
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
