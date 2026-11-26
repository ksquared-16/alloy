import BankSetupClient from "@/app/bank-setup/[token]/BankSetupClient";

/**
 * THE PAYER'S PAGE — reached from `/a/<token>`, and addressed to one named person.
 *
 * It holds no secrets and resolves nothing: the token goes straight to the public API, which is the
 * only thing that turns it into an org, an account and a payer. A page that resolved the link
 * itself would be a second authority over who a bank account belongs to.
 */
export const dynamic = "force-dynamic";

export default async function BankSetupPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <BankSetupClient token={token} />;
}
