// Gasthof Hühnerkirche — bewusst minimal (Performance/INP). Kein Framework.
(function () {
  var doc = document;
  doc.documentElement.classList.add("js");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Jahr im Footer ---------- */
  var year = String(new Date().getFullYear());
  Array.prototype.forEach.call(doc.querySelectorAll(".jahr"), function (el) { el.textContent = year; });

  /* ---------- Live-Öffnungsstatus ---------- */
  // Öffnungstage (0 = So) und Startzeiten. Ende wird nicht angezeigt, intern aber gebraucht:
  // ponytail: Ende Mittag 14:30 / Abend 22:00 angenommen, hier anpassen, falls Küche anders schließt
  var OPEN_DAYS = [0, 2, 3, 4, 6];
  var SLOTS = [[12 * 60, 14 * 60 + 30], [17 * 60, 22 * 60]];
  var DAYNAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var hhmm = function (m) { return Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2) + " Uhr"; };
  var berlinNow = function () {
    // Immer deutsche Zeit, auch wenn jemand aus einer anderen Zeitzone schaut
    var p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: +p.hour * 60 + +p.minute };
  };
  var openStatus = function (now) {
    var openToday = OPEN_DAYS.indexOf(now.day) > -1;
    if (openToday) {
      for (var i = 0; i < SLOTS.length; i++) {
        if (now.min >= SLOTS[i][0] && now.min < SLOTS[i][1]) return { open: true, text: "Jetzt geöffnet" };
        if (now.min < SLOTS[i][0]) return { open: false, text: (i ? "Mittagspause · wieder ab " : "Heute ab ") + hhmm(SLOTS[i][0]) + (i ? "" : " geöffnet") };
      }
    }
    for (var d = 1; d <= 7; d++) {
      var next = (now.day + d) % 7;
      if (OPEN_DAYS.indexOf(next) > -1) {
        var when = d === 1 ? "morgen" : DAYNAMES[next];
        return { open: false, text: (openToday ? "Geschlossen" : "Heute Ruhetag") + " · " + when + " ab " + hhmm(SLOTS[0][0]) };
      }
    }
  };
  var statusEls = doc.querySelectorAll("[data-open-status]");
  var renderStatus = function () {
    var now = berlinNow(), s = openStatus(now);
    Array.prototype.forEach.call(statusEls, function (el) {
      el.textContent = s.text;
      el.dataset.state = s.open ? "open" : "closed";
      el.hidden = false;
    });
    Array.prototype.forEach.call(doc.querySelectorAll(".hours tr[data-days]"), function (tr) {
      tr.toggleAttribute("data-today", tr.dataset.days.split(" ").indexOf(String(now.day)) > -1);
    });
  };
  if (statusEls.length) { renderStatus(); setInterval(renderStatus, 60000); }

  /* ---------- Speisekarten-Filter ---------- */
  var filter = doc.querySelector(".menu-filter");
  if (filter) {
    var chips = Array.prototype.slice.call(filter.querySelectorAll("button"));
    var show = function (id) {
      chips.forEach(function (b) {
        var on = b.getAttribute("aria-controls") === id;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        doc.getElementById(b.getAttribute("aria-controls")).hidden = !on;
      });
    };
    chips.forEach(function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("aria-controls")); });
    });
    // Passende Karte vorwählen: mittags (vor 17 Uhr) Mittagstisch, sonst Abendkarte
    // ponytail: Samstag zählt vorerst als werktags (mit Kunde klären)
    var t = berlinNow();
    var pick = t.min < SLOTS[1][0] ? (t.day === 0 ? "karte-mittag-sonntags" : "karte-mittag-werktags") : "karte-abend";
    show(doc.querySelector("#" + pick + " .dish") ? pick : "karte-abend"); // leere Karte nicht vorwählen
    filter.hidden = false;
  }

  /* ---------- Mobile-Navigation ---------- */
  var btn = doc.querySelector(".nav-toggle");
  var menu = doc.getElementById("nav-menu");
  if (btn && menu) {
    var setOpen = function (open) {
      menu.dataset.open = open ? "true" : "false";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    };
    btn.addEventListener("click", function () { setOpen(menu.dataset.open !== "true"); });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.dataset.open === "true") { setOpen(false); btn.focus(); }
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
  }

  /* ---------- Galerie-Lightbox (mit Fokus-Falle) ---------- */
  var gimgs = Array.prototype.slice.call(doc.querySelectorAll(".gallery img"));
  if (gimgs.length) {
    var lb = doc.createElement("div");
    lb.className = "lightbox";
    lb.hidden = true;
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Bildansicht");
    lb.innerHTML = '<button class="lightbox__close" type="button" aria-label="Schließen">×</button><img alt="">';
    doc.body.appendChild(lb);
    var lbImg = lb.querySelector("img");
    var closeBtn = lb.querySelector(".lightbox__close");
    var lastFocus = null;
    var setInert = function (on) {
      Array.prototype.forEach.call(doc.body.children, function (el) {
        if (el === lb) return;
        if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
        else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
      });
    };
    var full = function (img) {
      return (img.currentSrc || img.src).replace(/-(480|800|1280)\.(webp|avif|jpg)/, "-1280.$2");
    };
    var open = function (img) {
      lastFocus = doc.activeElement;
      lbImg.src = full(img); lbImg.alt = img.alt || "";
      lb.hidden = false; doc.body.style.overflow = "hidden";
      setInert(true); closeBtn.focus();
    };
    var close = function () {
      lb.hidden = true; lbImg.src = ""; doc.body.style.overflow = "";
      setInert(false); if (lastFocus) lastFocus.focus();
    };
    gimgs.forEach(function (img) {
      img.classList.add("is-zoomable");
      img.tabIndex = 0; img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Bild vergrößern: " + (img.alt || ""));
      img.addEventListener("click", function () { open(img); });
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(img); }
      });
    });
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target === closeBtn) close();
    });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) close(); });
  }

  /* ---------- Nach-oben-Button ---------- */
  var toTop = doc.createElement("button");
  toTop.type = "button";
  toTop.className = "to-top";
  toTop.setAttribute("aria-label", "Nach oben");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  doc.body.appendChild(toTop);
  toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  var onScroll = function () { toTop.classList.toggle("is-visible", window.scrollY > 700); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
