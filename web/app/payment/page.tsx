import { Suspense } from "react";
import PaymentClient from "./PaymentClient";
import Section from "@/components/Section";

export default function PaymentPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-2xl">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alloy-blue border-t-transparent mb-4"></div>
                            <p className="text-alloy-midnight/70">Loading payment form...</p>
                        </div>
                    </div>
                </Section>
            </div>
        }>
            <PaymentClient />
        </Suspense>
    );
}
