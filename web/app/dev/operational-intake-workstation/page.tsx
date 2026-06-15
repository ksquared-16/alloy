import { notFound } from "next/navigation";

import OperationalIntakeWorkstationGallery from "./OperationalIntakeWorkstationGallery";

/** Dev-only workstation archetype exploration — not production. */
export default function OperationalIntakeWorkstationPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeWorkstationGallery />;
}
