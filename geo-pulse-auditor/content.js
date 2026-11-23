(() => {
  const cleanText = (str) => (str || "").replace(/\s+/g, " ").trim();
  const countWords = (str) => {
    const cleaned = cleanText(str);
    return cleaned ? cleaned.split(" ").length : 0;
  };

  // 1. Rendered DOM visible text word count
  const bodyClone = document.body ? document.body.cloneNode(true) : null;
  if (bodyClone) {
    bodyClone
      .querySelectorAll("script, style, noscript, svg, template")
      .forEach((el) => el.remove());
  }
  const renderedText = bodyClone ? bodyClone.innerText || bodyClone.textContent || "" : "";
  const renderedWordCount = countWords(renderedText);

  // 2. Meta & Canonical Signals
  const metaDescEl = document.querySelector('meta[name="description"]');
  const metaDescription = metaDescEl ? cleanText(metaDescEl.getAttribute("content")) : "";
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const canonicalUrl = canonicalEl ? cleanText(canonicalEl.getAttribute("href")) : "";
  const h1El = document.querySelector("h1");
  const primaryH1 = h1El ? cleanText(h1El.textContent) : "";

  // 3. Question-based Headings & Direct-Answer Blocks (28–75 words)
  const questionRegex = /^(what|how|why|when|where|who|which|can|does|do|is|are|should|will)\b|\?$/i;
  const headings = Array.from(document.querySelectorAll("h2, h3"));
  let questionHeadings = 0;
  let directAnswerMatches = 0;
  const questionDetails = [];

  headings.forEach((h) => {
    const text = cleanText(h.textContent);
    if (questionRegex.test(text)) {
      questionHeadings++;
      let next = h.nextElementSibling;
      if (next && next.tagName !== "P") {
        next = next.querySelector("p");
      }
      const pWords = next ? countWords(next.textContent) : 0;
      const isOptimal = pWords >= 28 && pWords <= 75;
      if (isOptimal) {
        directAnswerMatches++;
      }
      if (questionDetails.length < 10) {
        questionDetails.push({
          tag: h.tagName,
          heading: text.slice(0, 110),
          answerWords: pWords,
          status: pWords === 0 ? "No paragraph found" : isOptimal ? "Optimal (28–75w)" : pWords < 28 ? "Too short" : "Too long"
        });
      }
    }
  });

  // 4. JSON-LD Structured Data & Entity Disambiguation (sameAs)
  const jsonLdNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const schemaTypes = new Set();
  const sameAsLinks = new Set();
  let hasSameAs = false;

  const extractTypes = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(extractTypes);
      return;
    }
    if (obj["@type"]) {
      if (Array.isArray(obj["@type"])) {
        obj["@type"].forEach((t) => schemaTypes.add(String(t)));
      } else {
        schemaTypes.add(String(obj["@type"]));
      }
    }
    if (obj.sameAs) {
      const links = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
      links.forEach((link) => {
        if (typeof link === "string" && link.trim()) {
          hasSameAs = true;
          sameAsLinks.add(link.trim());
        }
      });
    }
    if (obj["@graph"]) {
      extractTypes(obj["@graph"]);
    }
  };

  jsonLdNodes.forEach((script) => {
    try {
      const parsed = JSON.parse(script.textContent);
      extractTypes(parsed);
    } catch (_) {
      // Ignore malformed JSON-LD blocks
    }
  });

  // 5. Data Density (Tables, Lists, Statistics) & Outbound Citations
  const tableCount = document.querySelectorAll("table").length;
  const listCount = document.querySelectorAll("main ul, main ol, article ul, article ol").length ||
    document.querySelectorAll("ul, ol").length;

  const statMatches = renderedText.match(/(\b\d+(\.\d+)?%|\₹\s?\d+|\$\s?\d+|\b\d+(\.\d+)?x\b)/g) || [];
  const statCount = statMatches.length;

  const currentHost = window.location.hostname.replace(/^www\./, "");
  const outboundDomains = new Set();
  document.querySelectorAll("a[href^='http']").forEach((a) => {
    try {
      const url = new URL(a.href);
      const host = url.hostname.replace(/^www\./, "");
      if (host && host !== currentHost && !host.endsWith("." + currentHost)) {
        outboundDomains.add(host);
      }
    } catch (_) {}
  });

  return {
    title: document.title || "Untitled Page",
    url: window.location.href,
    metaDescription,
    canonicalUrl,
    primaryH1,
    renderedWordCount,
    totalHeadings: headings.length,
    questionHeadings,
    directAnswerMatches,
    questionDetails,
    schemaTypes: Array.from(schemaTypes),
    hasSameAs,
    sameAsLinks: Array.from(sameAsLinks).slice(0, 8),
    tableCount,
    listCount,
    statCount,
    outboundCitations: outboundDomains.size,
    outboundDomainList: Array.from(outboundDomains).slice(0, 12)
  };
})();
