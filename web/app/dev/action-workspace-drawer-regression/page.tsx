import { notFound } from "next/navigation";

import ActionWorkspaceDrawerRegressionFixture from "./ActionWorkspaceDrawerRegressionFixture";

/** Dev-only — regression proof for Create Lead workspace drawer positioning. */
export default function ActionWorkspaceDrawerRegressionPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceDrawerRegressionFixture />;
}
