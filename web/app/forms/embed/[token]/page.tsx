import { FormEmbedClient } from "./FormEmbedClient";

export default async function PublicFormEmbedPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const raw = token ?? "";
    return (
        <main>
            <FormEmbedClient token={raw} />
        </main>
    );
}
