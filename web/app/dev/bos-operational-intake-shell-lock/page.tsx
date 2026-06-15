import { notFound } from "next/navigation";

import BosOperationalIntakeShellLockGallery from "./BosOperationalIntakeShellLockGallery";

export default function BosOperationalIntakeShellLockPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosOperationalIntakeShellLockGallery />;
}
