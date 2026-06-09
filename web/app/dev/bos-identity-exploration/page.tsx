import { notFound } from "next/navigation";
import BosIdentityExplorationGallery from "./BosIdentityExplorationGallery";

/** Dev-only BOS identity explorations — brand exercise, not production. */
export default function BosIdentityExplorationPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosIdentityExplorationGallery />;
}
