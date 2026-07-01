import { notFound } from "next/navigation";
import BosShapeExplorationGallery from "./BosShapeExplorationGallery";

/** Dev-only BOS shape identity explorations — brand exercise, not production. */
export default function BosShapeExplorationPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosShapeExplorationGallery />;
}
