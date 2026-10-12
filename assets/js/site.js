// Gasthof Hühnerkirche — bewusst minimal (Performance/INP). Kein Framework.
(function () {
  var doc = document;
  doc.documentElement.classList.add("js");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Jahr im Footer ---------- */
  var year = String(new Date().getFullYear());
  Array.prototype.forEach.call(doc.querySelectorAll(".jahr"), function (el) { el.textContent = year; });

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

  /* ---------- Scroll-Reveal (sanftes Einblenden) ---------- */
  var revealSel = ".section-center, main .figure, .feature, .gallery img, .infocard, .menu-group";
  var targets = Array.prototype.slice.call(doc.querySelectorAll(revealSel));
  if (targets.length) {
    if (reduce || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("reveal", "is-visible"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      targets.forEach(function (el) {
        el.classList.add("reveal");
        // Above-the-fold (z. B. Seitenkopf/H1) sofort zeigen -> kein LCP-Delay
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
          el.classList.add("is-visible");
          return;
        }
        if (el.matches(".feature, .infocard, .gallery img")) {
          var sibs = el.parentElement.children;
          var idx = Array.prototype.indexOf.call(sibs, el);
          el.style.transitionDelay = Math.min(idx, 4) * 0.08 + "s";
        }
        io.observe(el);
      });
    }
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
