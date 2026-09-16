import { notFound } from "next/navigation";

import DeveloperPlatformQaWalkthrough from "./DeveloperPlatformQaWalkthrough";

/**
 * Developer Platform human QA walkthrough.
 *
 * Dev-only, following the convention every other surface under `/dev` uses: the
 * page 404s in production rather than relying on a route guard somewhere else.
 * The walkthrough tells an operator to sign in and administer real installations,
 * which is exactly right on a certification server and exactly wrong anywhere else.
 */
export const dynamic = "force-dynamic";

export default function DeveloperPlatformQaPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <DeveloperPlatformQaWalkthrough />;
}
