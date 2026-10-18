// Lore & Glossary: search, browse by kind, and one page per entry.
// Entries are the Galactapedia's articles (catalog.data.js) merged with the hand-written notes
// (glossary.data.js). Other apps link here with index.html#find/<name>.
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
  const $ = (id) => document.getElementById(id);

  const META = window.LORE_META || {};
  const LORE = window.LORE || [];
  const IDX = Object.assign({ contractors: {}, activities: {}, makers: {}, places: {}, ships: {} }, window.LORE_INDEX || {});
  const HAND = window.GLOSSARY || [];
  const HMETA = window.GLOSSARY_META || {};
  const KINDS = window.GLOSSARY_KINDS || [];
  const KIND = new Map(KINDS.map((k) => [k.id, k]));
  const RSI = "https://robertsspaceindustries.com/galactapedia/article/";

  const SITE = window.SITE || {};
  const siteHref = (id) => ((SITE.links || []).find((l) => l.id === id) || {}).href || null;
  function appHref(app, { q, hash } = {}) {
    const h = siteHref(app);
    if (!h) return null;
    return `${h.replace(/[^/]*\.html$/, "")}index.html${q ? `?q=${encodeURIComponent(q)}` : ""}${hash ? `#${hash}` : ""}`;
  }

  // Names are compared without case, accents or punctuation.
  const norm = (s) =>
    String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const bare = (s) => norm(s).replace(/ (system|station)$/, "");
  // "Hurston (Stanton I)" → "Hurston"; "Green Imperial Housing Exchange (Grim HEX)" also gives "Grim HEX".
  // Parentheses that only say where something is, or which company, aren't names.
  function titleNames(t) {
    const m = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!m) return [t];
    const inner = /\b([IVX]+|\d+[a-z]?|Company|Belt|Cluster|Alpha|Beta)\b/.test(m[2]) ? [] : [m[2]];
    return [m[1], ...inner];
  }
  const plain = (md) => String(md || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim();
  function firstSentence(md) {
    const t = plain(md);
    const m = t.match(/^(.{40,260}?[.!?])(\s|$)/);
    return m ? m[1] : t.length > 220 ? `${t.slice(0, 217).replace(/\s\S*$/, "")}…` : t;
  }

  // ── Entries ────────────────────────────────────────────────────────────────
  const entries = new Map();
  const byGp = new Map();
  for (const a of LORE) {
    entries.set(a.id, { id: a.id, term: titleNames(a.t)[0], title: a.t, kind: a.k, aliases: titleNames(a.t).slice(1), lore: a, short: firstSentence(a.x), hand: null });
    byGp.set(a.gp, a.id);
  }
  for (const h of HAND) {
    const e = entries.get(h.id) || { id: h.id, title: h.term, aliases: [], lore: null };
    Object.assign(e, { term: h.term, kind: h.kind, short: h.short || e.short, hand: h, aliases: [...new Set([...(h.aliases || []), ...e.aliases, ...(e.lore && e.lore.t !== h.term ? [e.lore.t] : [])])] });
    entries.set(h.id, e);
  }
  const all = [...entries.values()].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  const namesOf = (e) => [e.term, e.title, ...e.aliases].filter(Boolean);

  // Every name → entries, hand-written first, for #find links and exact search hits.
  const byName = new Map();
  for (const e of [...all].sort((a, b) => !!b.hand - !!a.hand)) for (const n of namesOf(e)) {
    for (const k of new Set([norm(n), bare(n)])) {
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, []);
      if (!byName.get(k).includes(e)) byName.get(k).push(e);
    }
  }

  // Rest stops at Lagrange points have no articles of their own: their names find the Lagrange point entry.
  const lagrange = entries.get("lagrange-point");
  if (lagrange) for (const p of Object.values(IDX.places)) if (p[4] === "L") for (const k of [norm(p[0]), bare(p[0])]) if (!byName.has(k)) byName.set(k, [lagrange]);

  // What the other apps know about an entry: contractor, maker, place, ship.
  function matchKeys(e, keys, explicit, kinds) {
    if (explicit) return explicit.filter((k) => keys[k]);
    if (kinds && !kinds.includes(e.kind)) return [];
    const want = new Set(namesOf(e).flatMap((n) => [norm(n), bare(n)]));
    return Object.keys(keys).filter((k) => want.has(norm(k)) || want.has(bare(k)));
  }
  const placeNames = new Map();
  for (const [id, p] of Object.entries(IDX.places)) for (const k of [norm(p[0]), bare(p[0])]) if (!placeNames.has(k)) placeNames.set(k, id);
  const shipNames = new Map(Object.entries(IDX.ships).map(([id, n]) => [norm(n), id]));
  function appFacts(e) {
    const h = e.hand || {};
    const contractors = matchKeys(e, IDX.contractors, h.contractor, ["contractor", "company", "faction", "people"]);
    const makers = matchKeys(e, IDX.makers, h.maker, ["company"]);
    let places = h.place ? h.place.filter((p) => IDX.places[p]) : [];
    if (!h.place && e.kind === "place") {
      const id = namesOf(e).map((n) => placeNames.get(norm(n)) || placeNames.get(bare(n))).find(Boolean);
      if (id) places = [id];
    }
    let ships = [];
    if (e.kind === "vehicle") {
      const id = namesOf(e).map((n) => shipNames.get(norm(n))).find(Boolean);
      if (id) ships = [id];
    }
    return { contractors, makers, places, ships };
  }

  // Links between entries: hand-written related, links in the text, and backlinks.
  const linkTarget = (href) => (href.startsWith("gp:") ? byGp.get(href.slice(3)) : href.startsWith("e:") ? href.slice(2) : null);
  const outLinks = (e) => {
    const text = `${e.lore ? e.lore.x : ""}\n${(e.hand && e.hand.inGame) || ""}\n${(e.hand && e.hand.about) || ""}`;
    return [...text.matchAll(/\]\(((?:gp|e):[^)\s]+)\)/g)].map((m) => linkTarget(m[1])).filter((id) => id && id !== e.id && entries.has(id));
  };
  const backlinks = new Map();
  for (const e of all) for (const id of new Set([...outLinks(e), ...((e.hand && e.hand.related) || [])])) {
    if (!backlinks.has(id)) backlinks.set(id, new Set());
    backlinks.get(id).add(e.id);
  }

  // ── Markdown (the Galactapedia's and ours): paragraphs, lists, headings, links, bold, italics ──
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
        const h = href.replace(/&amp;/g, "&");
        const id = linkTarget(h);
        if (id) return entries.has(id) ? `<a href="#e/${esc(id)}">${text}</a>` : text;
        if (/^https?:\/\//.test(h)) return `<a href="${esc(h)}" target="_blank" rel="noopener">${text}</a>`;
        return text;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  }
  function md(text) {
    return String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*[-*•] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•] /, ""))}</li>`).join("")}</ul>`;
      const hm = lines[0].match(/^#{1,6}\s+(.*)$/);
      if (hm) return `<h4>${inline(hm[1])}</h4>${lines.length > 1 ? `<p>${inline(lines.slice(1).join(" "))}</p>` : ""}`;
      if (lines.every((l) => l.startsWith(">"))) return `<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  const hay = new Map();
  const hayOf = (e) => {
    if (!hay.has(e.id)) {
      const h = e.hand || {};
      hay.set(e.id, {
        names: namesOf(e).map(norm),
        tags: norm([...(e.lore ? [...(e.lore.c || []), ...(e.lore.g || [])] : [])].join(" ")),
        text: norm([e.short, h.inGame, h.about, e.lore && e.lore.x].map(plain).join(" ")),
      });
    }
    return hay.get(e.id);
  };
  function search(q) {
    const nq = norm(q);
    const words = nq.split(" ").filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const e of all) {
      const h = hayOf(e);
      let score = 0;
      for (const n of h.names) {
        if (n === nq) score = Math.max(score, 100);
        else if (n.startsWith(nq)) score = Math.max(score, 70);
        else if (` ${n}`.includes(` ${nq}`)) score = Math.max(score, 55);
        else if (n.includes(nq)) score = Math.max(score, 40);
      }
      let all3 = true;
      for (const w of words) {
        if (h.names.some((n) => ` ${n}`.includes(` ${w}`))) score += 12;
        else if (` ${h.tags}`.includes(` ${w}`)) score += 6;
        else if (` ${h.text}`.includes(` ${w}`)) score += 2;
        else all3 = false;
      }
      if (!all3 && score < 40) continue;
      if (score) out.push([score + (e.hand ? 4 : 0), e]);
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].term.localeCompare(b[1].term)).map((x) => x[1]);
  }

  // ── Small pieces ───────────────────────────────────────────────────────────
  const kindChip = (k) => `<a class="kind-chip kind-${esc(k)}" href="#browse/${esc(k)}">${esc((KIND.get(k) || { label: k }).label)}</a>`;
  const entryLink = (e) => `<a href="#e/${esc(e.id)}">${esc(e.term)}</a>`;
  const card = (e, why) => `<li class="g-row"><a href="#e/${esc(e.id)}"><strong>${esc(e.term)}</strong>${why ? ` <small class="muted">${esc(why)}</small>` : ""}<span>${esc(e.short)}</span></a>${kindChip(e.kind)}</li>`;
  const countBy = (k) => all.filter((e) => e.kind === k).length;

  // ── Pages ──────────────────────────────────────────────────────────────────
  const STARTERS = ["auec", "quantum-drive", "crimestat", "scu", "pledge", "ccu", "thirty-k", "o7", "wikelo", "pyro-system", "banu", "contested-zone", "med-bed", "master-modes"];
  function home() {
    const contractors = all.filter((e) => e.kind === "contractor");
    return `<section class="g-home">
      <p class="lead">Look up anything in Star Citizen: who a contractor is and what they pay for, what players mean by <a href="#e/thirty-k">30k</a> or <a href="#e/ccu">CCU</a>, and the lore of every species, company and place. ${fmt(LORE.length)} official Galactapedia articles, with game notes on ${fmt(HAND.length)} of the things players run into most.</p>
      <h3>Start here</h3>
      <div class="chip-row">${STARTERS.map((id) => entries.get(id)).filter(Boolean).map((e) => `<a class="g-chip" href="#e/${esc(e.id)}">${esc(e.term)}</a>`).join("")}</div>
      <h3>Browse</h3>
      <div class="kind-grid">${KINDS.filter((k) => countBy(k.id)).map((k) => `<a class="kind-card kind-${esc(k.id)}" href="#browse/${esc(k.id)}">
        <strong>${esc(k.label)}</strong><span class="muted">${fmt(countBy(k.id))}</span><small>${esc(k.blurb)}</small></a>`).join("")}</div>
      <h3>Contractors you'll work for</h3>
      <div class="chip-row">${contractors.map((e) => `<a class="g-chip" href="#e/${esc(e.id)}">${esc(e.term)}</a>`).join("")}</div>
    </section>`;
  }

  function browse(kind, cat) {
    const k = KIND.get(kind);
    if (!k) return `<p class="muted">No such list. <a href="#">Back to the start</a>.</p>`;
    const list = all.filter((e) => e.kind === kind);
    const cats = {};
    for (const e of list) for (const c of (e.lore && e.lore.c) || []) cats[c] = (cats[c] || 0) + 1;
    const catList = Object.entries(cats).filter(([, n]) => n >= 3 && n < list.length).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const shown = cat ? list.filter((e) => ((e.lore && e.lore.c) || []).includes(cat)) : list;
    const groups = new Map();
    for (const e of shown) {
      const L = /^[a-z]/i.test(norm(e.term)) ? norm(e.term)[0].toUpperCase() : "#";
      if (!groups.has(L)) groups.set(L, []);
      groups.get(L).push(e);
    }
    return `<section>
      <p class="crumbs"><a href="#">Glossary</a> ›</p>
      <h2>${esc(k.label)} <span class="muted">${fmt(shown.length)}</span></h2>
      <p class="muted">${esc(k.blurb)}</p>
      ${catList.length ? `<div class="chip-row">${[["", "All"], ...catList.map(([c, n]) => [c, `${c} ${n}`])].map(([c, label]) =>
        `<a class="g-chip${(cat || "") === c ? " on" : ""}" href="#browse/${esc(kind)}${c ? `/${encodeURIComponent(c)}` : ""}">${esc(label)}</a>`).join("")}</div>` : ""}
      ${groups.size > 8 ? `<nav class="letters">${[...groups.keys()].map((L) => `<a href="#browse/${esc(kind)}${cat ? `/${encodeURIComponent(cat)}` : ""}" data-letter="${L}">${L}</a>`).join("")}</nav>` : ""}
      ${[...groups].map(([L, es]) => `<h3 id="letter-${L}">${L}</h3><ul class="g-list">${es.map((e) => card(e)).join("")}</ul>`).join("")}
    </section>`;
  }

  function factsHtml(e) {
    const f = appFacts(e);
    const out = [];
    for (const name of f.contractors) {
      const c = IDX.contractors[name];
      const acts = Object.entries(c.acts).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${esc(IDX.activities[a] || a)} ${n}`).join(", ");
      const sys = Object.keys(c.sys).sort((a, b) => c.sys[b] - c.sys[a]).join(", ");
      const href = appHref("contracts", { q: `by:"${name}"` });
      out.push(`<div class="fact"><h4>${f.contractors.length > 1 ? esc(name) : "Contracts"}</h4><dl class="kv">
        <div><dt>Contracts</dt><dd>${href ? `<a href="${esc(href)}">${fmt(c.n)} →</a>` : fmt(c.n)}${c.illegal ? ` <small class="muted">(${fmt(c.illegal)} illegal)</small>` : ""}</dd></div>
        <div><dt>Kinds of work</dt><dd>${acts}</dd></div>
        ${sys ? `<div><dt>Systems</dt><dd>${esc(sys)}</dd></div>` : ""}
        ${c.reward ? `<div><dt>Reward</dt><dd>typically ${fmt(c.reward[0])} aUEC, up to ${fmt(c.reward[1])}</dd></div>` : ""}
        ${c.rate ? `<div><dt>Pay per hour</dt><dd>about ${fmt(c.rate)} aUEC <small class="muted">from players' run times</small></dd></div>` : ""}
        ${c.ranks && c.ranks.length > 1 ? `<div><dt>Ranks</dt><dd class="ladder">${c.ranks.map(esc).join(" › ")}</dd></div>` : ""}
      </dl></div>`);
    }
    if (f.makers.length) {
      const rows = [["ships", "ships", "Ships"], ["items", "items", "Personal items"], ["parts", "components", "Ship parts"]];
      const cells = rows.map(([key, app, label]) => {
        const n = f.makers.reduce((t, m) => t + (IDX.makers[m][key] || 0), 0);
        if (!n) return "";
        const href = appHref(app, { q: f.makers.map((m) => `maker:"${m}"`).join(" ") });
        return `<div><dt>${label}</dt><dd>${href ? `<a href="${esc(href)}">${fmt(n)} →</a>` : fmt(n)}</dd></div>`;
      }).join("");
      if (cells) out.push(`<div class="fact"><h4>Made by ${esc(e.term)}</h4><dl class="kv">${cells}</dl></div>`);
    }
    if (f.places.length) {
      out.push(`<div class="fact"><h4>${f.places.length > 1 ? "Places" : "Where it is"}</h4><ul class="plain">${f.places.map((id) => {
        const [name, kind, system, parent] = IDX.places[id];
        const href = appHref("locations", { hash: id });
        const ch = appHref("contracts", { q: `in:"${name}"` });
        return `<li>${href ? `<a href="${esc(href)}">${esc(name)}</a>` : esc(name)} <small class="muted">${esc([kind, parent && parent !== system ? `at ${parent}` : "", system].filter(Boolean).join(" · "))}</small>${ch && ["system", "planet", "moon", "city"].includes(kind) ? ` · <a href="${esc(ch)}">contracts here →</a>` : ""}</li>`;
      }).join("")}</ul></div>`);
    }
    for (const id of f.ships) {
      const href = appHref("ships", { hash: id });
      if (href) out.push(`<div class="fact"><h4>In the ships app</h4><p><a href="${esc(href)}">${esc(IDX.ships[id])}: stats, prices and where to buy →</a></p></div>`);
    }
    const links = ((e.hand && e.hand.links) || []).map((l) => [l.label, l.url || appHref(l.app, { q: l.q, hash: l.hash })]).filter(([, h]) => h);
    if (links.length) out.push(`<div class="fact"><h4>See also</h4><ul class="plain">${links.map(([label, h]) => `<li><a href="${esc(h)}"${/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : ""}>${esc(label)} →</a></li>`).join("")}</ul></div>`);
    return out.join("");
  }

  function entryPage(id) {
    const e = entries.get(id);
    if (!e) return `<p class="muted">There's no entry called “${esc(id)}”. <a href="#">Back to the start</a>.</p>`;
    const h = e.hand || {};
    const facts = factsHtml(e);
    const related = [...new Set([...(h.related || []), ...outLinks(e)])].map((r) => entries.get(r)).filter(Boolean);
    const back = [...(backlinks.get(e.id) || [])].filter((r) => !related.some((x) => x.id === r)).map((r) => entries.get(r)).filter(Boolean)
      .sort((a, b) => !!b.hand - !!a.hand || a.term.localeCompare(b.term));
    const chips = (list) => list.map((x) => `<a class="g-chip" href="#e/${esc(x.id)}">${esc(x.term)}</a>`).join("");
    const sources = [
      ...(e.lore ? [{ label: "Galactapedia (official lore)", url: `${RSI}${e.lore.gp}` }] : []),
      ...(h.sources || []),
      { label: "Search the Star Citizen Wiki", url: `https://starcitizen.tools/Special:Search?search=${encodeURIComponent(e.term)}` },
    ];
    const lore = e.lore ? e.lore.x : h.about;
    return `<article class="g-entry">
      <p class="crumbs"><a href="#">Glossary</a> › ${kindChip(e.kind)}</p>
      <h2>${esc(e.term)}</h2>
      ${e.aliases.length ? `<p class="aliases">Also: ${e.aliases.map(esc).join(" · ")}</p>` : ""}
      <p class="lead">${esc(e.short)}</p>
      <div class="g-cols">
        <div class="g-main">
          ${h.inGame ? `<section class="cmp-card in-game"><h3>In game</h3>${md(h.inGame)}${h.verified === false ? `<p class="unverified">Researched for patch ${esc(HMETA.patch || "?")}, not yet checked in game.</p>` : ""}</section>` : ""}
          ${lore ? `<section class="cmp-card lore"><h3>${e.lore ? "Lore" : "Background"}</h3>${e.lore && e.lore.img ? `<img class="lore-img" src="${esc(e.lore.img)}" alt="" loading="lazy">` : ""}${md(lore)}</section>` : ""}
        </div>
        <aside class="g-side">
          ${facts ? `<section class="cmp-card facts"><h3>In the apps</h3>${facts}</section>` : ""}
          ${related.length ? `<section class="cmp-card"><h3>Related</h3><div class="chip-row">${chips(related)}</div></section>` : ""}
          ${back.length ? `<section class="cmp-card"><h3>Mentioned in</h3><div class="chip-row">${chips(back.slice(0, 24))}</div>${back.length > 24 ? `<details><summary>${back.length - 24} more</summary><div class="chip-row">${chips(back.slice(24))}</div></details>` : ""}</section>` : ""}
          <section class="cmp-card"><h3>Sources</h3><ul class="plain">${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul></section>
        </aside>
      </div>
    </article>`;
  }

  function results(q, note) {
    const found = search(q);
    return `<section>
      ${note ? `<p class="note">${note}</p>` : ""}
      <h2>${found.length ? `${fmt(found.length)} result${found.length === 1 ? "" : "s"}` : "Nothing found"} <span class="muted">for “${esc(q)}”</span></h2>
      ${found.length ? `<ul class="g-list">${found.slice(0, 80).map((e) => {
        const nq = norm(q);
        const alias = e.aliases.find((a) => norm(a) === nq || norm(a).startsWith(nq));
        return card(e, alias && norm(e.term) !== nq ? `(${alias})` : "");
      }).join("")}</ul>${found.length > 80 ? `<p class="muted">Showing the best 80. Add a word to narrow it down.</p>` : ""}` :
        `<p class="muted">Try a shorter word, or <a href="https://starcitizen.tools/Special:Search?search=${encodeURIComponent(q)}" target="_blank" rel="noopener">search the Star Citizen Wiki</a>.</p>`}
    </section>`;
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  let query = "";
  function render() {
    const raw = decodeURIComponent(location.hash.slice(1));
    const [page, ...rest] = raw.split("/");
    let html;
    if (query.trim()) html = results(query.trim());
    else if (page === "e") html = entryPage(rest.join("/"));
    else if (page === "browse") html = browse(rest[0], rest.slice(1).join("/") || null);
    else if (page === "find") {
      // Links from the other apps: go straight to the entry when the name matches one.
      const name = rest.join("/");
      const hit = (byName.get(norm(name)) || byName.get(bare(name)) || [])[0];
      if (hit) { location.replace(`#e/${hit.id}`); return; }
      html = results(name, `No entry is called exactly “${esc(name)}”. Here's what matches.`);
    } else html = home();
    $("view").innerHTML = html;
    document.title = page === "e" && entries.get(rest.join("/")) ? `${entries.get(rest.join("/")).term} · Lore & Glossary` : "Lore & Glossary";
  }

  $("siteLinks").innerHTML = (SITE.links || []).map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`).join("");
  $("meta").textContent = `${fmt(LORE.length)} Galactapedia articles · ${fmt(HAND.length)} game notes · patch ${META.patch || HMETA.patch || "?"} · gathered ${META.gathered || "?"}`;

  const box = $("search");
  const setUrl = () => {
    try { history.replaceState(null, "", `${location.pathname}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}${location.hash}`); } catch (err) { /* file:// */ }
  };
  box.addEventListener("input", () => { query = box.value; setUrl(); render(); });
  box.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { const first = search(box.value)[0]; if (first) { box.value = query = ""; setUrl(); location.hash = `e/${first.id}`; } }
    if (ev.key === "Escape") { box.value = query = ""; setUrl(); render(); }
  });
  // Following a link clears the search so the page shows.
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href^='#']");
    if (!a) return;
    if (a.dataset.letter) {
      ev.preventDefault();
      const t = document.getElementById(`letter-${a.dataset.letter}`);
      if (t) t.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (query) { box.value = query = ""; setUrl(); if (a.getAttribute("href") === location.hash || (a.getAttribute("href") === "#" && !location.hash)) render(); }
  });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  query = new URLSearchParams(location.search).get("q") || "";
  box.value = query;
  render();

  // For the checker and the console.
  window.Glossary = { entries, all, search, byName, appFacts, norm };
})();
