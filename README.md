# Remember This

Remember This is a Chrome extension (Manifest V3) that saves YouTube transcripts into a private, searchable library
on your computer. Requirements: [docs/todo.md](docs/todo.md).

## Features

- **Save a YouTube transcript** from the toolbar popup or with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>. The
  extension reads captions inside your logged-in YouTube tab, so it works for videos that your account (for example
  YouTube Premium or channel memberships) can watch.
- **Clean text:** entities are decoded, line breaks and timestamps are removed, and caption fragments are joined into
  paragraphs.
- **Library dashboard** (`dashboard.html`, also the extension's options page): newest first, real-time full-text search
  (use `"quotes"` for phrases), reader view with highlighted matches, copy to clipboard, delete one, many, or all items.
- **Keywords:** each item gets up to 10 keywords, extracted locally with
  [keyword-extractor](https://www.npmjs.com/package/keyword-extractor) and ranked by TF-IDF across the library. The
  channel is always the first keyword. The list shows the top 5 instead of the start of the text (while searching,
  it also shows the matching excerpt).
- **Filters:** saved date (7 days, 30 days, year), channels (any of the selected), topics (all of the selected, with a
  finder for less common ones), and type when the library has more than one. Counts update with the results. Click
  any keyword pill in the list or reader to filter by it. <kbd>F</kbd> shows or hides the filter panel.
- **Love and forget:** mark an item as *loved* (a favorite) or *forgotten* (hidden from the normal library view). Both
  have filters. Only forgotten items can be deleted permanently, which protects against accidental deletion.
- **Video details:** channel, description, chapters, links from the description, view count and duration are saved
  with the transcript and shown in the reader.
- **AI summary (optional):** generate a summary of a transcript, rendered as Markdown, with a local LLM. Copy,
  regenerate, or delete it. Regenerating replaces the earlier summary.
- **AI tags (optional):** while the dashboard is open, a local LLM can generate tags for items in the background,
  one at a time (the open item first, then newest first). Until then, items show keyword-extraction tags.
- **Markdown export** for one item, the selected items, or all transcripts.
- **JSON export / import** for sync between computers (for example through iCloud Drive). Import validates every
  record and lets you merge (newer copy wins, nothing is deleted) or replace the library.
- **Private:** data stays in `chrome.storage.local`. No telemetry, no third-party services. Network requests are
  same-origin requests from the YouTube tab to youtube.com, and, only if you use the AI features, requests to the LLM
  server that you configure.

## AI features (local LLM)

Summaries and tags use an OpenAI-compatible server that you run yourself, for example
[LM Studio](https://lmstudio.ai) (Developer → Start server). The transcript is sent only to that server.

1. Open the dashboard and click the settings button.
2. Enter the **server address** (for example `http://192.168.1.220:1234`) and, optionally, a **model** (empty means the
   model the server has loaded). **Test connection** lists the available models.
3. Edit the **summary prompt** if you want, and turn **Use LLM for tagging** on or off.

Chrome asks for permission to access the server's host the first time (the extension declares it as an optional host
permission). If the server is unreachable, background tagging pauses and retries later. Calls time out after 3 minutes.

Web page article capture is a Phase II feature. On other pages the popup shows "Not implemented yet".

## Install (development)

Requires Node.js 24 (`.nvmrc`) and Chrome 130 or later.

```sh
npm install
npm run build        # type-check + production build into dist/
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `dist/` folder.
3. After a rebuild, click the reload icon on the extension card.

`npm run dev` rebuilds on every change (`vite build --watch`).

## Scripts

| Command             | Description                                              |
|---------------------|----------------------------------------------------------|
| `npm run build`     | Type-check and build the extension into `dist/`.         |
| `npm run dev`       | Rebuild on file changes.                                 |
| `npm test`          | Run the unit tests (Vitest).                             |
| `npm run typecheck` | Type-check only.                                         |
| `npm run icons`     | Regenerate `public/icons/*.png` from the icon script.    |
| `npm run format`    | Format the code with Prettier.                           |

## Architecture

| Path                              | Role                                                                                      |
|-----------------------------------|-------------------------------------------------------------------------------------------|
| `public/manifest.json`            | Manifest V3. Permissions: `storage`, `unlimitedStorage`, `scripting`; host: YouTube only. |
| `src/background/`                 | Service worker. Handles capture requests from the popup and the keyboard shortcut.        |
| `src/content/youtubeExtractor.ts` | Function injected into the YouTube tab (MAIN world) that reads the transcript.            |
| `src/shared/`                     | Pure logic: transcript cleanup, storage, search, import/export, Markdown. Unit-tested.    |
| `src/popup/`                      | Toolbar popup (React + Mantine).                                                          |
| `src/dashboard/`                  | Library dashboard (React + Mantine).                                                      |

### How transcript extraction works

The service worker injects `extractYouTubeTranscript` with `chrome.scripting.executeScript({ world: 'MAIN' })`. The
function runs inside the page, so its requests carry the user's YouTube session. Chrome serializes the function, so it
must not reference anything outside its own body.

1. It gets the player response for the **current** video from `#movie_player.getPlayerResponse()`. After in-app
   navigation, `window.ytInitialPlayerResponse` still describes the first video, so it is used only when the video ID
   matches.
2. **Caption track (`timedtext`).** YouTube requires a proof-of-origin (`pot`) token on caption URLs; without it the
   response is empty. The extractor reuses a caption URL that the player already signed. If there is none, it turns
   captions on for a moment so that the player makes one, then restores the previous captions setting.
3. **InnerTube `get_transcript`** is the fallback. In November 2026 YouTube rejected script calls to it with
   `400 FAILED_PRECONDITION`.
4. **Transcript panel:** if the user has "Show transcript" open, the extractor reads its segments.

Records are stored one per key (`item:<id>`), so a save does not rewrite the whole library. Capturing the same video
again updates the existing record.
