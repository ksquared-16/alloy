/**
 * A documentation address that does not exist.
 *
 * An unknown slug never reaches here: `dynamicParams = false` turns that into a real 404 at routing
 * time, which is the honest status and the one the rest of Alloy returns. What reaches here is the
 * narrower case the page still guards — a slug that IS published but whose document could not be
 * loaded from the embedded artifact. That reader is trying to read something, so this answers with
 * the shelf rather than a wall: the same masthead, the same rail, and the way back to Integrations.
 */

import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { DocumentationShell } from "@/app/adminV2/settings/organization/integrations/documentation/DocumentationShell";
import { DOCUMENTATION_BASE_PATH } from "@/lib/developerDocs/documentationRoutes";

export default function DocumentationNotFound() {
    return (
        <DocumentationShell activeSlug={null}>
            <section data-testid="documentation-not-found" className="max-w-[42rem]">
                <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-alloy-stone/70 text-alloy-midnight/45"
                    aria-hidden
                >
                    <FileQuestion className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <h1 className="mt-2.5 text-[22px] font-semibold tracking-tight text-alloy-midnight">
                    That document is not here
                </h1>
                <p className="mt-2 text-[13.5px] leading-[1.7] text-alloy-midnight/75">
                    The address you followed does not match anything Alloy publishes. It may be a stale
                    link, or a document that is no longer part of the external documentation. Everything
                    Alloy does publish is listed in the rail on the left.
                </p>
                <Link
                    href={DOCUMENTATION_BASE_PATH}
                    className="mt-3.5 inline-flex items-center rounded-lg bg-[#007d68] px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-[#00694f]"
                    data-testid="documentation-not-found-home"
                >
                    Start at the documentation home
                </Link>
            </section>
        </DocumentationShell>
    );
}
