<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1RDnOPVzuuQRDDmG5GaZJTPzENYCFHChW

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Cloudflare Pages

This repository is preconfigured for a Cloudflare Pages deployment on the custom domain `spottle.shibeprime.com` using the included `wrangler.toml`.

1. Build the site locally: `npm run build`
2. Deploy to Pages (requires authentication with `wrangler login`): `npm run deploy`
3. In Cloudflare, point `spottle.shibeprime.com` at the Pages project and add the domain in the Pages dashboard.

The generated static assets live in `dist/`, matching the `pages_build_output_dir` in `wrangler.toml`. The `npm run deploy` command wraps `wrangler pages deploy dist --project-name spottle --branch production` to avoid the `wrangler deploy` (Workers) command that fails on Pages projects.
