# Floro AI

Floro AI is a Vite + Express chat app with IndexedDB conversation storage, Ollama model management, OpenAI-compatible chat, automatic current-information web search, and a local profile/PIN screen.

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
4. Choose an installed model in the chat selector. New profiles use `gemma3:1b` (Gemma 3 1B) as their default when it is available. That model/provider selection is saved per conversation. “Set default” in My Models applies to new conversations.

Ollama stores model weights in its own configured directory. Floro AI cannot change this path through the Ollama API; configure `OLLAMA_MODELS` in the Ollama host environment if a different directory is needed, then restart Ollama. Model size/RAM labels in the store are estimates, not guarantees. A browser cannot report free system RAM. Mobile devices cannot run Ollama through this web app; configure a reachable remote Ollama server instead. A remote server must allow the Floro backend to reach it; use HTTPS outside a trusted private network.

The curated store links to the official Ollama library pages. The catalog is not a live complete mirror of ollama.com. Ollama handles tag resolution and actual download sizes.

## Chat input

The chat composer keeps model selection outside the message box. Use its plus button to attach up to five pictures (JPEG, PNG, WebP, or GIF, up to 6 MB each) or text-based files (TXT, Markdown, CSV, JSON, LOG, XML, or YAML, up to 1 MB each). Pictures are sent to the selected provider, so image questions require a vision-capable model. Text file contents are included with the message. During generation, the send control becomes a stop button; otherwise it is an upward-arrow send button. You can edit a sent message and resend it; editing an earlier turn removes later messages from that conversation, which the editor tells you before saving.

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

## Local profiles and PIN

On first launch, create a local profile with a name, date of birth, intended use, and six-digit PIN. Intended use offers presets for learning, writing, coding, research, productivity, creativity, or personal assistance, plus an “Other” description. Date of birth is stored only on this device and is not an authentication factor. The intended use is also stored locally and included with requests to the selected AI provider to personalize responses. Do not enter sensitive personal information.

On later visits, choose who is using Floro AI, create another profile, or delete a profile. Each profile has separate conversations, custom instructions, model labels, and default-model preferences. Existing conversations are assigned to the first local profile during migration. Deleting a profile requires its PIN and permanently removes that profile’s local data. Log out from the sidebar to return to the profile picker.

The PIN is a basic interface lock shown when a profile is selected and can also be activated from Settings. It is not identity verification and does not encrypt IndexedDB or protect data from someone with access to the browser profile. A “Forgot PIN?” action can reset the local PIN while keeping that profile’s chats; it does not verify identity. The PIN hash is derived locally with PBKDF2 and a random salt.

## Data and limitations

- Conversations are stored in IndexedDB with local profile ownership. Profile details and per-profile preferences are stored locally in browser storage.
- There is no authentication or cloud synchronization. Clearing browser storage removes the local profile and chats.
- Device memory reporting is approximate and does not expose free RAM.
- Model installation requires a live Ollama server. Browser apps cannot detect whether the Ollama executable is installed separately from testing its API endpoint.
- Native Windows/macOS/Linux/Android/iOS packaging is not included in this repository yet.

## Build

```powershell
npm run build
npm run preview
```
