import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | Ma Kitchens",
  description: "Learn how Ma Kitchens collects, uses, stores and protects personal information.",
};

const emailLink = (
  <a className="underline decoration-ink/30 underline-offset-2 transition hover:text-clay" href="mailto:admin@makitchens.com.au">
    admin@makitchens.com.au
  </a>
);

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16 md:py-20 lg:px-10 lg:py-24">
      <header className="border-b border-ink/15 pb-8 sm:pb-10">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-clay sm:text-sm">Legal</p>
        <h1 className="font-serif text-[3.25rem] leading-[0.92] tracking-[-0.025em] text-ink sm:text-6xl lg:text-7xl">
          Privacy Policy
        </h1>
        <p className="mt-5 text-sm text-ink/55 sm:mt-6">Last updated: 11 August 2026</p>
      </header>

      <div className="mt-8 max-w-3xl space-y-10 text-base leading-7 text-ink/75 sm:mt-10 sm:text-lg sm:leading-8">
        <div className="space-y-5">
          <p>Ma Kitchens respects your privacy and is committed to handling personal information responsibly and transparently.</p>
          <p>This Privacy Policy explains how Ma Kitchens collects, uses, stores and discloses personal information when you interact with us, including through our website, social media pages, online forms and other communications.</p>
        </div>

        <PolicySection title="1. PERSONAL INFORMATION WE COLLECT">
          <p>We may collect personal information that you provide to us, including:</p>
          <ul>
            <li>your name;</li><li>email address;</li><li>telephone number;</li><li>suburb, postcode or general location;</li>
            <li>information about your interest in Ma Kitchens, including whether you are interested in becoming a home cook, purchasing home-cooked food or otherwise participating in our services;</li>
            <li>information you provide through enquiry forms, surveys or applications;</li><li>communications you have with us; and</li><li>any other information you voluntarily provide.</li>
          </ul>
          <p>We generally do not seek to collect sensitive information unless it is reasonably necessary for our activities and permitted by law.</p>
        </PolicySection>

        <PolicySection title="2. HOW WE COLLECT PERSONAL INFORMATION">
          <p>We may collect personal information when you:</p>
          <ul>
            <li>submit a form on the Ma Kitchens website;</li><li>submit an enquiry or lead form through Facebook, Instagram or another advertising or social media platform;</li>
            <li>communicate with us by email, telephone, WhatsApp or social media;</li><li>join or interact with a Ma Kitchens WhatsApp channel or community;</li>
            <li>participate in a survey, expression of interest, promotion or other Ma Kitchens activity; or</li><li>otherwise provide information directly to us.</li>
          </ul>
          <p>We may also receive information from service providers and platforms that you use to interact with Ma Kitchens, including Meta platforms such as Facebook and Instagram.</p>
        </PolicySection>

        <PolicySection title="3. WHY WE COLLECT AND USE PERSONAL INFORMATION">
          <p>We may collect and use personal information to:</p>
          <ul>
            <li>respond to enquiries;</li><li>contact people who have expressed an interest in Ma Kitchens;</li><li>assess and manage expressions of interest from prospective home cooks and other participants;</li>
            <li>provide information about Ma Kitchens, our services and opportunities;</li><li>communicate updates and information that may be relevant to you;</li><li>operate, administer and improve our website and services;</li>
            <li>understand interest in and engagement with Ma Kitchens;</li><li>conduct marketing and advertising activities where permitted; and</li><li>comply with applicable legal and regulatory requirements.</li>
          </ul>
          <p>Where appropriate, you may choose not to provide certain personal information. However, this may limit our ability to respond to your enquiry or provide a particular service.</p>
        </PolicySection>

        <PolicySection title="4. MARKETING COMMUNICATIONS">
          <p>If you have consented to receive marketing communications, or where otherwise permitted by law, we may contact you about Ma Kitchens services, opportunities, updates or related information.</p>
          <p>You can ask us to stop sending you marketing communications at any time by using an unsubscribe facility provided in the communication, where available, or by contacting us at {emailLink}.</p>
          <p>We will process opt-out requests as soon as reasonably practicable.</p>
        </PolicySection>

        <PolicySection title="5. DISCLOSURE OF PERSONAL INFORMATION">
          <p>We do not sell your personal information.</p><p>We may disclose personal information where reasonably necessary to operate Ma Kitchens, including to service providers that assist us with:</p>
          <ul><li>website hosting and infrastructure;</li><li>email and communications;</li><li>online forms and lead management;</li><li>analytics;</li><li>advertising and social media;</li><li>information technology and data storage; and</li><li>professional, regulatory or legal services.</li></ul>
          <p>These providers may include platforms such as Meta, Vercel, Resend and other technology providers we use from time to time.</p><p>We may also disclose information where required or authorised by law.</p>
        </PolicySection>

        <PolicySection title="6. OVERSEAS PROCESSING AND DISCLOSURE">
          <p>Some third-party services used by Ma Kitchens may store or process information outside Australia.</p><p>As a result, personal information may be disclosed to or processed by service providers located overseas. The countries involved may vary depending on the infrastructure and service providers being used.</p><p>Where applicable, Ma Kitchens takes reasonable steps to use reputable service providers and to handle personal information consistently with applicable Australian privacy requirements.</p>
        </PolicySection>

        <PolicySection title="7. WEBSITE ANALYTICS AND ONLINE TECHNOLOGIES">
          <p>Our website may use analytics and similar technologies to help us understand how visitors use the website, such as pages visited, general location, device or browser information and website traffic patterns.</p><p>We may also use advertising or social media technologies in connection with campaigns operated through platforms such as Facebook and Instagram.</p><p>Where these technologies collect personal information, we aim to provide appropriate information about their use and handle that information consistently with this Privacy Policy.</p>
        </PolicySection>

        <PolicySection title="8. STORAGE AND SECURITY">
          <p>We take reasonable steps to protect personal information from misuse, interference, loss and unauthorised access, modification or disclosure.</p><p>Personal information may be stored electronically using systems and service providers used by Ma Kitchens.</p><p>We retain personal information for as long as reasonably necessary for the purposes for which it was collected, for legitimate business purposes, or as required by law. Where information is no longer required, we will take reasonable steps to delete or de-identify it where appropriate.</p>
        </PolicySection>

        <PolicySection title="9. ACCESSING OR CORRECTING YOUR PERSONAL INFORMATION">
          <p>You may contact us if you would like to request access to personal information we hold about you or ask us to correct information that you believe is inaccurate, out of date, incomplete, irrelevant or misleading.</p><p>We may need to verify your identity before processing a request.</p><p>Requests can be sent to {emailLink}.</p>
        </PolicySection>

        <PolicySection title="10. PRIVACY QUESTIONS AND COMPLAINTS">
          <p>If you have a question or concern about how Ma Kitchens has handled your personal information, please contact us at:</p><p>Email: {emailLink}</p><p>We will consider privacy enquiries and complaints and aim to respond within a reasonable period.</p><p>If applicable, you may also have the right to make a complaint to the Office of the Australian Information Commissioner.</p>
        </PolicySection>

        <PolicySection title="11. CHANGES TO THIS PRIVACY POLICY">
          <p>We may update this Privacy Policy from time to time to reflect changes to our operations, technology, services or legal obligations.</p><p>The current version will be published on this page with the date it was last updated.</p>
        </PolicySection>

        <PolicySection title="CONTACT">
          <p>For privacy enquiries, please contact:</p><address className="not-italic">Ma Kitchens<br />Email: {emailLink}</address>
        </PolicySection>
      </div>
    </article>
  );
}

function PolicySection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="space-y-5">
      <h2 className="font-serif text-2xl font-medium leading-tight text-ink sm:text-3xl">{title}</h2>
      <div className="space-y-5 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_li]:pl-1">{children}</div>
    </section>
  );
}
