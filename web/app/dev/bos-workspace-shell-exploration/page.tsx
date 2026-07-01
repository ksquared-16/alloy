import { notFound } from "next/navigation";
import BosWorkspaceShellGallery from "./BosWorkspaceShellGallery";

/** Dev-only BOS workspace shell explorations — outer container design, not production. */
export default function BosWorkspaceShellExplorationPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosWorkspaceShellGallery />;
}
