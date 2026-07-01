import { notFound } from "next/navigation";

import OperationalIntakeFittedShellGallery from "./OperationalIntakeFittedShellGallery";

export default function OperationalIntakeFittedShellPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeFittedShellGallery />;
}
