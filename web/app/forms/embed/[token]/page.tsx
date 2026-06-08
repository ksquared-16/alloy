import { FormEmbedClient } from "./FormEmbedClient";

export default async function PublicFormEmbedPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ preview?: string }>;
}) {
    const { token } = await params;
    const sp = await searchParams;
    const raw = token ?? "";
    const showPreviewBanner = sp.preview === "1";

    return <FormEmbedClient token={raw} showPreviewBanner={showPreviewBanner} />;
}
