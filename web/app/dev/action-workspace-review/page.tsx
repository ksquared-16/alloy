import { notFound } from "next/navigation";
import ActionWorkspaceReviewGallery from "./ActionWorkspaceReviewGallery";

/** Dev-only fixture gallery for Action Workspace UX screenshots (Playwright). */
export default function ActionWorkspaceReviewPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceReviewGallery />;
}
