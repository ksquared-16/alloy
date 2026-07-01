import { notFound } from "next/navigation";

import OperationalIntakeEnvironmentGallery from "./OperationalIntakeEnvironmentGallery";

/** Dev-only environmental object exploration — not production. */
export default function OperationalIntakeEnvironmentPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeEnvironmentGallery />;
}
