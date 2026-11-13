# Floro AI

Floro AI is a Vite + Express chat app with IndexedDB conversation storage, Ollama model management, OpenAI-compatible chat, and optional Supabase accounts and cloud sync.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The Express API runs on `127.0.0.1:3001` by default. Keep the API server private. Remote/mobile use requires explicitly binding the backend to a reachable interface (`HOST=0.0.0.0`), firewalling it, and using a TLS/authenticated reverse proxy plus a strict `APP_ORIGINS` allow list. Do not expose the unauthenticated development API directly to the internet.

## Ollama and models

1. Install Ollama on the machine that will host the models and start its service.
2. Open **Model Store** or **My Models** from the sidebar. The default Ollama API endpoint is `http://localhost:11434`; it can be changed in the model screen or Settings.
3. Check that the selected server is reachable. The app reads installed model names/sizes from Ollama `/api/tags`, shows model metadata from `/api/show`, streams progress from `/api/pull`, removes models through `/api/delete`, and sends chat requests to `/api/chat`.
4. Choose an installed model in the chat selector. That model/provider selection is saved per conversation. “Set default” in My Models applies to new conversations.

Ollama stores model weights in its own configured directory. Floro AI cannot change this path through the Ollama API; configure `OLLAMA_MODELS` in the Ollama host environment if a different directory is needed, then restart Ollama. Model size/RAM labels in the store are estimates, not guarantees. A browser cannot report free system RAM. Mobile devices cannot run Ollama through this web app; configure a reachable remote Ollama server instead. A remote server must allow the Floro backend to reach it; use HTTPS outside a trusted private network.

The curated store links to the official Ollama library pages. The catalog is not a live complete mirror of ollama.com. Ollama handles tag resolution and actual download sizes.

## AI provider configuration

Set cloud credentials only in the backend `.env`:

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
```

The key is never sent to or stored in browser code. Use the chat model selector to choose OpenAI or an installed Ollama model. Automatic mode prefers configured OpenAI and otherwise uses an available Ollama model. If neither is configured, the chat reports the provider error.

## Automatic live web search

For questions that appear to need current information (such as latest news, current prices, weather, recent releases, or events), Floro AI can search the web and provide source links. Device internet status alone is not a search provider; configure Brave Search in the backend:

1. Create a Brave Search API key in the Brave Search API dashboard.
2. In the backend `.env`, set `BRAVE_API_KEY` and `WEB_SEARCH_ENABLED=true`.
3. Restart the backend so it loads the new environment settings. The chat toolbar shows whether web search is ready.

The key stays on the backend and is never sent to the browser. Only the latest user message is sent to Brave Search; the full chat history is not sent to the search service. Returned excerpts and source URLs are added to the selected model's request, and the response includes source links. When the device is offline, search is not attempted. If search is not configured or fails, the app indicates that live information could not be verified instead of claiming the search succeeded.

## Supabase accounts, Google OAuth, and sync

No Supabase project or credentials were present in this workspace. To enable account features:

1. Create a Supabase project.
2. In the Supabase SQL editor or CLI, apply `supabase/migrations/202611130001_floro_account_sync.sql`. It creates profile, project, conversation, message, preference tables, a profile trigger, RLS policies, and a public avatar bucket with per-user upload policies.
3. Set in `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

   The anon/publishable key is intended for browser clients and is protected by RLS. Never put a service-role key in the frontend.
4. In Supabase **Authentication → URL Configuration**, allow the exact callback URLs you use, including `http://localhost:5173/`, `http://localhost:4173/`, and your production HTTPS URL.
5. In **Authentication → Providers → Google**, enable Google and add the OAuth Client ID and Client Secret.
6. In Google Cloud Console, configure an OAuth client of type **Web application**. Add this redirect URI to the Google client:

   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

   Copy the client ID and secret into Supabase's Google provider settings. Google account selection is requested by the app.
7. Restart Vite after changing `.env`, then open Account. Email sign-up requires Supabase email confirmation if enabled for the project.

The app uses Supabase PKCE, persisted sessions, email/password flows, Google OAuth, password reset, and profile creation. Cloud sync is opt-in. The first sign-in asks before uploading existing local conversations; conflicting conversation IDs are preserved as separate copies. Offline data remains in IndexedDB and pending sync is retried when connectivity returns. Cloud data is merged without overwriting existing local conversations.

### OAuth on Android/iOS/Electron

This checkout currently has no Capacitor or Electron native projects. A web callback does not automatically deep-link into a native package. For native builds, register a URI scheme such as `floroai://auth/callback` in the platform project, set `VITE_AUTH_REDIRECT_URL` to that exact URI, add the URI to Supabase's redirect allow list, configure the Supabase PKCE callback/deep-link handling in the native shell, and test the installed package on-device. Do not treat native OAuth as configured until the deep-link handoff is verified.

## RLS verification

Apply the migration before testing. In Supabase, create two test users and verify separately with each authenticated session:

- Each can read/update only their own profile, preferences, projects, conversations, and messages.
- A user cannot insert rows whose `user_id` is the other user's UUID.
- A user cannot select or mutate the other user's conversation/message rows.
- Unauthenticated requests cannot read or write these tables.

RLS is enforced with `auth.uid()` in every table policy. No live Supabase project was supplied, so remote OAuth, database, storage, and RLS behavior still needs to be validated against the configured project.

## Data and limitations

- Conversations are stored in IndexedDB. Model labels, endpoint, app preferences, and projects are stored locally in browser storage.
- Only conversation text and metadata are synced; uploaded files/model weights are not put in Postgres.
- Avatars use the Supabase `avatars` bucket; profile image uploads are limited to PNG/JPEG/WebP and 2 MB.
- Device memory reporting is approximate and does not expose free RAM.
- Model installation requires a live Ollama server. Browser apps cannot detect whether the Ollama executable is installed separately from testing its API endpoint.
- Native Windows/macOS/Linux/Android/iOS packaging is not included in this repository yet.

## Build

```powershell
npm run build
npm run preview
```
