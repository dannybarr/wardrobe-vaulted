# Wardrobe Vault

I am migrating an existing working Vite + React application called Wardrobe.

Please first inspect the uploaded project completely before changing anything. Preserve its current visual identity, interactions, structure and existing functionality unless a change is explicitly required below.

PRODUCT CONTEXT

Wardrobe is an AI-powered private digital wardrobe.

The core user experience is:

- A user uploads clothing photos or an outfit photo from their camera roll.

- AI identifies garments and creates crisp, clean individual product cut-outs.

- Those pieces are saved to a private digital wardrobe.

- Users can add brand, value and occasion metadata.

- Users can filter wardrobe items by category, brand and occasion.

- Users can build and save outfits.

- Users can add items to a wishlist from product links or uploaded images.

- AI “on model” generation is optional and deliberately triggered by the user, not automatically performed. This is important for speed and controlling AI cost.

- The landing page explains the camera-roll-to-wardrobe concept and has a “Craft your vault” CTA.

The uploaded project contains my real personal wardrobe, including the current data JSON files and images. This must remain intact and become my protected founder profile. Do not delete, overwrite, flatten or reset any existing wardrobe data.

GOAL

Turn this into a hosted, secure multi-user product that can launch as a paid founding beta, while preserving the existing application experience and my personal wardrobe.

TECHNICAL DIRECTION

Use Lovable’s hosted stack and Supabase where appropriate:

1. Authentication

- Add sign-up, sign-in, password reset and account settings.

- Support email/password initially; include Google sign-in if straightforward.

- Create a founder account migration path for the existing uploaded wardrobe data.

- Every user must only be able to see and edit their own data.

2. Database and security

- Move data currently held in local JSON files and browser local storage into Supabase.

- Create a sensible relational schema for:

  - profiles

  - wardrobes

  - garments

  - garment images

  - outfits and outfit garments

  - wishlist items

  - model/reference profiles

  - AI jobs

  - subscriptions, usage credits and billing events

- Add strict Supabase Row Level Security policies to all user data.

- Do not make garment images, source images or reference/model photos public by default.

3. Private file storage

- Store originals, clean cut-outs, thumbnails and generated-on-model images in private Supabase Storage buckets.

- Use signed URLs for image access.

- Preserve references to the existing imported images during migration.

- Optimise image loading without compromising product-image quality.

4. AI architecture

- Never expose an OpenAI API key in the browser.

- Store all secrets in server-side environment variables.

- Use secure server functions/API routes for image processing.

- Create durable AI job states: queued, processing, complete and failed.

- Add retries, user-facing progress, clear failure messages and idempotency so users are not charged twice on accidental retries.

- Keep “Generate on model” user-triggered only.

- Add server-side usage/credit checks before expensive AI actions.

5. Billing

- Add Stripe subscriptions and Stripe Checkout.

- Add a billing portal.

- Create a simple founding-beta entitlement structure:

  - a paid access subscription

  - a private wardrobe allowance

  - a monthly allowance of AI import credits

  - separately metered on-model generation credits

  - optional credit top-ups

- Enforce limits server-side, not just in the interface.

- Implement Stripe webhooks securely.

6. Existing data protection

- Before migration, create a clear import/seed process for my current personal wardrobe.

- Give this data the owner account “founder” status or a migration mechanism so I can claim it on first sign-in.

- Add a separate demo mode/data set for investor or public demonstrations. Never use my real account as a public demo.

- Add export and account deletion capabilities for users.

7. Launch essentials

- Add basic onboarding: create account → explain privacy → optional model photo → first upload → review extracted pieces → wardrobe.

- Add consent and clear language around AI image processing.

- Add placeholders/pages for privacy policy, terms and support contact.

- Add error monitoring hooks, basic product analytics events and admin-ready usage logging.

- Keep the current landing page and CTA, adapting the CTA into real account onboarding.

DESIGN RULES

- Maintain the current polished, editorial / retro-web visual system.

- Do not replace it with generic SaaS styling.

- Keep the landing page as a one-screen experience.

- Keep the wardrobe itself clean, premium and fashion-first.

- Keep the existing item fields, filters, wishlist and outfit behaviours.

- Avoid adding unrelated social features, feeds or marketplace functionality at this stage.

WORKING METHOD

1. Inspect the existing code and report the proposed migration plan before making destructive changes.

2. Build the secure multi-user data foundation first.

3. Preserve and migrate the existing founder wardrobe.

4. Implement authentication, storage and AI job handling.

5. Add payments and credit controls.

6. Test the full flow with a separate test account.

7. Provide clear deployment, environment-variable and launch instructions.

The immediate priority is a high-quality private alpha that preserves my wardrobe and allows invited users to sign up, upload pieces and have their wardrobes saved securely.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://wardrobe-vaulted.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c51cccd-dd8a-4dcc-ada1-310b3aacb1a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
