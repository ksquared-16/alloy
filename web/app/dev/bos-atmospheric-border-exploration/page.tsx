import { notFound } from "next/navigation";
import BosAtmosphericBorderGallery from "./BosAtmosphericBorderGallery";

/** Dev-only BOS atmospheric border explorations — design sign-off, not production. */
export default function BosAtmosphericBorderExplorationPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosAtmosphericBorderGallery />;
}
