<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15x7w5EDykmO-imRGtRkOWupSvQBSlBca

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## iCloud calendar in production

Appen kan markera kvällsaktiviteter (16:00-21:00) från iCloud-ICS.

### 1) Deploy Supabase Edge Function

Function-kod finns i:
`supabase/functions/icloud-ics-proxy/index.ts`

Kör:

1. `supabase login`
2. `supabase link --project-ref <DITT_PROJECT_REF>`
3. `supabase secrets set ICS_FEED_URL="https://p124-caldav.icloud.com/published/2/..." --project-ref <DITT_PROJECT_REF>`
4. `supabase functions deploy icloud-ics-proxy --project-ref <DITT_PROJECT_REF>`

### 2) Sätt frontend-env för publicerad build

Sätt:

`VITE_ICS_PROXY_URL=https://<DITT_PROJECT_REF>.functions.supabase.co/icloud-ics-proxy`

Denna env-variabel måste finnas i buildmiljön för den publicerade sidan.

### 3) Dev-läge (localhost)

I localhost används automatiskt Vite-proxy `/api/ics`, så ingen extra env krävs.
