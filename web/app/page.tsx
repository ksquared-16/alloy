import Link from "next/link";
import Image from "next/image";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import ServiceCard from "@/components/ServiceCard";
import Accordion from "@/components/Accordion";
import GhlEmbed from "@/components/GhlEmbed";
import BrandValueCard from "@/components/BrandValueCard";
import { SERVICES } from "@/lib/services";

export default function Home() {
  const howItWorksSteps = [
    {
      number: "1",
      title: "Tell us what you need — nothing more",
      description: "Share your home size and schedule. No endless back-and-forth — just enough detail for us to handle the rest.",
    },
    {
      number: "2",
      title: "Coordinated by people, backed by tech",
      description: "Real humans review every job. Technology speeds things up — people make the call and keep things on track.",
    },
    {
      number: "3",
      title: "Confirmed by text. Covered by Alloy.",
      description: "We text the details. You confirm. And we stay involved — if something's not right, we make it right.",
    },
  ];

  const whyAlloyIsDifferent = [
    {
      title: "Trust First",
      description: "Every pro is vetted, insured, and background-checked. We stand behind every job. If something's not right, we fix it.",
      accentColor: "juniper" as const,
    },
    {
      title: "Dead-Simple",
      description: "No apps. No endless forms. No confusing booking systems. Tell us what you need, confirm by text, and you're done.",
      accentColor: "blue" as const,
    },
    {
      title: "Human + Smart",
      description: "Real people who know Bend and care about getting it right, supported by technology that makes coordination faster and more reliable.",
      accentColor: "ember" as const,
    },
    {
      title: "Fair for Everyone",
      description: "Customers pay fair prices. Pros keep more of what they earn. Win-win is the only way this works.",
      accentColor: "juniper" as const,
    },
  ];

  const faqs = [
    {
      question: "How does Alloy work?",
      answer:
        "You tell us what you need, we coordinate with a vetted local pro, and you confirm by text. No apps, no complicated booking. We handle the rest.",
    },
    {
      question: "Are the professionals insured?",
      answer:
        "Yes. Every pro is insured, background-checked, and verified before they can accept jobs. We stand behind every job.",
    },
    {
      question: "What areas do you serve?",
      answer:
        "We're focused on Bend, Oregon right now. We'll expand to surrounding areas as we grow.",
    },
    {
      question: "How do I pay?",
      answer:
        "We securely save your payment method and only charge it after the work is done — no deposits, no surprises.",
    },
    {
      question: "Can I schedule recurring cleanings?",
      answer:
        "Set up weekly, bi-weekly, or monthly cleanings. More frequent service may qualify for preferred pricing — just let us know your schedule when you request a quote.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-alloy-stone">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-10 md:py-8">
          <div className="relative h-[340px] md:h-[400px] lg:h-[460px] overflow-hidden rounded-xl shadow-lg">
            {/* Background Image */}
        <Image
              src="/hero/cleaning-hero.jpg"
              alt="Clean modern home interior"
              fill
          priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-alloy-midnight/60 via-alloy-midnight/25 to-transparent" />

            {/* Content Overlay */}
            <div className="relative z-10 flex h-full items-center px-6 md:px-10 lg:px-12">
              <div className="max-w-xl space-y-4 md:space-y-6">
                <p className="text-sm font-medium text-alloy-juniper uppercase tracking-wide">
                  Born in Bend. Built for trust.
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-white leading-tight">
                  Trusted home services, without the runaround.
          </h1>
                <p className="text-lg text-white/90">
                  Alloy handles everything — scheduling, confirmation, and follow-up — using trusted local professionals in Bend. One point of contact. Real accountability.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/services/cleaning?open=1#quote-form">
                    <PrimaryButton className="w-full sm:w-auto">
                      Get a cleaning quote
                    </PrimaryButton>
                  </Link>
                  <Link href="#how-it-works">
                    <SecondaryButton className="!bg-white/20 backdrop-blur-md !border !border-white/50 !text-white hover:!bg-white/30 w-full sm:w-auto">
                      See how Alloy works
                    </SecondaryButton>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Alloy Makes It Easy */}
      <Section id="how-it-works" className="py-10 bg-alloy-stone">
        <h2 className="text-3xl font-bold text-alloy-pine text-center mb-12">
          How Alloy Makes It Easy
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {howItWorksSteps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="w-16 h-16 bg-alloy-juniper text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-md">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold text-alloy-pine mb-2">
                {step.title}
              </h3>
              <p className="text-alloy-midnight/80">{step.description}</p>
            </div>
          ))}
        </div>
        <div className="max-w-3xl mx-auto mt-12 text-center">
          <div className="bg-white/80 rounded-lg p-6 border border-alloy-stone/30">
            <p className="text-lg text-alloy-midnight font-medium">
              Alloy isn't a lead marketplace. We're your point of contact before, during, and after the job.
            </p>
          </div>
        </div>
      </Section>

      {/* Current Services */}
      <Section className="py-20">
        <h2 className="text-3xl font-bold text-alloy-pine text-center mb-4">
          Services we offer
        </h2>
        <p className="text-center text-alloy-midnight/80 mb-12">
          Home cleaning is available now. More services coming soon.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </Section>

      {/* Why Alloy Is Different */}
      <Section className="py-20 bg-white">
        <h2 className="text-3xl font-bold text-alloy-pine text-center mb-4">
          Why Alloy Is Different
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {whyAlloyIsDifferent.map((value) => (
            <BrandValueCard
              key={value.title}
              title={value.title}
              description={value.description}
              accentColor={value.accentColor}
              icon={
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section className="py-20 bg-alloy-pine/5">
        <h2 className="text-3xl font-bold text-alloy-pine text-center mb-12">
          What our customers say
        </h2>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-md p-6 border border-alloy-stone/50">
            <p className="text-alloy-midnight/80 mb-4">
              "Finally, a cleaner I can trust. The whole process was simple, and the work was exactly what I needed."
            </p>
            <p className="font-semibold text-alloy-pine">
              — Sarah M., Bend
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-20 bg-white">
        <h2 className="text-3xl font-bold text-alloy-midnight text-center mb-12">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <Accordion key={faq.question} title={faq.question}>
              <p>{faq.answer}</p>
            </Accordion>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-12 md:py-16">
        <div className="bg-alloy-blue rounded-lg p-6 md:p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-lg mb-6 opacity-90">
            Get a quote. We'll text you to confirm details. No pressure, no hassle.
          </p>
          <div className="max-w-3xl mx-auto">
            <GhlEmbed
              src="https://api.leadconnectorhq.com/widget/form/JBZiHlFyWKli2GnSwivI"
              title="Lead Form"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
