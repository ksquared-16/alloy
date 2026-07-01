import { notFound } from "next/navigation";

import ActionWorkspaceIntakeMockupGallery from "./ActionWorkspaceIntakeMockupGallery";

/** Dev-only intake layout mockups — design sign-off before production implementation. */
export default function ActionWorkspaceIntakeMockupsPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceIntakeMockupGallery />;
}
