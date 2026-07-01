import { notFound } from "next/navigation";
import ActionWorkspaceBosCloudGallery from "./ActionWorkspaceBosCloudGallery";

export default function ActionWorkspaceBosCloudPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <ActionWorkspaceBosCloudGallery />;
}
