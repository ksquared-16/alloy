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

    return (
        <main>
            {showPreviewBanner ? (
                <div
                    role="status"
                    className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950"
                >
                    <span className="font-semibold">Previewing public form</span>
                    {" — "}
                    Same experience recipients see when they open your embed link (opened from Alloy admin in a new tab).
                    Submissions here create real records in this environment unless you are on a sandbox.
                </div>
            ) : null}
            <FormEmbedClient token={raw} />
        </main>
    );
}
