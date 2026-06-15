import { notFound } from "next/navigation";

import OperationalIntakeShellBoardGallery from "./OperationalIntakeShellBoardGallery";

export default function OperationalIntakeShellBoardPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeShellBoardGallery />;
}
