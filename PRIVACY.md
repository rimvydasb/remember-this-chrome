# Privacy Policy for Remember This

Last updated: 2026-11-27

Remember This is a Chrome extension that saves YouTube transcripts into a library on your computer. This policy explains what data the extension handles and where it goes. In short: your data stays on your computer, and the developer receives none of it.

## Data the extension handles

- **YouTube content you choose to save:** the transcript, title, channel, description, chapters, links, view count, duration and thumbnail address of a video. The extension reads this from the YouTube tab you are using, only when you click the toolbar button or press the keyboard shortcut.
- **Data you create:** catalogs, loved or forgotten marks, tags, and any AI summaries, sentiment tags, answers and related-article links that you generate.
- **Settings:** your AI server address, model name and prompts.

## Where the data is stored

All of it is stored in your browser's local storage (`chrome.storage.local`) on your computer. The developer has no server and no access to your library. If you uninstall the extension, Chrome deletes this data. You can also delete items, or export and import your library as JSON or Markdown files, from the extension.

## What is not collected

The extension has no telemetry, analytics, advertising, tracking or user accounts. The developer does not collect, sell, share or transfer your data. Your data is not used for advertising, credit or lending decisions, or for anything unrelated to the extension's single purpose.

## Network requests

The extension makes network requests only in these cases:

1. **YouTube.** To read captions and details, the extension makes requests to `youtube.com` from your YouTube tab, and loads thumbnails from `i.ytimg.com`. These are the same requests your browser makes when you watch the video.
2. **Your AI server (optional).** If you set up an AI server (for example Ollama, LM Studio or a Claude CLI bridge) and use an AI feature, the extension sends the transcript text and your prompt to the address you entered. Nothing is sent to any AI server until you configure one. The developer does not operate this server. If you point the extension at a server run by someone else, that server's own privacy policy applies. Chrome asks for your permission for that address when you first use it.
3. **Related articles (optional).** If you click **Find related articles**, the extension sends search queries to Google, with the cookies of your Chrome profile. The queries contain topics, names and terms from the item, never the full transcript. Google receives them under its own privacy policy and can link them to your Google session. Nothing is sent until you click the button, and Chrome asks for permission to contact `https://www.google.com/*` first.

The extension does not load or run remote code.

## Permissions

- `storage`, `unlimitedStorage`: keep your library on your computer.
- `scripting`: read caption data inside your YouTube tab.
- Access to `youtube.com` and `i.ytimg.com`: read captions and show thumbnails.
- Optional access to other sites: requested only when you add an AI server address or use Find related articles. You can remove it in Chrome's extension settings.

## Children

The extension is not directed at children under 13 and does not knowingly collect data from anyone.

## Changes

If this policy changes, the new version will be published at the same address with a new date. Changes that affect how data is handled will be described in the extension's release notes.

## Contact

Questions or requests: https://github.com/rimvydasb/remember-this-chrome/issues
