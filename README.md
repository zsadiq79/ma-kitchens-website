# Ma Kitchens Website

A modern minimalist 3-page marketing website for Ma Kitchens, built with Next.js App Router and Tailwind CSS.

## Pages

- Home
- About
- Contact

## Getting started

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Deployment

The project is ready to deploy on Vercel using the default Next.js settings.

### Contact form email

The contact form sends enquiries to `admin@makitchens.com.au` through the Resend email API. Create a
[Resend](https://resend.com) account, verify a sending domain, and add these environment variables to
the Vercel project for Production (and Preview if required):

- `RESEND_API_KEY`: a Resend API key with permission to send email.
- `CONTACT_FROM_EMAIL`: a sender on the verified domain, including an optional display name (for
  example, `Ma Kitchens Website <website@makitchens.com.au>`).

Redeploy the site after adding or changing environment variables. No secrets should be committed to
the repository.
