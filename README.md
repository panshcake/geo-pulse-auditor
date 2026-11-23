# GEO Pulse — AI Search & Citability Auditor (Chrome Extension)

**GEO Pulse** is a lightweight, Manifest V3 Chrome Extension built for SEOs, content strategists, and developers to audit any webpage's readiness for **Generative Engine Optimization (GEO)** and AI answer engines (ChatGPT Search, Perplexity, Google AI Overviews, and Claude).

## What It Audits

1. **AI Search vs. Training Crawler Access (`/robots.txt`)**
   - Separates live search-citation bots (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`, `Googlebot`) from foundation model training crawlers (`GPTBot`, `ClaudeBot`, `Google-Extended`).
2. **Agentic Index Discovery (`/llms.txt`)**
   - Checks for root `/llms.txt` and `/llms-full.txt` files and validates standard Markdown structure (`# H1` + `> Summary`).
3. **AI Crawler JavaScript Blindness**
   - Compares raw server HTML word count against the live rendered browser DOM to detect client-side JS text that lightweight AI fetchers miss.
4. **LLM Citability & Entity Signals**
   - Inspects JSON-LD structured data, `sameAs` entity disambiguation links, question-based headings with concise 28–75 word answer blocks, tables/lists, and outbound authority citations.
5. **Client-Ready HTML & PDF Audit Export**
   - Generates a downloadable executive report complete with a plain-English glossary, page-level heading breakdowns, prioritized fixes, and custom `robots.txt`, `/llms.txt`, and JSON-LD implementation snippets.

## How to Install in Chrome (Developer Mode)

1. Click the green **`<> Code`** button at the top of this page and select **Download ZIP**.
2. Extract (unzip) the downloaded folder on your computer.
3. Open Chrome and go to `chrome://extensions`.
4. Toggle **Developer mode** ON in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
6. Pin **GEO Pulse** to your Chrome toolbar and click it on any live webpage to run an audit.
