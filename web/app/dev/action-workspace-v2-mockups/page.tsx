import { notFound } from "next/navigation";
import ActionWorkspaceV2MockupGallery from "./ActionWorkspaceV2MockupGallery";

/** Dev-only high-fidelity mockups for Action Workspace V2 (Concept B+) — design sign-off. */
export default function ActionWorkspaceV2MockupsPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceV2MockupGallery />;
}
