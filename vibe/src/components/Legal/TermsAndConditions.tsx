import React from "react";

const sections = [
  {
    title: "1. Who may use Zippo",
    body: [
      "Zippo is intended for adults aged 18 and over. By using the platform, you confirm that you are at least 18 and that the information you provide is accurate.",
      "Do not create an account, access adult-oriented features, or use another person's account if you are under 18. Do not misrepresent your age or identity."
    ]
  },
  {
    title: "2. What Zippo is and is not",
    body: [
      "Zippo provides social discovery, communication, creator features, and event-related services. It is not an escort agency, prostitution marketplace, or a service for arranging paid sexual encounters.",
      "You are responsible for how you use Zippo and for your interactions and arrangements with other users. Using Zippo does not make the platform a party to private agreements between users, and Zippo does not endorse or guarantee any user's claims, intentions, services, or conduct."
    ]
  },
  {
    title: "3. Prohibited use: sexual services and exploitation",
    body: [
      "You must not use Zippo to advertise, solicit, arrange, facilitate, or profit from prostitution, escort services, paid sexual acts, or other commercial sexual services. Do not use profiles, chats, livestreams, rooms, events, payment features, or links to promote or coordinate those activities.",
      "Human trafficking, sexual exploitation, coercion, blackmail, grooming, non-consensual sexual content, and any sexual activity involving a minor are strictly prohibited. Never request, create, upload, share, or threaten to share intimate images without the depicted person's clear consent.",
      "Zippo may remove content, restrict features, suspend or terminate accounts, withhold access to platform features where permitted, and report suspected illegal activity to appropriate authorities when necessary."
    ]
  },
  {
    title: "4. Respect, consent, and user conduct",
    body: [
      "Treat other users respectfully. Harassment, threats, stalking, hate-based abuse, impersonation, scams, spam, doxxing, and attempts to bypass platform safety controls are prohibited.",
      "Consent must be freely given, specific, informed, and reversible. A user's profile, messages, presence on Zippo, purchase, tip, or participation in a call does not imply consent to sexual activity or any other interaction.",
      "Do not pressure users to move conversations off-platform, disclose private information, send money, or meet in person. Report suspicious or abusive behaviour through available reporting or support channels."
    ]
  },
  {
    title: "5. In-person meetings and personal safety",
    body: [
      "If you choose to meet someone, that decision is yours. Verify information independently, meet in a public place, tell someone you trust where you are going, arrange your own transport, and leave if you feel unsafe.",
      "Do not rely on Zippo to conduct background checks or guarantee that another user is who they claim to be. Zippo cannot guarantee the safety, identity, intentions, or conduct of any user, online or offline."
    ]
  },
  {
    title: "6. Profiles, messages, and user content",
    body: [
      "You are responsible for the content you publish or send and must have the rights and permissions needed to use it. Do not upload another person's images, videos, personal information, or other material without lawful authority and appropriate consent.",
      "You grant Zippo permission to host, store, display, and process your content as reasonably necessary to operate, secure, and improve the services, subject to applicable law and any separate privacy terms. You retain ownership of content you own.",
      "Do not use the platform to distribute unlawful content, malware, misleading promotions, or content that infringes another person's rights."
    ]
  },
  {
    title: "7. Credits, payments, creators, and events",
    body: [
      "Credits, diamonds, tips, subscriptions, creator features, tickets, and payouts are subject to the prices, eligibility rules, and feature-specific terms shown when you use or purchase them. Unless expressly stated otherwise, virtual credits are platform-use units, not bank deposits, legal tender, or an investment.",
      "Do not use payment, tipping, creator, or event features to pay for or arrange prohibited sexual services, launder funds, defraud users, or evade platform rules. Do not make payments outside the platform in response to suspicious requests.",
      "Event organisers are responsible for providing accurate event details, obtaining required permissions, and honouring valid tickets. Refunds, cancellations, and creator payouts are handled according to the applicable feature terms and law."
    ]
  },
  {
    title: "8. Moderation and account restrictions",
    body: [
      "Zippo may review reports and take reasonable action to protect users, enforce these Terms, comply with law, or protect the platform. Actions may include removing content, limiting functionality, suspending or closing accounts, or preserving relevant information where legally permitted.",
      "Do not create replacement accounts to evade a suspension or other enforcement action. You may contact support to ask about an account restriction, but reinstatement is not guaranteed."
    ]
  },
  {
    title: "9. Availability and disclaimers",
    body: [
      "We work to keep Zippo available and secure, but the service may be interrupted, changed, or discontinued. Features may vary by location and may be subject to additional terms.",
      "To the extent permitted by law, Zippo is provided on an 'as available' basis. We do not guarantee uninterrupted service, user accuracy, compatibility, or any particular outcome from using the platform."
    ]
  },
  {
    title: "10. Limitation of responsibility",
    body: [
      "To the extent permitted by applicable law, Zippo is not responsible for users' independent actions, user-generated content, private agreements, off-platform communications, or meetings between users. You are responsible for exercising judgement and taking reasonable precautions.",
      "Nothing in these Terms excludes or limits liability where doing so would be unlawful, including any rights or protections that cannot legally be waived."
    ]
  },
  {
    title: "11. Changes and contact",
    body: [
      "We may update these Terms as the service changes or to reflect legal, security, or operational requirements. The updated version will be posted here with a revised effective date. Continued use after an update means you accept the revised Terms to the extent permitted by law.",
      "For questions, reports, or concerns about these Terms, contact Zippo through the support contact or reporting tools made available on the platform."
    ]
  }
];

const TermsAndConditions: React.FC = () => (
  <main className="min-h-[60vh] bg-[var(--az-bg-primary)] text-[var(--az-text-primary)] px-4 py-10 md:px-8 md:py-16">
    <article className="mx-auto max-w-4xl">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--az-accent-primary)]">Zippo · Legal</p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">Terms and Conditions</h1>
      <p className="mb-2 text-sm text-[var(--az-text-muted)]">Effective date: 11 October 2026</p>
      <p className="mb-8 max-w-3xl leading-7 text-[var(--az-text-secondary)]">
        These Terms apply when you access or use Zippo. Please read them carefully. By creating an account or using the platform, you agree to follow these Terms and applicable law.
      </p>

      <section className="mb-8 rounded-2xl border border-[var(--az-border)] bg-[#221014] p-5 md:p-6">
        <h2 className="mb-2 text-lg font-bold">Important: personal responsibility and prohibited services</h2>
        <p className="leading-7 text-[var(--az-text-secondary)]">
          Zippo is for social discovery, communication, creators, and events. It must not be used to advertise or arrange prostitution, escorting, paid sexual services, trafficking, exploitation, or any sexual activity involving minors. You are responsible for your own conduct, content, decisions, and interactions with other users.
        </p>
      </section>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-lg font-semibold md:text-xl">{section.title}</h2>
            <div className="space-y-3">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="leading-7 text-[var(--az-text-secondary)]">{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-[var(--az-border)] pt-5 text-xs leading-6 text-[var(--az-text-muted)]">
        These Terms are a general platform policy and are not a substitute for advice from a qualified lawyer. If a provision is unenforceable under applicable law, the remaining provisions continue to apply to the extent permitted by law.
      </p>
    </article>
  </main>
);

export default TermsAndConditions;
