import { notFound } from "next/navigation";

import OperationalIntakeWorkspaceGallery from "./OperationalIntakeWorkspaceGallery";

/** Dev-only Operational Intake Workspace exploration — three-column mockups. */
export default function OperationalIntakeWorkspacePage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeWorkspaceGallery />;
}
