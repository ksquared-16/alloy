import { notFound } from "next/navigation";

import OperationalIntakeSilhouetteGallery from "./OperationalIntakeSilhouetteGallery";

/** Dev-only silhouette exploration for Operational Intake Workspace. */
export default function OperationalIntakeSilhouettePage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeSilhouetteGallery />;
}
