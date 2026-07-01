import { notFound } from "next/navigation";

import ActionWorkspaceIntakeV3MockupGallery from "./ActionWorkspaceIntakeV3MockupGallery";

/** Dev-only V3 intake interaction mockups — design sign-off before production. */
export default function ActionWorkspaceIntakeV3MockupsPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceIntakeV3MockupGallery />;
}
