# Ma Kitchens WhatsApp Flow endpoint

The ordering Flow endpoint is served by the existing Next.js/Vercel site at:

`/api/whatsapp-flow`

The endpoint follows Meta's WhatsApp Flow data-channel encryption pattern and verifies Meta's `x-hub-signature-256` request signature before decrypting requests.

## Required Vercel environment variables

- `WHATSAPP_APP_SECRET` — Meta app secret for the Ma Kitchens Automation app.
- `WHATSAPP_FLOW_PRIVATE_KEY` — RSA private key corresponding to the public key registered against the WhatsApp business phone number. Keep this key private and never commit it to Git.
- `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE` — passphrase for the encrypted RSA private key. Leave blank only if the key was deliberately created without a passphrase.

The route converts literal `\n` sequences in `WHATSAPP_FLOW_PRIVATE_KEY` back to line breaks so the key can be stored safely as a Vercel environment variable.

## Current scope

This first endpoint version provides:

- public GET health response;
- Meta request-signature verification;
- RSA-OAEP/SHA-256 decryption of the AES session key;
- AES-128-GCM decryption of incoming Flow data;
- the Meta-required flipped-IV AES-GCM encrypted response;
- encrypted `ping` health-check handling;
- placeholders for `INIT` and `data_exchange` actions.

The meal-selection, quantity, delivery-address, order-review and Control Tower logic will be added in subsequent steps.

## Security

Never store the private key, its passphrase, Meta app secret or permanent WhatsApp access token in the repository, browser-visible code, Google Sheet cells or Flow JSON.
