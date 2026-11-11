# Product Requirements Document (PRD)

## Remember This — Chrome Extension for Content Capture & Transcript Management

---

## 1. Executive Summary

"Remember This" is a browser extension built with **TypeScript** and **Manifest V3**. It lets users quickly capture,
format, and store:

- YouTube video transcripts, using the active browser session and YouTube Premium permissions.
- Main article text from arbitrary web pages (Phase II).

Captured data is saved locally in `chrome.storage.local`, browsable in a built-in search-enabled dashboard, and
exportable/importable as JSON for multi-device sync (for example via iCloud Drive).

---

## 2. Use Cases

1. **YouTube transcript capture:** On a YouTube video page, the user clicks an action button or popup option to extract,
   clean, and store the full transcript.
2. **General web article capture:** While browsing news, blogs, or documentation, the user triggers the extension to
   capture the main body text.
3. **Library search & review:** The user opens a full-page dashboard to filter, search, read, or delete stored captures.
4. **Cross-device sync:** The user exports the local library as a `.json` file to iCloud Drive and imports it on another
   computer running the extension.

---

## 3. Technical Architecture

| Area         | Decision                                                                   |
|--------------|----------------------------------------------------------------------------|
| Language     | TypeScript (`.ts`, `.tsx`)                                                 |
| Platform     | Chrome Extension, Manifest V3                                              |
| Build tool   | Vite, configured for multi-entry Rollup compilation                        |
| Dashboard UI | React + [Mantine](https://mantine.dev/)                                    |
| Parsing      | `DOMParser` for XML captions; optional Readability parser for web articles |

### Data schema

```typescript
interface SavedItem {
    id: string; // Unique timestamp/UUID
    title: string;
    url: string;
    type: 'youtube_transcript' | 'webpage_text';
    content: string;
    timestamp: string; // ISO date string
}
```

---

## 4. Non-Functional Requirements

### Privacy & Security

- [x] **NFR-1 Zero external telemetry:** All content and metadata stay on the user's machine unless the user explicitly
  exports them as a file download.
- [x] **NFR-2 No third-party services:** No external API keys or third-party tracking services are required or allowed.

### Performance

- [x] **NFR-3:** Content extraction on YouTube and general web pages completes in under 500 ms.
- [x] **NFR-4:** Full-text search in the dashboard stays smooth across at least 1,000 saved transcript records.

---

## 5. Phase I — Core Product (MVP)

### 5.1 Project Setup

- [x] Initialize the TypeScript + Vite project with multi-entry build (content script, background/service worker, popup,
  dashboard).
- [x] Create `manifest.json` (Manifest V3) with the required permissions.
- [x] **FR-3.2** Declare the `"unlimitedStorage"` permission to prevent local storage quota failures.

### 5.2 YouTube Transcript Extraction

- [x] **FR-1.1** Run the content script on `https://www.youtube.com/watch*` inside the active browser context, so it
  inherits the user's logged-in cookies and YouTube Premium privileges.
    - Implementation: the extractor is injected on demand with `chrome.scripting.executeScript` into the page's MAIN
      world, not declared as a permanent content script. It runs only when the user captures.
- [x] **FR-1.2** Query internal player contexts (`window.ytInitialPlayerResponse` or track endpoints) to retrieve
  transcript caption tracks.
    - Caption URLs now need a player-signed `pot` token. The extractor reuses or triggers the player's signed URL.
      InnerTube `get_transcript` returned `400 FAILED_PRECONDITION` (November 2026) and is a fallback only.
- [x] **FR-1.3** Sanitize extracted XML/JSON lines:
    - [x] Decode HTML entities (for example `&#39;` to `'`).
    - [x] Remove timestamp gaps and redundant carriage returns.
    - [x] Concatenate fragments into continuous, readable paragraph blocks.
- [x] **FR-1.4** *(Should)* Let the user copy the clean transcript to the system clipboard.

### 5.3 General Web Content Capture (Placeholder)

- [x] **FR-2.1** On non-YouTube pages (`<all_urls>`), show a "Not Implemented" message. Real extraction is deferred to
  Phase II.

### 5.4 Storage & Data Management

- [x] **FR-3.1** Persist captured items in `chrome.storage.local`.
- [x] **FR-3.3** Store records using the `SavedItem` schema above.

### 5.5 Dashboard UI

- [x] **FR-4.1** Provide a full-page dashboard, reachable through `chrome.runtime.getURL('dashboard.html')` or
  `options_page`.
- [x] **FR-4.2** Render all stored captures, sorted by most recent first.
- [x] **FR-4.3** Provide a real-time full-text search input that filters across item titles and content.
- [x] **FR-4.4** Let users delete individual items or clear the entire library.
- [x] Build the dashboard with React and Mantine, with a well-designed, polished UI.
- [x] Export one or many YouTube transcripts as Markdown.

### 5.6 Cross-Device Sync (Import / Export)

- [x] **FR-5.1 Export:** Provide an **"Export JSON"** button that compiles `chrome.storage.local` data into a formatted
  `.json` file and triggers a browser download, so the user can save it to iCloud Drive or another cloud folder.
- [x] **FR-5.2 Import:** Provide an **"Import JSON"** file uploader that:
    - [x] Validates the imported payload structure.
    - [x] Merges or replaces local records without data corruption.
    - [x] Updates the dashboard view after import.

### 5.7 Phase I Quality Checks

- [x] Verify NFR-3 (extraction under 500 ms). Measured 202–284 ms on live videos.
- [x] Verify NFR-4 (search with 1,000+ records). Unit test: ~27 ms over 1,000 records (~50 MB).
- [x] Confirm no network requests leave the extension (NFR-1, NFR-2). Only same-origin youtube.com requests.

---

## 6. Phase II — Future Enhancements

- [ ] **General web article capture:** Extract the main body text of web pages (optionally with a Readability parser)
  and replace the Phase I "Not Implemented" placeholder (FR-2.1).
- [ ] **Direct iCloud / Native Messaging Host:** Add an optional background companion script (Node.js/Python) that
  writes `.md` files directly to `~/Library/Mobile Documents/` without manual JSON exports.
- [ ] **AI summarization:** Integrate a local or API-driven LLM hook (for example Chrome Built-in AI or the Gemini API)
  to generate concise summaries of transcripts before saving.
    - Note: an API-driven option conflicts with NFR-1 and NFR-2. Prefer a local model, or make it strictly opt-in.
- [ ] **Tags & collections:** Let users organize saved transcripts into custom folders or tags in the dashboard.
