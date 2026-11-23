document.addEventListener("DOMContentLoaded", () => {
  const rescanBtn = document.getElementById("rescan-btn");
  const copyBtn = document.getElementById("copy-report-btn");
  const downloadBtn = document.getElementById("download-report-btn");

  document.querySelectorAll(".card-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".audit-card").classList.toggle("open");
    });
  });

  let latestReportMarkdown = "";
  let latestAuditData = null;

  const escapeHtml = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const setError = (msg) => {
    const banner = document.getElementById("error-banner");
    const dashboard = document.getElementById("dashboard");
    const dot = document.getElementById("status-dot");
    if (msg) {
      banner.textContent = msg;
      banner.classList.remove("hidden");
      dashboard.classList.add("hidden");
      dot.style.background = "#f43f5e";
      dot.style.boxShadow = "0 0 8px #f43f5e";
    } else {
      banner.classList.add("hidden");
      dashboard.classList.remove("hidden");
      dot.style.background = "#10b981";
      dot.style.boxShadow = "0 0 8px #10b981";
    }
  };

  const parseRobotsForBot = (robotsText, botName) => {
    if (!robotsText) return "ALLOW";
    const lines = robotsText.split(/\r?\n/);
    let activeAgents = [];
    const rulesByAgent = {};

    for (const rawLine of lines) {
      const line = rawLine.split("#")[0].trim();
      if (!line) {
        activeAgents = [];
        continue;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const directive = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (directive === "user-agent") {
        const agent = value.toLowerCase();
        activeAgents.push(agent);
        if (!rulesByAgent[agent]) rulesByAgent[agent] = [];
      } else if ((directive === "disallow" || directive === "allow") && activeAgents.length) {
        activeAgents.forEach((agent) => {
          rulesByAgent[agent].push({ directive, path: value });
        });
      }
    }

    const target = botName.toLowerCase();
    const applicableRules = rulesByAgent[target] || rulesByAgent["*"] || [];
    let blockedRoot = false;

    for (const rule of applicableRules) {
      if (rule.directive === "disallow" && rule.path === "/") {
        blockedRoot = true;
      }
      if (rule.directive === "allow" && rule.path === "/") {
        blockedRoot = false;
      }
    }
    return blockedRoot ? "BLOCKED" : "ALLOWED";
  };

  const checkLlmsFile = async (url) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { exists: false };
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();
      if (contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        return { exists: false };
      }
      const hasH1 = /^#\s+.+/m.test(text);
      const hasBlockquote = /^>\s+.+/m.test(text);
      const hasH2 = /^##\s+.+/m.test(text);
      return {
        exists: true,
        validSpec: hasH1 && (hasBlockquote || hasH2),
        hasH1,
        hasBlockquote,
        hasH2,
        length: text.length,
        preview: text.slice(0, 450)
      };
    } catch (_) {
      return { exists: false };
    }
  };

  const countRawHtmlWords = (htmlString) => {
    if (!htmlString) return 0;
    const doc = new DOMParser().parseFromString(htmlString, "text/html");
    doc.querySelectorAll("script, style, noscript, svg, template").forEach((el) => el.remove());
    const text = doc.body ? doc.body.textContent || "" : "";
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned ? cleaned.split(" ").length : 0;
  };

  const buildDetailedHtmlDocument = (data) => {
    const scoreColor = data.totalScore >= 75 ? "#059669" : data.totalScore >= 45 ? "#d97706" : "#e11d48";
    const scoreBg = data.totalScore >= 75 ? "#ecfdf5" : data.totalScore >= 45 ? "#fffbeb" : "#fff1f2";

    const recommendations = [];
    const blockedSearchBots = data.searchStatuses.filter((b) => b.status === "BLOCKED").map((b) => b.bot);
    if (blockedSearchBots.length > 0) {
      recommendations.push({
        priority: `HIGH IMPACT · CRAWL ACCESS`,
        title: `Unblock AI Search Crawlers (${blockedSearchBots.join(", ")})`,
        whySimple: `Right now, your website's rulebook (robots.txt) tells AI search engines to stay out. Because of this, ChatGPT, Perplexity, or Claude cannot read this page to recommend your brand.`,
        detail: `Update <code>${escapeHtml(data.origin)}/robots.txt</code> to explicitly allow search-citation bots (<code>OAI-SearchBot</code>, <code>PerplexityBot</code>, <code>Claude-SearchBot</code>) while keeping model-training bots restricted if desired.`
      });
    }
    if (data.jsHiddenPct > 25) {
      recommendations.push({
        priority: `HIGH IMPACT · RENDERING`,
        title: `Make Page Text Visible Without JavaScript (${data.jsHiddenPct}% Currently Hidden)`,
        whySimple: `Human visitors see your full page because their Chrome or Safari browser runs JavaScript. Many AI bots skip JavaScript to save speed—so they see a mostly empty page.`,
        detail: `Only <strong>${data.rawWords.toLocaleString()}</strong> of <strong>${data.renderedWords.toLocaleString()}</strong> words appear in raw server HTML. Enable Server-Side Rendering (SSR) or Static Site Generation (SSG) for main page copy.`
      });
    }
    if (!data.llmsData.exists) {
      recommendations.push({
        priority: `MEDIUM IMPACT · AI DISCOVERY`,
        title: `Create a Clean /llms.txt Guide at Your Website Root`,
        whySimple: `Think of /llms.txt as a VIP menu card written specifically for AI assistants—no menus, popups, or ads, just clean links and summaries of your best pages.`,
        detail: `Upload a plain-text Markdown file at <code>${escapeHtml(data.origin)}/llms.txt</code> using the ready-made template in Section 06 below.`
      });
    }
    if (!data.domData.hasSameAs || data.domData.schemaTypes.length === 0) {
      recommendations.push({
        priority: `MEDIUM IMPACT · BRAND IDENTITY`,
        title: `Add JSON-LD Schema & 'sameAs' Identity Links`,
        whySimple: `If two companies share a similar name, AI models can confuse them. Adding 'sameAs' links in your background code connects your website directly to your official LinkedIn, Wikipedia, and social profiles.`,
        detail: `Add <code>Organization</code>, <code>Article</code>, or <code>FAQPage</code> JSON-LD structured data with a populated <code>"sameAs"</code> array.`
      });
    }
    if (data.domData.directAnswerMatches === 0) {
      recommendations.push({
        priority: `QUICK WIN · CONTENT STRUCTURE`,
        title: `Add 40–60 Word Direct Answers Under Question Headings`,
        whySimple: `AI engines love quoting short, clear answers. If a subheading asks a question (like 'How much does X cost?'), put a crisp 2–3 sentence answer right below it before diving into long details.`,
        detail: `You currently have <strong>${data.domData.questionHeadings}</strong> question-style headings, with <strong>${data.domData.directAnswerMatches}</strong> followed by an optimal 28–75 word summary paragraph.`
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        priority: `MAINTAIN · EXCELLENT BASELINE`,
        title: `Your Technical GEO Setup Is Strong — Focus on Fresh Original Data`,
        whySimple: `AI bots can read your page cleanly, understand who you are, and extract structured facts easily.`,
        detail: `Keep updating statistics, pricing tables, and primary outbound citations quarterly so AI engines treat your page as the most up-to-date source.`
      });
    }

    const questionRowsHtml = data.domData.questionDetails.length
      ? data.domData.questionDetails
          .map(
            (q) => `
          <tr>
            <td><code>&lt;${escapeHtml(q.tag.toLowerCase())}&gt;</code></td>
            <td>${escapeHtml(q.heading)}</td>
            <td><strong>${q.answerWords} words</strong></td>
            <td><span class="badge ${q.status.startsWith("Optimal") ? "ok" : "warn"}">${escapeHtml(q.status)}</span></td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="4" style="color:#64748b;text-align:center;">No question-phrased &lt;h2&gt; or &lt;h3&gt; headings detected on this page.</td></tr>`;

    const robotsTemplate = `# Recommended AI Search vs. Training Bot Policy for ${data.hostname}
User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Googlebot
Allow: /

# Optional: Block AI model training while keeping live search citations active
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /`;

    const llmsTemplate = `# ${data.domData.title}

> ${data.domData.metaDescription || `Official overview and core resources for ${data.hostname}.`}

## Key Pages
- [Home](${data.origin}/): Main overview, products, and core value proposition.
- [About](${data.origin}/about): Company background, leadership, and verified credentials.
- [Guides & Resources](${data.origin}/blog): In-depth articles, benchmarks, and FAQs.`;

    const schemaTemplate = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${data.domData.title.replace(/"/g, '\\"')}",
  "url": "${data.origin}",
  "sameAs": [
    "https://www.linkedin.com/company/your-brand",
    "https://twitter.com/your-brand",
    "https://en.wikipedia.org/wiki/Your_Brand"
  ]
}
</script>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GEO & AI Search Readiness Report — ${escapeHtml(data.hostname)}</title>
  <style>
    :root {
      --ink: #0f172a;
      --slate: #334155;
      --muted: #64748b;
      --line: #e2e8f0;
      --surface: #f8fafc;
      --accent: #4f46e5;
      --accent-soft: #eef2ff;
      --score-color: ${scoreColor};
      --score-bg: ${scoreBg};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      color: var(--ink);
      background: #f1f5f9;
      line-height: 1.62;
      padding: 32px 20px;
    }
    .page {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
      overflow: hidden;
      border: 1px solid var(--line);
    }
    .toolbar {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .print-btn {
      background: #4f46e5;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 12.5px;
      cursor: pointer;
    }
    .print-btn:hover { background: #4338ca; }
    .header {
      padding: 38px 42px 30px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      background: linear-gradient(180deg, #fafbff 0%, #ffffff 100%);
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 10px;
      line-height: 1.25;
    }
    .meta-grid {
      font-size: 13px;
      color: var(--slate);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meta-grid a { color: var(--accent); text-decoration: none; word-break: break-all; }
    .score-card {
      flex-shrink: 0;
      text-align: center;
      padding: 20px 26px;
      border-radius: 14px;
      background: var(--score-bg);
      border: 1px solid color-mix(in srgb, var(--score-color) 30%, transparent);
    }
    .score-num {
      font-size: 40px;
      font-weight: 800;
      line-height: 1;
      color: var(--score-color);
    }
    .score-num small { font-size: 15px; font-weight: 600; opacity: 0.75; }
    .score-label {
      margin-top: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--score-color);
    }
    .content { padding: 34px 42px 44px; }

    .glossary-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 24px 26px;
      margin-bottom: 32px;
    }
    .glossary-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .glossary-pill {
      background: var(--accent);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 3px 9px;
      border-radius: 99px;
      text-transform: uppercase;
    }
    .glossary-box h2 {
      font-size: 17px;
      font-weight: 800;
      color: var(--ink);
    }
    .glossary-intro {
      font-size: 13.5px;
      color: var(--slate);
      margin-bottom: 16px;
    }
    .glossary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .term-card {
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 13px 15px;
    }
    .term-card strong {
      display: block;
      font-size: 13.5px;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .term-card p {
      font-size: 12.5px;
      color: var(--slate);
      line-height: 1.5;
    }

    .exec-summary {
      background: var(--score-bg);
      border-left: 4px solid var(--score-color);
      padding: 16px 20px;
      border-radius: 0 10px 10px 0;
      margin-bottom: 28px;
    }
    .exec-summary h2 { font-size: 15.5px; margin-bottom: 4px; color: var(--ink); }
    .exec-summary p { font-size: 13.5px; color: var(--slate); }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 34px;
    }
    .kpi {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
      background: #fff;
    }
    .kpi span { display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 4px; }
    .kpi strong { font-size: 18px; font-weight: 700; color: var(--ink); }

    section.module { margin-bottom: 36px; }
    .module-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--line);
    }
    .module-head h3 { font-size: 16.5px; font-weight: 700; }
    .module-score {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 99px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .plain-explainer {
      background: #f8fafc;
      border-left: 3px solid #94a3b8;
      padding: 10px 14px;
      font-size: 13px;
      color: var(--slate);
      margin-bottom: 14px;
      border-radius: 0 8px 8px 0;
    }
    .plain-explainer strong { color: var(--ink); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
      margin-bottom: 12px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      background: var(--surface);
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    code {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      color: #1e293b;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.bad { background: #ffe4e6; color: #9f1239; }
    .badge.info { background: #e0e7ff; color: #3730a3; }

    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .chip {
      font-size: 11.5px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 8px;
      border-radius: 6px;
      color: var(--slate);
    }

    .rec-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 12px;
      background: #ffffff;
    }
    .rec-tag {
      display: inline-block;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--accent-soft);
      color: var(--accent);
      margin-bottom: 6px;
    }
    .rec-card h4 { font-size: 15px; margin-bottom: 6px; color: var(--ink); }
    .rec-simple {
      font-size: 13px;
      color: var(--ink);
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .rec-tech { font-size: 12.5px; color: var(--muted); }

    .code-block-wrap {
      margin-bottom: 16px;
    }
    .code-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--slate);
      margin-bottom: 5px;
    }
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 10px;
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.55;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .report-footer {
      border-top: 1px solid var(--line);
      padding: 18px 42px;
      background: var(--surface);
      font-size: 12px;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; border: none; border-radius: 0; }
      .toolbar { display: none; }
      .glossary-box, .rec-card, pre { break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .header { flex-direction: column; }
      .glossary-grid, .kpi-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <span>Generated by <strong>GEO Pulse</strong> — Generative Engine Optimization &amp; AI Visibility Auditor</span>
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>

    <header class="header">
      <div>
        <div class="eyebrow">Comprehensive GEO &amp; AI Search Readiness Report</div>
        <h1>${escapeHtml(data.domData.title)}</h1>
        <div class="meta-grid">
          <div><strong>Audited URL:</strong> <a href="${escapeHtml(data.domData.url)}" target="_blank">${escapeHtml(data.domData.url)}</a></div>
          <div><strong>Primary H1 Heading:</strong> ${escapeHtml(data.domData.primaryH1 || "None detected")}</div>
          <div><strong>Canonical URL:</strong> ${escapeHtml(data.domData.canonicalUrl || "Not specified")}</div>
          <div><strong>Audit Timestamp:</strong> ${escapeHtml(data.timestamp)}</div>
        </div>
      </div>
      <div class="score-card">
        <div class="score-num">${data.totalScore}<small>/100</small></div>
        <div class="score-label">${escapeHtml(data.gradeText)}</div>
      </div>
    </header>

    <div class="content">
      <section class="glossary-box">
        <div class="glossary-header">
          <span class="glossary-pill">Start Here</span>
          <h2>Key Technical Terms Explained in Simple Language</h2>
        </div>
        <p class="glossary-intro">
          New to AI Search Optimization? Before reading the technical scores below, here is a 60-second plain-English guide to every term used in this audit:
        </p>
        <div class="glossary-grid">
          <div class="term-card">
            <strong>1. GEO (Generative Engine Optimization)</strong>
            <p>Traditional SEO helps your website rank in Google's blue links. <strong>GEO</strong> helps AI tools like ChatGPT, Google AI Overviews, and Perplexity read your website, trust your facts, and mention your brand in their answers.</p>
          </div>
          <div class="term-card">
            <strong>2. AI Search Bots vs. AI Training Bots</strong>
            <p><strong>Search Bots</strong> (like <code>OAI-SearchBot</code>) fetch live answers when a user asks a question today. <strong>Training Bots</strong> (like <code>GPTBot</code>) download your site to train future AI models. You can block training bots while still allowing search bots to recommend you.</p>
          </div>
          <div class="term-card">
            <strong>3. robots.txt (Your Website's Gatekeeper)</strong>
            <p>A simple text file at the root of your website (<code>yourdomain.com/robots.txt</code>) that acts like a security guard—telling automated bots which pages they are allowed to enter and which ones are off-limits.</p>
          </div>
          <div class="term-card">
            <strong>4. /llms.txt (A Menu Card Built for AI)</strong>
            <p>Normal webpages contain heavy design code, popups, and menus that confuse AI readers. An <code>/llms.txt</code> file is a clean, plain-text summary page that points AI assistants directly to your most important content.</p>
          </div>
          <div class="term-card">
            <strong>5. JavaScript (JS) Blindness vs. SSR</strong>
            <p>Some modern websites load blank first and fill in text using JavaScript. Human browsers wait for this, but many AI bots leave immediately and see an empty page. <strong>SSR (Server-Side Rendering)</strong> sends complete text right away so AI never misses it.</p>
          </div>
          <div class="term-card">
            <strong>6. JSON-LD Schema &amp; "sameAs" Links</strong>
            <p>Invisible background labels that tell AI exactly what your page is (an Article, Product, or Company). Adding <code>sameAs</code> links connects your site to your official LinkedIn or Wikipedia page so AI never confuses you with another business.</p>
          </div>
        </div>
      </section>

      <div class="exec-summary">
        <h2>Overall Assessment: ${escapeHtml(data.headline)}</h2>
        <p>${escapeHtml(data.summary)}</p>
      </div>

      <div class="kpi-grid">
        <div class="kpi">
          <span>AI Search Bots Allowed</span>
          <strong>${data.allowedSearchCount} / 4</strong>
        </div>
        <div class="kpi">
          <span>/llms.txt Agent Guide</span>
          <strong>${data.llmsData.exists ? (data.llmsData.validSpec ? "Valid Spec" : "Present") : "Missing"}</strong>
        </div>
        <div class="kpi">
          <span>JS-Hidden Text</span>
          <strong>${data.jsHiddenPct}%</strong>
        </div>
        <div class="kpi">
          <span>Schema &amp; Citations</span>
          <strong>${data.domData.schemaTypes.length} Schemas · ${data.domData.outboundCitations} Links</strong>
        </div>
      </div>

      <section class="module">
        <div class="module-head">
          <h3>01. AI Search vs. Model Training Crawler Access (/robots.txt)</h3>
          <span class="module-score">${data.botScore} / 30 pts</span>
        </div>
        <div class="plain-explainer">
          <strong>What this means in simple terms:</strong> We checked your site's gatekeeper file (<code>/robots.txt</code>) to see if AI assistants are allowed to read this page. Many websites accidentally block <em>all</em> AI bots—which makes them invisible in ChatGPT Search and Perplexity answers.
        </div>
        <table>
          <thead>
            <tr>
              <th>Bot Name</th>
              <th>Who Operates It &amp; Purpose</th>
              <th>Status</th>
              <th>What This Means For Your Visibility</th>
            </tr>
          </thead>
          <tbody>
            ${data.searchStatuses
              .map((b) => {
                const owners = {
                  "OAI-SearchBot": "OpenAI — Live ChatGPT Search citations",
                  "PerplexityBot": "Perplexity AI — Live answer engine citations",
                  "Claude-SearchBot": "Anthropic — Live Claude web search",
                  "Googlebot": "Google — Google Search & AI Overviews"
                };
                return `
              <tr>
                <td><code>${escapeHtml(b.bot)}</code></td>
                <td>${owners[b.bot] || "AI Search Crawler"}</td>
                <td><span class="badge ${b.status === "ALLOWED" ? "ok" : "bad"}">${b.status}</span></td>
                <td>${b.status === "ALLOWED" ? "Can read & cite your site in live AI answers" : "Blocked — your site cannot be cited here"}</td>
              </tr>`;
              })
              .join("")}
            ${data.trainingStatuses
              .map((b) => {
                const owners = {
                  "GPTBot": "OpenAI — Foundation model training",
                  "ClaudeBot": "Anthropic — Claude model training",
                  "Google-Extended": "Google — Gemini model training"
                };
                return `
              <tr>
                <td><code>${escapeHtml(b.bot)}</code></td>
                <td>${owners[b.bot] || "AI Training Crawler"}</td>
                <td><span class="badge ${b.status === "ALLOWED" ? "info" : "warn"}">${b.status}</span></td>
                <td>${b.status === "ALLOWED" ? "Allowed to use public pages for AI training" : "Blocked from AI training (does not hurt search citations)"}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </section>

      <section class="module">
        <div class="module-head">
          <h3>02. Agentic Discovery &amp; /llms.txt Specification</h3>
          <span class="module-score">${data.llmsScore} / 20 pts</span>
        </div>
        <div class="plain-explainer">
          <strong>What this means in simple terms:</strong> We checked whether your domain hosts a clean, AI-friendly directory file at <code>/llms.txt</code>. While not mandatory yet, hosting one helps AI coding and research agents quickly locate your core pages without wasting tokens on navigation menus.
        </div>
        <table>
          <thead>
            <tr>
              <th>Endpoint / Check</th>
              <th>Status</th>
              <th>Plain-English Explanation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>${escapeHtml(data.origin)}/llms.txt</code></td>
              <td><span class="badge ${data.llmsData.exists ? "ok" : "warn"}">${data.llmsData.exists ? "200 OK (FOUND)" : "NOT FOUND"}</span></td>
              <td>${data.llmsData.exists ? `Detected (${data.llmsData.length.toLocaleString()} characters of clean Markdown).` : "No /llms.txt file found at the root of this domain."}</td>
            </tr>
            <tr>
              <td><code>${escapeHtml(data.origin)}/llms-full.txt</code></td>
              <td><span class="badge ${data.llmsFullData.exists ? "ok" : "info"}">${data.llmsFullData.exists ? "200 OK (FOUND)" : "OPTIONAL"}</span></td>
              <td>Optional single-file text dump containing full documentation for deep AI indexing.</td>
            </tr>
            <tr>
              <td>Markdown Hierarchy (<code># H1</code> + <code>&gt; Summary</code>)</td>
              <td><span class="badge ${data.llmsData.validSpec ? "ok" : "info"}">${data.llmsData.validSpec ? "VERIFIED" : "N/A"}</span></td>
              <td>Checks whether the file uses standard headings and a blockquote summary that LLMs parse reliably.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="module">
        <div class="module-head">
          <h3>03. AI Crawler JavaScript Blindness (Raw HTML vs. Rendered DOM)</h3>
          <span class="module-score">${data.jsScore} / 25 pts</span>
        </div>
        <div class="plain-explainer">
          <strong>What this means in simple terms:</strong> We downloaded the raw code of this page the exact way a lightweight AI bot sees it, and compared it to what a human sees on screen. If a large percentage of words only appear after JavaScript runs, AI crawlers may miss your main message.
        </div>
        <table>
          <thead>
            <tr>
              <th>Measurement</th>
              <th>Result</th>
              <th>What It Indicates</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Raw Server HTML Word Count</td>
              <td><strong>${data.rawWords.toLocaleString()} words</strong></td>
              <td>Words immediately readable on first load without running JavaScript.</td>
            </tr>
            <tr>
              <td>Rendered Browser DOM Word Count</td>
              <td><strong>${data.renderedWords.toLocaleString()} words</strong></td>
              <td>Total visible words a human reader sees in Chrome after all scripts run.</td>
            </tr>
            <tr>
              <td>JS-Dependent Content Ratio</td>
              <td><span class="badge ${data.jsHiddenPct <= 15 ? "ok" : data.jsHiddenPct <= 40 ? "warn" : "bad"}">${data.jsHiddenPct}% JS-Dependent</span></td>
              <td>${data.jsHiddenPct <= 15 ? "Excellent: Almost all content is immediately readable by AI bots." : data.jsHiddenPct <= 40 ? "Moderate: Some dynamic widgets load via JS, but core text is visible." : "High Risk: Most text is invisible until JavaScript executes."}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="module">
        <div class="module-head">
          <h3>04. LLM Citability, Entity Schema &amp; Page Structure</h3>
          <span class="module-score">${data.citabilityScore} / 25 pts</span>
        </div>
        <div class="plain-explainer">
          <strong>What this means in simple terms:</strong> Even when an AI bot reads your page, it decides whether to quote you based on clarity and trust. Pages with verified brand identity links (<code>sameAs</code>), clear question-and-answer sections, data tables, and outbound source citations get quoted far more often.
        </div>
        <table>
          <thead>
            <tr>
              <th>Citability Factor</th>
              <th>Audit Finding</th>
              <th>Impact on AI Citations</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>JSON-LD Structured Data</td>
              <td><code>${escapeHtml(data.schemaDisplay)}</code></td>
              <td>Helps AI classify whether this page is an Article, Product, FAQ, or Organization.</td>
            </tr>
            <tr>
              <td>Brand Entity Links (<code>sameAs</code>)</td>
              <td><span class="badge ${data.domData.hasSameAs ? "ok" : "warn"}">${data.domData.hasSameAs ? "VERIFIED" : "MISSING"}</span></td>
              <td>${data.domData.sameAsLinks.length ? `Linked profiles: ${data.domData.sameAsLinks.map((u) => `<code>${escapeHtml(u)}</code>`).join(", ")}` : "No official social/Wikipedia identity links declared in schema."}</td>
            </tr>
            <tr>
              <td>Question Headings w/ Concise Answers</td>
              <td><strong>${data.domData.directAnswerMatches} optimal</strong> out of ${data.domData.questionHeadings} questions</td>
              <td>AI engines extract 30–70 word paragraphs directly below question subheadings as direct answers.</td>
            </tr>
            <tr>
              <td>Data Density (Tables, Lists, Metrics)</td>
              <td><strong>${data.domData.tableCount}</strong> tables · <strong>${data.domData.listCount}</strong> lists · <strong>${data.domData.statCount}</strong> numbers/stats</td>
              <td>Concrete numbers, prices, percentages, and comparison tables give LLMs quotable facts.</td>
            </tr>
            <tr>
              <td>Outbound Authority Citations</td>
              <td><strong>${data.domData.outboundCitations}</strong> external domains linked</td>
              <td>
                Linking to credible external references builds factual trust.
                ${data.domData.outboundDomainList.length ? `<div class="chip-list">${data.domData.outboundDomainList.map((d) => `<span class="chip">${escapeHtml(d)}</span>`).join("")}</div>` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <h4 style="font-size:14px;margin:18px 0 8px;color:var(--ink);">Page Heading Breakdown (Question-Style Subheadings Scanned)</h4>
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Subheading Text Found on Page</th>
              <th>Next Paragraph Length</th>
              <th>AI Snippet Fit</th>
            </tr>
          </thead>
          <tbody>
            ${questionRowsHtml}
          </tbody>
        </table>
      </section>

      <section class="module">
        <div class="module-head">
          <h3>05. Prioritized Action Plan (Plain-English &amp; Technical Steps)</h3>
          <span class="module-score">${recommendations.length} Action Items</span>
        </div>
        ${recommendations
          .map(
            (r) => `
          <div class="rec-card">
            <span class="rec-tag">${escapeHtml(r.priority)}</span>
            <h4>${escapeHtml(r.title)}</h4>
            <div class="rec-simple"><strong>Why this matters simply:</strong> ${escapeHtml(r.whySimple)}</div>
            <div class="rec-tech"><strong>How to fix it:</strong> ${r.detail}</div>
          </div>`
          )
          .join("")}
      </section>

      <section class="module">
        <div class="module-head">
          <h3>06. Ready-to-Use Implementation Snippets for ${escapeHtml(data.hostname)}</h3>
          <span class="module-score">Developer Hand-Off</span>
        </div>
        <div class="plain-explainer">
          <strong>How to use these snippets:</strong> Share this section directly with a web developer or CMS administrator. Each template below has already been customized with <strong>${escapeHtml(data.hostname)}</strong>'s domain details.
        </div>

        <div class="code-block-wrap">
          <div class="code-label">A. Recommended /robots.txt AI Crawler Rules</div>
          <pre>${escapeHtml(robotsTemplate)}</pre>
        </div>

        <div class="code-block-wrap">
          <div class="code-label">B. Starter /llms.txt File (Host at ${escapeHtml(data.origin)}/llms.txt)</div>
          <pre>${escapeHtml(llmsTemplate)}</pre>
        </div>

        <div class="code-block-wrap">
          <div class="code-label">C. Organization Entity &amp; sameAs JSON-LD Schema (Paste inside &lt;head&gt;)</div>
          <pre>${escapeHtml(schemaTemplate)}</pre>
        </div>
      </section>
    </div>

    <footer class="report-footer">
      <span>Generated by <strong>GEO Pulse</strong> — AI Search &amp; Citability Auditor</span>
      <span>Use "Print / Save as PDF" at the top right to export a PDF copy</span>
    </footer>
  </div>
</body>
</html>`;
  };

  const runAudit = async () => {
    rescanBtn.classList.add("spinning");
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith("http")) {
        setError("Open any standard website (http:// or https://) to run a GEO Readiness Audit.");
        rescanBtn.classList.remove("spinning");
        return;
      }

      const parsedUrl = new URL(tab.url);
      document.getElementById("current-domain").textContent = parsedUrl.hostname + parsedUrl.pathname;

      const [execRes, robotsRes, llmsRes, llmsFullRes, rawHtmlRes] = await Promise.allSettled([
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }),
        fetch(`${parsedUrl.origin}/robots.txt`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")),
        checkLlmsFile(`${parsedUrl.origin}/llms.txt`),
        checkLlmsFile(`${parsedUrl.origin}/llms-full.txt`),
        fetch(tab.url, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""))
      ]);

      const domData = execRes.status === "fulfilled" && execRes.value?.[0]?.result
        ? execRes.value[0].result
        : null;

      if (!domData) {
        setError("Unable to inspect this page's DOM. Try refreshing the tab first.");
        rescanBtn.classList.remove("spinning");
        return;
      }

      const robotsText = robotsRes.status === "fulfilled" ? robotsRes.value : "";
      const llmsData = llmsRes.status === "fulfilled" ? llmsRes.value : { exists: false };
      const llmsFullData = llmsFullRes.status === "fulfilled" ? llmsFullRes.value : { exists: false };
      const rawHtmlText = rawHtmlRes.status === "fulfilled" ? rawHtmlRes.value : "";

      const searchBots = ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Googlebot"];
      const trainingBots = ["GPTBot", "ClaudeBot", "Google-Extended"];

      const searchStatuses = searchBots.map((bot) => ({ bot, status: parseRobotsForBot(robotsText, bot) }));
      const trainingStatuses = trainingBots.map((bot) => ({ bot, status: parseRobotsForBot(robotsText, bot) }));

      const allowedSearchCount = searchStatuses.filter((b) => b.status === "ALLOWED").length;
      const botScore = Math.round((allowedSearchCount / searchBots.length) * 30);

      const botsBadge = document.getElementById("bots-badge");
      botsBadge.textContent = `${allowedSearchCount}/${searchBots.length} SEARCH`;
      botsBadge.className = `status-pill ${allowedSearchCount === 4 ? "good" : allowedSearchCount >= 2 ? "warn" : "bad"}`;
      document.getElementById("bots-sub").textContent = robotsText
        ? `robots.txt parsed for search vs. training agents`
        : `No robots.txt found (all crawlers allowed by default)`;
      document.getElementById("kpi-bots").textContent = `${allowedSearchCount}/4`;

      document.getElementById("bots-body").innerHTML = `
        <div class="detail-list">
          ${searchStatuses
            .map(
              (b) => `
            <div class="detail-row">
              <span><code>${b.bot}</code> <small style="color:#9ca3af">(Search)</small></span>
              <span class="tag-mini ${b.status === "ALLOWED" ? "allow" : "block"}">${b.status}</span>
            </div>`
            )
            .join("")}
          ${trainingStatuses
            .map(
              (b) => `
            <div class="detail-row">
              <span><code>${b.bot}</code> <small style="color:#9ca3af">(Training)</small></span>
              <span class="tag-mini ${b.status === "ALLOWED" ? "info" : "block"}">${b.status}</span>
            </div>`
            )
            .join("")}
        </div>
        <div class="insight-note">
          ${
            allowedSearchCount < 4
              ? `Warning: Blocking AI search crawlers prevents your pages from being cited in live ChatGPT, Perplexity, or Claude answers.`
              : `Optimal: All major AI search & citation crawlers can index this domain.`
          }
        </div>
      `;

      let llmsScore = 0;
      if (llmsData.exists) llmsScore += llmsData.validSpec ? 15 : 10;
      if (llmsFullData.exists) llmsScore += 5;

      const llmsBadge = document.getElementById("llms-badge");
      llmsBadge.textContent = llmsData.exists ? (llmsData.validSpec ? "VALID SPEC" : "FOUND") : "MISSING";
      llmsBadge.className = `status-pill ${llmsData.exists ? "good" : "warn"}`;
      document.getElementById("llms-sub").textContent = llmsData.exists
        ? `Clean Markdown agent directory detected`
        : `No /llms.txt file hosted at domain root`;
      document.getElementById("kpi-llms").textContent = llmsData.exists ? "Yes" : "No";

      document.getElementById("llms-body").innerHTML = `
        <div class="detail-list">
          <div class="detail-row">
            <span><code>/llms.txt</code></span>
            <span class="tag-mini ${llmsData.exists ? "allow" : "block"}">${llmsData.exists ? "200 OK" : "404 NOT FOUND"}</span>
          </div>
          <div class="detail-row">
            <span><code>/llms-full.txt</code></span>
            <span class="tag-mini ${llmsFullData.exists ? "allow" : "info"}">${llmsFullData.exists ? "200 OK" : "OPTIONAL"}</span>
          </div>
          <div class="detail-row">
            <span>Markdown Spec (<code># H1</code> + <code>&gt; Summary</code>)</span>
            <span class="tag-mini ${llmsData.validSpec ? "allow" : "info"}">${llmsData.validSpec ? "VERIFIED" : "N/A"}</span>
          </div>
        </div>
        <div class="insight-note">
          Hosting a concise <code>/llms.txt</code> gives LLM agents a token-efficient map of your core pages without HTML/CSS noise.
        </div>
      `;

      const rawWords = countRawHtmlWords(rawHtmlText);
      const renderedWords = domData.renderedWordCount;
      let jsHiddenPct = 0;
      if (renderedWords > 0 && rawWords >= 0) {
        jsHiddenPct = Math.max(0, Math.min(100, Math.round(((renderedWords - rawWords) / renderedWords) * 100)));
      }

      const jsScore = jsHiddenPct <= 15 ? 25 : jsHiddenPct <= 40 ? 16 : 6;
      const jsBadge = document.getElementById("js-badge");
      jsBadge.textContent = jsHiddenPct <= 15 ? "SSR READY" : jsHiddenPct <= 40 ? "PARTIAL JS" : "HIGH RISK";
      jsBadge.className = `status-pill ${jsHiddenPct <= 15 ? "good" : jsHiddenPct <= 40 ? "warn" : "bad"}`;
      document.getElementById("js-sub").textContent = `${jsHiddenPct}% of page text depends on client JS`;
      document.getElementById("kpi-js").textContent = `${jsHiddenPct}%`;

      document.getElementById("js-body").innerHTML = `
        <div class="detail-list">
          <div class="detail-row">
            <span>Raw Server HTML Words</span>
            <code>${rawWords.toLocaleString()} words</code>
          </div>
          <div class="detail-row">
            <span>Rendered Browser DOM Words</span>
            <code>${renderedWords.toLocaleString()} words</code>
          </div>
          <div class="detail-row">
            <span>Client-Side JS Dependency</span>
            <span class="tag-mini ${jsHiddenPct <= 15 ? "allow" : "block"}">${jsHiddenPct}% hidden</span>
          </div>
        </div>
        <div class="insight-note">
          Many AI fetchers (like OAI-SearchBot &amp; PerplexityBot) do not execute heavy JavaScript. Keep core copy in SSR/static HTML.
        </div>
      `;

      let citabilityScore = 0;
      if (domData.schemaTypes.length > 0) citabilityScore += 8;
      if (domData.hasSameAs) citabilityScore += 4;
      if (domData.directAnswerMatches > 0) citabilityScore += 6;
      if (domData.tableCount > 0 || domData.listCount >= 2) citabilityScore += 4;
      if (domData.statCount >= 3 || domData.outboundCitations >= 2) citabilityScore += 3;

      const citBadge = document.getElementById("citability-badge");
      citBadge.textContent = `${citabilityScore}/25 PTS`;
      citBadge.className = `status-pill ${citabilityScore >= 18 ? "good" : citabilityScore >= 10 ? "warn" : "bad"}`;
      document.getElementById("citability-sub").textContent = `${domData.schemaTypes.length} schemas · ${domData.directAnswerMatches} Q&A blocks`;
      document.getElementById("kpi-schema").textContent = domData.schemaTypes.length;

      const schemaDisplay = domData.schemaTypes.length ? domData.schemaTypes.slice(0, 4).join(", ") : `None detected`;

      document.getElementById("citability-body").innerHTML = `
        <div class="detail-list">
          <div class="detail-row">
            <span>JSON-LD Schemas</span>
            <code>${schemaDisplay}</code>
          </div>
          <div class="detail-row">
            <span>Entity Disambiguation (<code>sameAs</code>)</span>
            <span class="tag-mini ${domData.hasSameAs ? "allow" : "block"}">${domData.hasSameAs ? "PRESENT" : "MISSING"}</span>
          </div>
          <div class="detail-row">
            <span>Question Headings w/ Concise Answers</span>
            <code>${domData.directAnswerMatches} / ${domData.questionHeadings}</code>
          </div>
          <div class="detail-row">
            <span>Extractable Tables / Lists / Stats</span>
            <code>${domData.tableCount} tbl · ${domData.listCount} list · ${domData.statCount} stats</code>
          </div>
          <div class="detail-row">
            <span>Outbound Authority Domains</span>
            <code>${domData.outboundCitations} domains</code>
          </div>
        </div>
        <div class="insight-note">
          LLMs prioritize pages with clear <code>sameAs</code> entity links, structured tables, and 30–70 word direct answers under question headings.
        </div>
      `;

      const totalScore = Math.min(100, botScore + llmsScore + jsScore + citabilityScore);
      const circle = document.getElementById("gauge-progress");
      const circumference = 219.9;
      const offset = circumference - (totalScore / 100) * circumference;

      let strokeColor = `#10b981`;
      let gradeText = `AI CITATION READY`;
      let headline = `Strong GEO Foundation`;
      let summary = `Search bots can crawl raw HTML cleanly and structured entity signals are present.`;

      if (totalScore < 45) {
        strokeColor = `#f43f5e`;
        gradeText = `LOW AI VISIBILITY`;
        headline = `High Risk of AI Exclusion`;
        summary = `Critical blockers in bot access, JS rendering, or missing structured entity data.`;
      } else if (totalScore < 75) {
        strokeColor = `#f59e0b`;
        gradeText = `MODERATE READINESS`;
        headline = `Partially Optimized for LLMs`;
        summary = `Accessible to crawlers, but adding /llms.txt, sameAs schema, or Q&A blocks will lift citations.`;
      }

      circle.style.stroke = strokeColor;
      circle.style.strokeDashoffset = offset;
      document.getElementById("total-score").textContent = totalScore;

      const gradeBadge = document.getElementById("grade-badge");
      gradeBadge.textContent = gradeText;
      gradeBadge.style.color = strokeColor;
      gradeBadge.style.background = `${strokeColor}22`;
      document.getElementById("grade-title").textContent = headline;
      document.getElementById("grade-summary").textContent = summary;

      latestAuditData = {
        hostname: parsedUrl.hostname,
        origin: parsedUrl.origin,
        timestamp: new Date().toLocaleString(),
        domData,
        totalScore,
        gradeText,
        headline,
        summary,
        botScore,
        llmsScore,
        jsScore,
        citabilityScore,
        allowedSearchCount,
        searchStatuses,
        trainingStatuses,
        llmsData,
        llmsFullData,
        rawWords,
        renderedWords,
        jsHiddenPct,
        schemaDisplay
      };

      latestReportMarkdown = [
        `# GEO & AI Search Readiness Audit`,
        `- **URL:** ${domData.url}`,
        `- **Overall GEO Score:** ${totalScore}/100 (${gradeText})`,
        ``,
        `## 1. AI Search vs. Training Crawlers (/robots.txt)`,
        ...searchStatuses.map((b) => `- **${b.bot}** (Search): ${b.status}`),
        ...trainingStatuses.map((b) => `- **${b.bot}** (Training): ${b.status}`),
        ``,
        `## 2. Agent Discovery (/llms.txt)`,
        `- **/llms.txt:** ${llmsData.exists ? "Found" : "Missing"}`,
        `- **/llms-full.txt:** ${llmsFullData.exists ? "Found" : "Missing"}`,
        ``,
        `## 3. AI Crawler JavaScript Blindness`,
        `- **Raw Server HTML Words:** ${rawWords}`,
        `- **Rendered Browser DOM Words:** ${renderedWords}`,
        `- **JS-Only Content Ratio:** ${jsHiddenPct}%`,
        ``,
        `## 4. LLM Citability & Entity Signals`,
        `- **JSON-LD Schemas:** ${schemaDisplay}`,
        `- **Entity sameAs Links:** ${domData.hasSameAs ? "Yes" : "No"}`,
        `- **Direct-Answer Q&A Headings:** ${domData.directAnswerMatches}/${domData.questionHeadings}`,
        `- **Data Density:** ${domData.tableCount} tables, ${domData.listCount} lists, ${domData.statCount} inline metrics, ${domData.outboundCitations} outbound domains`
      ].join("\n");
    } catch (err) {
      setError(`Audit error: ${err.message}`);
    } finally {
      rescanBtn.classList.remove("spinning");
    }
  };

  rescanBtn.addEventListener("click", runAudit);

  copyBtn.addEventListener("click", async () => {
    if (!latestReportMarkdown) return;
    try {
      await navigator.clipboard.writeText(latestReportMarkdown);
      const label = document.getElementById("copy-btn-text");
      copyBtn.classList.add("copied");
      label.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        label.textContent = "Copy MD";
      }, 2000);
    } catch (_) {}
  });

  downloadBtn.addEventListener("click", () => {
    if (!latestAuditData) return;
    const htmlContent = buildDetailedHtmlDocument(latestAuditData);
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);

    const safeDomain = latestAuditData.hostname.replace(/[^a-z0-9.-]/gi, "_");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `GEO-Audit-${safeDomain}-${dateStamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

    const label = document.getElementById("download-btn-text");
    downloadBtn.classList.add("downloaded");
    label.textContent = "Report Downloaded!";
    setTimeout(() => {
      downloadBtn.classList.remove("downloaded");
      label.textContent = "Download Full Report";
    }, 2200);
  });

  runAudit();
});
