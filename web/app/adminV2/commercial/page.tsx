import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Consolidated: the Commercial hub is superseded by the single tabbed workspace.
export default function CommercialPage() {
    redirect("/settings/commercial");
}
