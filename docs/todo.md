# Product Requirements Document (PRD)

## Project Title
**Remember This** — Chrome Extension for Content Capture & Transcript Management

---

## 1. Executive Summary
"Remember This" is a browser extension built with **TypeScript** and **Manifest V3**. Its primary objective is to allow users to quickly capture, format, and store YouTube video transcripts (utilizing active browser sessions and YouTube Premium permissions) and main article text from arbitrary web pages. Captured data is saved locally using browser storage (`chrome.storage.local`), viewable within a built-in search-enabled dashboard, and exportable/importable via JSON for multi-device synchronization (e.g., via iCloud Drive).

---

## 2. User Persona & Use Cases

### 2.2 Key Use Cases
1. **YouTube Transcript Capture:** When viewing a YouTube video, the user clicks a dedicated action button or popup option to extract, clean, and store the full transcript.
2. **General Web Article Capture:** While browsing news, blogs, or documentation, the user triggers the extension to capture the main body text.
3. **Library Search & Review:** The user opens a dedicated full-page dashboard UI to filter, search, read, or delete stored captures.
4. **Cross-Device Sync (iCloud/Local Backup):** The user exports their local library as a `.json` backup file to iCloud Drive and imports it on another computer running the extension.

---

## 3. Functional Requirements

### 3.1 Session-Authenticated YouTube Transcript Extraction
* **FR-1.1:** The content script injected into `https://www.youtube.com/watch*` MUST run inside the active browser context, automatically inheriting the user's logged-in cookies and YouTube Premium privileges.
* **FR-1.2:** The extraction logic MUST query internal player contexts (`window.ytInitialPlayerResponse` or track endpoints) to retrieve transcript caption tracks.
* **FR-1.3:** The parser MUST sanitize extracted XML/JSON lines:
  * Strip HTML entity encodings (e.g., `&#39;` to `'`).
  * Remove timestamp gaps and redundant carriage returns.
  * Concatenate fragments into continuous, readable paragraph blocks.
* **FR-1.4:** In addition to background storage, the clean transcript SHOULD be copyable directly to the system clipboard.

### 3.2 General Web Content Capture
* **FR-2.1:** For non-YouTube pages (`<all_urls>`), the content script will extract readable body content in the future. For now, show "Not Implemented"

### 3.3 Storage & Data Management
* **FR-3.1:** Captured items MUST be stored persistently in `chrome.storage.local`.
* **FR-3.2:** The extension MUST declare the `"unlimitedStorage"` permission in `manifest.json` to prevent local storage quota failures.
* **FR-3.3:** Schema for stored records:
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

### 3.4 Dashboard UI (Web GUI)
* **FR-4.1:** The extension MUST provide a full-page dashboard accessibility via `chrome.runtime.getURL('dashboard.html')` or `options_page`.
* **FR-4.2:** The dashboard MUST render a list of all stored captures, sorted by most recent first.
* **FR-4.3:** The dashboard MUST provide a real-time full-text search input filtering across item titles and content body.
* **FR-4.4:** Users MUST be able to delete individual items or clear the entire library.
- [ ] Dashboard must be well-designed. Use React and [Mantine](https://mantine.dev/).
- [ ] Ability to export one or many YouTube transcripts in Markdown.

### 3.5 Cross-Device Sync (Import / Export)
* **FR-5.1 (Export):** The dashboard MUST provide an **"Export JSON"** button that compiles `chrome.storage.local` data into a formatted `.json` file and triggers a browser download (allowing saving directly into iCloud Drive or cloud storage folders).
* **FR-5.2 (Import):** The dashboard MUST provide an **"Import JSON"** file uploader that validates imported payload structures, merges or replaces local records, and updates the view without data corruption.

---

## 4. Technical Architecture & Tech Stack

### 4.1 Technology Stack
* **Language:** TypeScript (`.ts`, `.tsx`)
* **Target Version:** Manifest V3 (Chrome Extension Platform)
* **Bundler & Build Tool:** Vite (configured for multi-entry rollup compilation)
* **DOM Utilities / Parsing:** `DOMParser` for XML captions; optional Readability parser for web articles.

---

## 5. Non-Functional Requirements

### 5.1 Privacy & Security
* **NFR-1:** **Zero External Telemetry:** All content and metadata must remain on the user's machine unless explicitly exported by the user via file download.
* **NFR-2:** No external API keys or third-party tracking services are required or allowed.

### 5.2 Performance & Storage
* **NFR-3:** Content extraction on YouTube and general web pages must complete in `< 500ms`.
* **NFR-4:** Full-text search in the dashboard must perform smoothly across at least 1,000 saved transcript records.

---

## 6. Future Enhancements (Phase 2 Roadmap)
1. **Direct iCloud / Native Messaging Host:** Provide an optional background companion script (Node.js/Python) to auto-write `.md` files directly to `~/Library/Mobile Documents/` without manual JSON exports.
2. **AI Summarization:** Integrate a local or API-driven LLM hook (e.g., Chrome Built-in AI / Gemini API) to generate concise summaries of transcripts prior to saving.
3. **Tags & Collections:** Allow users to organize saved transcripts into custom folders or tags inside the dashboard.