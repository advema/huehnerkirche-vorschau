// Backend Gasthof Hühnerkirche – Vanilla JS, kein Framework.
(function () {
  "use strict";
  var S = JSON.parse(document.getElementById("start").textContent);
  var app = document.getElementById("app");
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var KEYS = ["speisekarte", "inhalte", "hinweis"];
  var state = {}, saved = {};
  KEYS.forEach(function (k) { state[k] = clone(S[k]); saved[k] = clone(S[k]); });
  var DEMO = document.body.hasAttribute("data-demo");
  var SITE = new URL("../", location.href).pathname; // "/" auf dem Server, Unterordner in der Vorschau
  if (DEMO) KEYS.forEach(function (k) { try { var v = localStorage.getItem("hk-demo-" + k); if (v) { state[k] = JSON.parse(v); saved[k] = JSON.parse(v); } } catch (e) {} });
  var tab = "speisekarte";
  var karteIdx = 0; // Index in karten, oder "getraenke"
  var suche = "";

  /* ---------- kleine Helfer ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) el.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    }
    return el;
  }
  function api(data) {
    if (DEMO) return new Promise(function (ok, fail) { setTimeout(function () { try { ok(demoApi(data)); } catch (e) { fail(e); } }, 250); });
    return fetch("api.php", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF": S.csrf }, body: JSON.stringify(data), credentials: "same-origin" })
      .then(function (r) {
        return r.json().catch(function () { return { fehler: "Unerwartete Antwort vom Server (" + r.status + ")." }; })
          .then(function (j) { if (!r.ok || j.fehler) throw new Error(j.fehler || "Fehler " + r.status); return j; });
      });
  }
  var toastEl = document.querySelector(".toast"), toastT;
  function toast(msg, fehler) {
    toastEl.textContent = msg; toastEl.className = "toast" + (fehler ? " toast--err" : ""); toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, fehler ? 7000 : 3500);
  }
  function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  function iconBtn(label, sym, fn, cls) { return h("button", { type: "button", class: "ibtn " + (cls || ""), title: label, "aria-label": label, onclick: fn }, sym); }
  function fmtTag(iso) { var d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); }

  /* ---------- Speichern / Änderungen ---------- */
  var bar = document.querySelector(".savebar");
  function dirtyKeys() { return KEYS.filter(function (k) { return JSON.stringify(state[k]) !== JSON.stringify(saved[k]); }); }
  function changed() { bar.hidden = dirtyKeys().length === 0; }
  document.querySelector("[data-speichern]").addEventListener("click", function () {
    var keys = dirtyKeys(), btn = this;
    btn.disabled = true; btn.textContent = "Speichert …";
    keys.reduce(function (p, k) {
      return p.then(function () { return api({ aktion: k, daten: state[k] }).then(function () { saved[k] = clone(state[k]); }); });
    }, Promise.resolve()).then(function () {
      toast(DEMO ? "Gespeichert (Testversion: nur in diesem Browser)." : "Gespeichert. Die Änderungen sind jetzt auf der Website sichtbar.");
    }).catch(function (e) { toast(e.message, true); }).then(function () {
      btn.disabled = false; btn.textContent = "Speichern"; changed();
    });
  });
  document.querySelector("[data-verwerfen]").addEventListener("click", function () {
    if (!confirm("Alle ungespeicherten Änderungen verwerfen?")) return;
    KEYS.forEach(function (k) { state[k] = clone(saved[k]); });
    changed(); render();
  });
  window.addEventListener("beforeunload", function (e) { if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Navigation ---------- */
  var tabs = document.querySelectorAll("[data-tab]");
  Array.prototype.forEach.call(tabs, function (b) {
    b.addEventListener("click", function () { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  });
  function render() {
    Array.prototype.forEach.call(tabs, function (b) { b.toggleAttribute("aria-current", b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); });
    app.textContent = "";
    ({ speisekarte: renderSpeisekarte, texte: renderTexte, hinweis: renderHinweis, statistik: renderStatistik, verlauf: renderVerlauf })[tab]();
  }

  /* =====================================================================
     Speisekarte
     ===================================================================== */
  function inp(obj, key, attrs) {
    var a = Object.assign({ value: obj[key] || "", oninput: function () { obj[key] = this.value; changed(); } }, attrs || {});
    var el = h(a.multiline ? "textarea" : "input", Object.assign({}, a, { value: null, multiline: null }));
    el.value = obj[key] || "";
    return el;
  }
  function preisInput(d) {
    return inp(d, "preis", { class: "f-preis", inputmode: "decimal", placeholder: "0,00", "aria-label": "Preis in Euro",
      onblur: function () {
        var v = this.value.trim().replace(".", ",").replace(/[^\d,]/g, "");
        if (/^\d+$/.test(v)) v += ",00"; else if (/^\d+,\d$/.test(v)) v += "0";
        this.value = d.preis = v; this.classList.toggle("is-invalid", !/^\d{1,3},\d{2}$/.test(v)); changed();
      } });
  }
  function neuesGericht() { return { nr: "", name: "", preis: "", zusatz: "" }; }

  function gruppeCard(spalte, gi, bereich, si) {
    var g = spalte[gi];
    var rows = h("div", { class: "dishes" });
    g.gerichte.forEach(function (d, di) {
      var treffer = !suche || (d.name + " " + d.zusatz + " " + d.nr).toLowerCase().indexOf(suche) > -1;
      rows.appendChild(h("div", { class: "dish-row" + (treffer ? "" : " is-hidden") + (suche && treffer ? " is-hit" : "") },
        inp(d, "nr", { class: "f-nr", placeholder: "Nr.", "aria-label": "Nummer", inputmode: "numeric" }),
        h("div", { class: "f-main" },
          inp(d, "name", { class: "f-name", placeholder: "Name des Gerichts", "aria-label": "Name" }),
          inp(d, "zusatz", { class: "f-zusatz", placeholder: "Zusatz (optional), z. B. mit Toastbrot", "aria-label": "Zusatz" })),
        h("div", { class: "f-preis-wrap" }, preisInput(d), h("span", { "aria-hidden": "true" }, "€")),
        h("div", { class: "row-act" },
          iconBtn("Nach oben", "↑", function () { move(g.gerichte, di, -1); changed(); render(); }),
          iconBtn("Nach unten", "↓", function () { move(g.gerichte, di, 1); changed(); render(); }),
          iconBtn("Gericht löschen", "×", function () { if (!d.name || confirm("„" + d.name + "“ löschen?")) { g.gerichte.splice(di, 1); changed(); render(); } }, "ibtn--del"))));
    });
    var andere = bereich.spalten.length === 2 ? bereich.spalten[1 - si] : null;
    var leer = suche && !rows.querySelector(".is-hit");
    return h("section", { class: "grp" + (leer ? " is-hidden" : "") },
      h("div", { class: "grp__head" },
        inp(g, "titel", { class: "f-gtitel", placeholder: "Überschrift (optional), z. B. Biere vom Fass", "aria-label": "Überschrift der Gruppe" }),
        h("div", { class: "row-act" },
          iconBtn("Gruppe nach oben", "↑", function () { move(spalte, gi, -1); changed(); render(); }),
          iconBtn("Gruppe nach unten", "↓", function () { move(spalte, gi, 1); changed(); render(); }),
          andere && iconBtn(si === 0 ? "In rechte Spalte verschieben" : "In linke Spalte verschieben", si === 0 ? "→" : "←", function () { andere.push(spalte.splice(gi, 1)[0]); changed(); render(); }),
          iconBtn("Gruppe löschen", "×", function () { if (confirm("Ganze Gruppe mit " + g.gerichte.length + " Gerichten löschen?")) { spalte.splice(gi, 1); changed(); render(); } }, "ibtn--del"))),
      rows,
      h("div", { class: "grp__foot" },
        h("button", { type: "button", class: "addbtn", onclick: function () { g.gerichte.push(neuesGericht()); changed(); render(); } }, "+ Gericht"),
        inp(g, "hinweis", { class: "f-ghinweis", placeholder: "Hinweis unter der Gruppe (optional)", "aria-label": "Hinweis unter der Gruppe" })));
  }

  function bereicheEditor(bereiche) {
    var wrap = h("div", { class: "bereiche" });
    bereiche.forEach(function (b, bi) {
      var cols = h("div", { class: "cols cols--" + b.spalten.length });
      b.spalten.forEach(function (sp, si) {
        cols.appendChild(h("div", { class: "col" },
          b.spalten.length === 2 && h("p", { class: "col__label" }, si === 0 ? "Linke Spalte" : "Rechte Spalte"),
          sp.map(function (_, gi) { return gruppeCard(sp, gi, b, si); }),
          h("button", { type: "button", class: "addbtn addbtn--grp", onclick: function () { sp.push({ titel: "", hinweis: "", gerichte: [neuesGericht()] }); changed(); render(); } }, "+ Gruppe")));
      });
      var trifft = !suche || b.spalten.some(function (sp) { return sp.some(function (g) { return g.gerichte.some(function (d) { return (d.name + " " + d.zusatz + " " + d.nr).toLowerCase().indexOf(suche) > -1; }); }); });
      wrap.appendChild(h("section", { class: "bereich" + (trifft ? "" : " is-hidden") },
        h("div", { class: "bereich__head" },
          h("h3", null, "Abschnitt " + (bi + 1)),
          h("div", { class: "seg", role: "group", "aria-label": "Spalten" },
            [1, 2].map(function (n) {
              return h("button", { type: "button", "aria-pressed": b.spalten.length === n ? "true" : "false", onclick: function () {
                if (n === b.spalten.length) return;
                if (n === 2) b.spalten.push([]); else { b.spalten[0] = b.spalten[0].concat(b.spalten[1]); b.spalten.length = 1; }
                changed(); render();
              } }, n === 1 ? "1 Spalte" : "2 Spalten");
            })),
          h("div", { class: "row-act" },
            iconBtn("Abschnitt nach oben", "↑", function () { move(bereiche, bi, -1); changed(); render(); }),
            iconBtn("Abschnitt nach unten", "↓", function () { move(bereiche, bi, 1); changed(); render(); }),
            iconBtn("Abschnitt löschen", "×", function () { if (confirm("Ganzen Abschnitt löschen?")) { bereiche.splice(bi, 1); changed(); render(); } }, "ibtn--del"))),
        cols));
    });
    wrap.appendChild(h("button", { type: "button", class: "addbtn addbtn--bereich", onclick: function () { bereiche.push({ spalten: [[{ titel: "", hinweis: "", gerichte: [neuesGericht()] }]] }); changed(); render(); } }, "+ Abschnitt (z. B. neue Seite der Karte)"));
    return wrap;
  }

  function renderSpeisekarte() {
    var sk = state.speisekarte;
    if (karteIdx !== "getraenke" && !sk.karten[karteIdx]) karteIdx = 0;
    var anzahl = function (bs) { var n = 0; bs.forEach(function (b) { b.spalten.forEach(function (s) { s.forEach(function (g) { n += g.gerichte.length; }); }); }); return n; };
    var pills = h("div", { class: "pills", role: "group", "aria-label": "Karte wählen" },
      sk.karten.map(function (k, i) {
        return h("button", { type: "button", "aria-pressed": karteIdx === i ? "true" : "false", onclick: function () { karteIdx = i; render(); } },
          k.titel, h("span", { class: "pill-n" }, String(anzahl(k.bereiche))));
      }),
      h("button", { type: "button", "aria-pressed": karteIdx === "getraenke" ? "true" : "false", onclick: function () { karteIdx = "getraenke"; render(); } },
        "Getränke", h("span", { class: "pill-n" }, String(anzahl(sk.getraenke.bereiche)))));
    var search = h("input", { type: "search", class: "search", placeholder: "Gericht suchen, z. B. Schnitzel", "aria-label": "Gericht suchen", value: suche,
      oninput: function () { suche = this.value.toLowerCase().trim(); var pos = this.selectionStart; render(); var s = app.querySelector(".search"); s.focus(); s.setSelectionRange(pos, pos); } });
    search.value = suche;
    var vorschau = h("a", { class: "btn btn--ghost btn--sm", href: SITE + "speisekarte", target: "_blank", rel: "noopener" }, "Speisekarte ansehen ↗");

    app.appendChild(h("div", { class: "pagehead" },
      h("div", null, h("h1", null, "Speisekarte"), h("p", { class: "muted" }, "Preise, Gerichte und Reihenfolge ändern. Gespeichert wird erst mit „Speichern“ unten.")),
      vorschau));
    app.appendChild(h("div", { class: "toolbar" }, pills, search));

    if (karteIdx === "getraenke") {
      app.appendChild(h("div", { class: "card card--info" }, h("p", null, "Die Getränkekarte gilt für alle Speisekarten, bei denen „Getränkekarte anhängen“ aktiv ist.")));
      app.appendChild(bereicheEditor(sk.getraenke.bereiche));
      return;
    }
    var k = sk.karten[karteIdx];
    app.appendChild(h("section", { class: "card karte-settings" },
      h("label", { class: "fld" }, h("span", null, "Titel der Karte"), inp(k, "titel", { maxlength: 60 })),
      h("label", { class: "fld" }, h("span", null, "Untertitel"), inp(k, "untertitel", { maxlength: 120, placeholder: "z. B. 12–14 Uhr · Mit Tagessuppe" })),
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!k.menue, onchange: function () { k.menue = this.checked; changed(); } }), h("span", null, "Menü-Darstellung: „Tagessuppe“ über und „Nachtisch“ unter jedem Gericht (erster Abschnitt)")),
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!k.getraenke, onchange: function () { k.getraenke = this.checked; changed(); } }), h("span", null, "Getränkekarte anhängen"))));
    app.appendChild(bereicheEditor(k.bereiche));
  }

  /* =====================================================================
     Texte
     ===================================================================== */
  var TEXTE = [
    ["Startseite – oberer Bereich", [
      ["hero_ort", "Kleine Zeile über der Überschrift", 80],
      ["hero_titel", "Überschrift (weiß)", 60],
      ["hero_titel_akzent", "Überschrift, zweite Zeile (gold)", 60],
      ["hero_text", "Text unter der Überschrift", 260]]],
    ["Startseite – Einleitung", [
      ["einleitung_titel", "Überschrift", 80],
      ["einleitung_absatz1", "Erster Absatz", 700],
      ["einleitung_absatz2", "Zweiter Absatz", 700]]],
    ["Startseite – Öffnungszeiten", [
      ["oeffnungszeiten_text", "Text neben der Tabelle", 500]]],
    ["Speisekarte", [
      ["speisekarte_text", "Text im Kopfbereich", 300]]]
  ];
  function renderTexte() {
    app.appendChild(h("div", { class: "pagehead" }, h("div", null, h("h1", null, "Texte"), h("p", { class: "muted" }, "Kleine Textänderungen auf der Website. Zeilenumbrüche werden zu Leerzeichen."))));
    TEXTE.forEach(function (grp) {
      app.appendChild(h("section", { class: "card" }, h("h2", null, grp[0]),
        grp[1].map(function (f) {
          var count = h("span", { class: "count" });
          var upd = function (el) { count.textContent = el.value.length + " / " + f[2]; count.classList.toggle("is-over", el.value.length > f[2]); };
          var el = inp(state.inhalte, f[0], { maxlength: f[2], multiline: f[2] > 120, rows: f[2] > 300 ? 4 : 2,
            oninput: function () { state.inhalte[f[0]] = this.value; upd(this); changed(); } });
          upd(el);
          return h("label", { class: "fld" }, h("span", null, f[1], count), el);
        })));
    });
  }

  /* =====================================================================
     Hinweis / Betriebsferien
     ===================================================================== */
  function renderHinweis() {
    var hw = state.hinweis;
    var preview = h("div", { class: "notice-preview" + (hw.aktiv ? "" : " is-off") }, h("p", null, hw.text || "Ihr Hinweistext erscheint hier."));
    var upd = function () { preview.firstChild.textContent = hw.text || "Ihr Hinweistext erscheint hier."; preview.classList.toggle("is-off", !hw.aktiv); };
    app.appendChild(h("div", { class: "pagehead" }, h("div", null, h("h1", null, "Hinweis"),
      h("p", { class: "muted" }, "Ein goldener Hinweis unten auf allen Seiten, z. B. für Betriebsferien, Feiertage oder eine Veranstaltung."))));
    app.appendChild(h("section", { class: "card" },
      h("label", { class: "switch" }, h("input", { type: "checkbox", checked: !!hw.aktiv, onchange: function () { hw.aktiv = this.checked; upd(); changed(); } }), h("span", null, "Hinweis auf der Website anzeigen")),
      h("label", { class: "fld" }, h("span", null, "Text"), inp(hw, "text", { maxlength: 200, placeholder: "z. B. Betriebsferien vom 2. bis 15. Januar. Ab 16. Januar sind wir wieder für Sie da.", oninput: function () { hw.text = this.value; upd(); changed(); } })),
      h("div", { class: "fld-row" },
        h("label", { class: "fld" }, h("span", null, "Geschlossen von"), inp(hw, "von", { type: "date", onchange: function () { hw.von = this.value; changed(); } })),
        h("label", { class: "fld" }, h("span", null, "bis einschließlich"), inp(hw, "bis", { type: "date", onchange: function () { hw.bis = this.value; changed(); } }))),
      h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!hw.geschlossen, onchange: function () { hw.geschlossen = this.checked; changed(); } }),
        h("span", null, "In diesem Zeitraum geschlossen. Die Anzeige „Jetzt geöffnet“ zeigt dann „Betriebsferien“.")),
      h("p", { class: "muted small" }, "Der Hinweis erscheint ab dem Speichern und verschwindet nach dem „bis“-Datum automatisch."),
      h("p", { class: "label" }, "Vorschau"), preview));
  }

  /* =====================================================================
     Statistik
     ===================================================================== */
  var statTage = 30;
  var SEITEN = { "/": "Startseite", "/speisekarte": "Speisekarte", "/ueber-uns": "Über uns", "/anfahrt": "Anfahrt & Kontakt", "/impressum": "Impressum", "/datenschutz": "Datenschutz" };
  function barList(obj, labels) {
    var keys = Object.keys(obj); var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; }).concat([1]));
    if (!keys.length) return h("p", { class: "muted" }, "Noch keine Daten.");
    return h("ul", { class: "barlist" }, keys.map(function (k) {
      var bar = h("span", { class: "barlist__bar" }); bar.style.width = (obj[k] / max * 100) + "%";
      return h("li", null, h("span", { class: "barlist__label" }, (labels && labels[k]) || k), h("span", { class: "barlist__val" }, obj[k].toLocaleString("de-DE")), bar);
    }));
  }
  function chart(tage) {
    var W = 900, H = 240, P = { l: 36, r: 8, t: 12, b: 28 };
    var max = Math.max.apply(null, tage.map(function (t) { return t.besucher; }).concat([4]));
    var nice = Math.ceil(max / 4) * 4; var n = tage.length; var bw = (W - P.l - P.r) / n;
    var ns = "http://www.w3.org/2000/svg"; var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "chart"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Besuche pro Tag, " + n + " Tage");
    var el = function (tag, a) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; };
    for (var g = 0; g <= 4; g++) {
      var y = P.t + (H - P.t - P.b) * (1 - g / 4);
      svg.appendChild(el("line", { x1: P.l, x2: W - P.r, y1: y, y2: y, class: "chart__grid" }));
      var tx = el("text", { x: P.l - 8, y: y + 4, class: "chart__axis", "text-anchor": "end" }); tx.textContent = String(nice * g / 4); svg.appendChild(tx);
    }
    var tip = h("div", { class: "chart__tip", hidden: true });
    var step = Math.ceil(n / 8);
    tage.forEach(function (t, i) {
      var bh = (H - P.t - P.b) * t.besucher / nice; var x = P.l + i * bw;
      var gap = Math.min(2, bw * 0.15);
      var r = el("rect", { x: x + gap / 2, y: H - P.b - bh, width: Math.max(1, bw - gap), height: Math.max(bh, t.besucher ? 2 : 0), rx: Math.min(4, bw / 4), class: "chart__bar" });
      svg.appendChild(r);
      var hit = el("rect", { x: x, y: P.t, width: bw, height: H - P.t - P.b, class: "chart__hit" });
      hit.addEventListener("mouseenter", function (ev) {
        r.classList.add("is-hover"); tip.hidden = false;
        tip.textContent = ""; tip.appendChild(h("strong", null, fmtTag(t.tag))); tip.appendChild(h("span", null, t.besucher + " Besuche · " + t.aufrufe + " Aufrufe"));
        tip.style.left = ((x + bw / 2) / W * 100) + "%";
      });
      hit.addEventListener("mouseleave", function () { r.classList.remove("is-hover"); tip.hidden = true; });
      svg.appendChild(hit);
      if (i % step === 0 || (i === n - 1 && i % step >= step / 2)) {
        var lt = el("text", { x: x + bw / 2, y: H - 8, class: "chart__axis", "text-anchor": "middle" });
        lt.textContent = new Date(t.tag + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); svg.appendChild(lt);
      }
    });
    var table = h("details", { class: "chart__table" }, h("summary", null, "Als Tabelle anzeigen"),
      h("table", null, h("thead", null, h("tr", null, h("th", null, "Tag"), h("th", null, "Besuche"), h("th", null, "Seitenaufrufe"))),
        h("tbody", null, tage.slice().reverse().map(function (t) { return h("tr", null, h("td", null, fmtTag(t.tag)), h("td", null, String(t.besucher)), h("td", null, String(t.aufrufe))); }))));
    return h("div", { class: "chart-wrap" }, svg, tip, table);
  }
  function renderStatistik() {
    var noTrack = false; try { noTrack = localStorage.getItem("hk-nicht-zaehlen") === "1"; } catch (e) {}
    var body = h("div", { class: "stat-body" }, h("p", { class: "muted" }, "Lädt …"));
    app.appendChild(h("div", { class: "pagehead" }, h("div", null, h("h1", null, "Statistik"),
      h("p", { class: "muted" }, "Besuche der Website, ohne Cookies und ohne Drittanbieter gezählt.")),
      h("div", { class: "pills", role: "group", "aria-label": "Zeitraum" }, [[7, "7 Tage"], [30, "30 Tage"], [90, "90 Tage"], [365, "1 Jahr"]].map(function (o) {
        return h("button", { type: "button", "aria-pressed": statTage === o[0] ? "true" : "false", onclick: function () { statTage = o[0]; render(); } }, o[1]);
      }))));
    app.appendChild(body);
    app.appendChild(h("section", { class: "card card--quiet" },
      h("label", { class: "switch" }, h("input", { type: "checkbox", checked: noTrack, onchange: function () { try { localStorage.setItem("hk-nicht-zaehlen", this.checked ? "1" : "0"); } catch (e) {} toast(this.checked ? "Dieser Browser wird nicht mehr mitgezählt." : "Dieser Browser wird wieder mitgezählt."); } }),
        h("span", null, "Meine eigenen Besuche in diesem Browser nicht mitzählen")),
      h("p", { class: "muted small" }, "Ein „Besuch“ ist ein Gerät pro Tag. Gespeichert werden nur Tagessummen, keine IP-Adressen und keine Cookies.")));
    api({ aktion: "statistik", tage: statTage }).then(function (d) {
      body.textContent = "";
      var s = d.summe, avg = Math.round(s.besucher / statTage), heute = d.tage[d.tage.length - 1];
      var diff = d.vorher ? Math.round((s.besucher - d.vorher) / d.vorher * 100) : null;
      var tile = function (label, val, sub, subCls) { return h("div", { class: "kpi" }, h("span", { class: "kpi__label" }, label), h("span", { class: "kpi__val" }, val), sub && h("span", { class: "kpi__sub " + (subCls || "") }, sub)); };
      body.appendChild(h("div", { class: "kpis" },
        tile("Besuche", s.besucher.toLocaleString("de-DE"), diff === null ? "kein Vergleich" : (diff >= 0 ? "▲ " : "▼ ") + Math.abs(diff) + " % zum Zeitraum davor", diff === null ? "" : diff >= 0 ? "is-up" : "is-down"),
        tile("Seitenaufrufe", s.aufrufe.toLocaleString("de-DE"), s.besucher ? (s.aufrufe / s.besucher).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Seiten pro Besuch" : ""),
        tile("Ø pro Tag", avg.toLocaleString("de-DE"), "Besuche"),
        tile("Heute", String(heute.besucher), heute.aufrufe + " Seitenaufrufe")));
      body.appendChild(h("section", { class: "card" }, h("h2", null, "Besuche pro Tag"), chart(d.tage)));
      body.appendChild(h("div", { class: "grid3" },
        h("section", { class: "card" }, h("h2", null, "Beliebteste Seiten"), barList(d.seiten, SEITEN)),
        h("section", { class: "card" }, h("h2", null, "Woher die Besucher kommen"), barList(d.herkunft)),
        h("section", { class: "card" }, h("h2", null, "Geräte"), barList(d.geraete))));
    }).catch(function (e) { body.textContent = ""; body.appendChild(h("p", { class: "msg msg--err" }, e.message)); });
  }

  /* =====================================================================
     Verlauf
     ===================================================================== */
  var ART = { speisekarte: "Speisekarte", inhalte: "Texte", hinweis: "Hinweis" };
  function renderVerlauf() {
    var list = h("div", null, h("p", { class: "muted" }, "Lädt …"));
    app.appendChild(h("div", { class: "pagehead" }, h("div", null, h("h1", null, "Verlauf"),
      h("p", { class: "muted" }, "Vor jedem Speichern wird der alte Stand gesichert. Hier lässt er sich zurückholen."))));
    app.appendChild(list);
    api({ aktion: "verlauf" }).then(function (d) {
      list.textContent = "";
      if (!d.eintraege.length) { list.appendChild(h("p", { class: "muted" }, "Noch keine Sicherungen vorhanden.")); return; }
      list.appendChild(h("ul", { class: "history card" }, d.eintraege.map(function (v) {
        var dt = new Date(v.zeit.replace(" ", "T"));
        return h("li", null,
          h("span", { class: "tag tag--" + v.art }, ART[v.art]),
          h("span", { class: "history__when" }, "Stand vor der Änderung vom " + dt.toLocaleDateString("de-DE") + ", " + dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr"),
          v.von && h("span", { class: "muted small" }, "geändert von " + v.von),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: function () {
            if (dirtyKeys().length) { toast("Bitte zuerst speichern oder verwerfen.", true); return; }
            if (!confirm(ART[v.art] + " auf diesen Stand zurücksetzen? Der aktuelle Stand wird vorher gesichert.")) return;
            api({ aktion: "wiederherstellen", datei: v.datei }).then(function () { toast("Wiederhergestellt."); setTimeout(function () { location.reload(); }, 900); })
              .catch(function (e) { toast(e.message, true); });
          } }, "Wiederherstellen"));
      })));
    }).catch(function (e) { list.textContent = ""; list.appendChild(h("p", { class: "msg msg--err" }, e.message)); });
  }

  /* =====================================================================
     Testversion (GitHub-Vorschau): speichert nur im Browser, Beispiel-Statistik
     ===================================================================== */
  function demoApi(d) {
    var hist = function () { try { return JSON.parse(localStorage.getItem("hk-demo-verlauf") || "[]"); } catch (e) { return []; } };
    var put = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    if (KEYS.indexOf(d.aktion) > -1) {
      if (d.aktion === "speisekarte") {
        var all = [d.daten.getraenke].concat(d.daten.karten);
        all.forEach(function (k) { k.bereiche.forEach(function (b) { b.spalten.forEach(function (s) { s.forEach(function (g) { g.gerichte.forEach(function (x) {
          if (!x.name) throw new Error("Ein Gericht hat keinen Namen.");
          if (!/^\d{1,3},\d{2}$/.test(x.preis)) throw new Error("Preis bei „" + x.name + "“ bitte im Format 12,90 angeben.");
        }); }); }); }); });
      }
      var h = hist(); h.unshift({ datei: String(Date.now()), art: d.aktion, zeit: new Date().toISOString().slice(0, 16).replace("T", " "), von: "test", daten: saved[d.aktion] });
      put("hk-demo-verlauf", h.slice(0, 30)); put("hk-demo-" + d.aktion, d.daten);
      return { ok: true };
    }
    if (d.aktion === "verlauf") return { eintraege: hist() };
    if (d.aktion === "wiederherstellen") {
      var e = hist().filter(function (x) { return x.datei === d.datei; })[0];
      if (!e) throw new Error("Sicherung nicht gefunden.");
      put("hk-demo-" + e.art, e.daten); return { ok: true };
    }
    if (d.aktion === "statistik") {
      var tage = [], seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      var s = { besucher: 0, aufrufe: 0 }, prev = 0;
      for (var i = d.tage * 2 - 1; i >= 0; i--) {
        var dt = new Date(); dt.setDate(dt.getDate() - i);
        var b = Math.round([20, 45, 40, 42, 38, 60, 75][(dt.getDay() + 6) % 7] * (0.7 + rnd() * 0.6)), a = Math.round(b * (1.6 + rnd() * 0.8));
        if (i === 0) { b = Math.round(b * 0.4); a = Math.round(a * 0.4); }
        if (i >= d.tage) { prev += b; continue; }
        tage.push({ tag: dt.toISOString().slice(0, 10), besucher: b, aufrufe: a }); s.besucher += b; s.aufrufe += a;
      }
      var p = function (f) { return Math.round(s.besucher * f); };
      return { tage: tage, summe: s, vorher: prev,
        seiten: { "/": p(0.85), "/speisekarte": p(0.66), "/anfahrt": p(0.22), "/ueber-uns": p(0.11), "/impressum": p(0.02) },
        herkunft: { Google: p(0.55), Direkt: p(0.3), Facebook: p(0.08), Instagram: p(0.04) },
        geraete: { Smartphone: p(0.68), Computer: p(0.27), Tablet: p(0.05) } };
    }
    throw new Error("Unbekannte Aktion.");
  }
  if (DEMO) {
    var note = h("div", { class: "demo-note" },
      h("p", null, h("strong", null, "Testversion. "), "Änderungen werden nur in diesem Browser gespeichert und erscheinen nicht auf der Website. Die Statistik zeigt Beispieldaten."),
      h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: function () {
        if (!confirm("Alle Teständerungen löschen und neu beginnen?")) return;
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("hk-demo-") === 0) localStorage.removeItem(k); }); } catch (e) {}
        location.reload();
      } }, "Testdaten zurücksetzen"));
    app.parentNode.insertBefore(note, app);
  }

  render();
})();
