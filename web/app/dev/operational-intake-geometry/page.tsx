import { notFound } from "next/navigation";

import OperationalIntakeGeometryGallery from "./OperationalIntakeGeometryGallery";

export default function OperationalIntakeGeometryPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeGeometryGallery />;
}
