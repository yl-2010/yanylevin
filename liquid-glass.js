/**
 * Apple Liquid Glass — visible backdrop refraction.
 *
 * Chromium: backdrop-filter: blur() url(#svg-displacement)
 * Everywhere else: backdrop blur + filter:url() on the frosted layer
 * (warps the captured backdrop; weaker but still visible).
 *
 * Physics bevel maps (archis-style) when Chromium supports SVG backdrop filters;
 * feTurbulence displacement as a guaranteed visible warp fallback.
 */
(() => {
  const SIZE = 112;

  // Aggressive enough that edge bend is obvious over text/photo
  const CONFIG = {
    glassThickness: 90,
    bezelWidth: 52,
    ior: 2.2,
    scaleRatio: 1.35,
    blurAmt: 0.35,
    specOpacity: 0.5,
    specSat: 4,
    tintOpacity: 0.08,
    turbulenceScale: 72,
  };

  const SURFACE = {
    convexSquircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25),
    convexCircle: (x) => Math.sqrt(1 - (1 - x) * (1 - x)),
  };

  function supportsSvgBackdropFilter() {
    // Safari accepts the CSSOM string but does not render SVG reference filters
    // on backdrop-filter. Detect Chromium-ish engines only.
    const ua = navigator.userAgent;
    const isSafari =
      /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua);
    if (isSafari) return false;

    const el = document.createElement("div");
    el.style.cssText = "backdrop-filter: url(#test)";
    const accepted =
      el.style.backdropFilter === "url(#test)" ||
      el.style.backdropFilter === 'url("#test")';
    return accepted && !isSafari;
  }

  function calculateRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples) {
    samples = samples || 128;
    const eta = 1 / ior;
    const profile = new Float64Array(samples);

    const refract = (nx, ny) => {
      const dot = ny;
      const k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      const sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    };

    for (let i = 0; i < samples; i++) {
      const x = i / samples;
      const y = heightFn(x);
      const dx = x < 1 ? 0.0001 : -0.0001;
      const y2 = heightFn(x + dx);
      const deriv = (y2 - y) / dx;
      const mag = Math.sqrt(deriv * deriv + 1);
      const ref = refract(-deriv / mag, -1 / mag);
      if (!ref) {
        profile[i] = 0;
        continue;
      }
      profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
    }
    return profile;
  }

  function generateRoundDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2;
    const hB = h - r * 2;
    const S = profile.length;

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op =
          dSq < rSq
            ? 1
            : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = y / dist;
        const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
        const disp = profile[bi] || 0;
        const dX = (-cos * disp) / maxDisp;
        const dY = (-sin * disp) / maxDisp;
        const idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * op + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function generateSquircleDisplacementMap(w, h, bezelWidth, profile, maxDisp, n) {
    n = n || 5;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }

    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const ax = w / 2;
    const ay = h / 2;
    const S = profile.length;
    const eps = 1e-6;

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const nx = (x1 - cx) / ax;
        const ny = (y1 - cy) / ay;
        const rho = Math.pow(Math.abs(nx), n) + Math.pow(Math.abs(ny), n);
        if (rho < eps) continue;

        const r = Math.pow(rho, 1 / n);
        const distFromEdge = (1 - r) * Math.min(ax, ay);
        if (distFromEdge < 0 || distFromEdge > bezelWidth) continue;

        const gx =
          (n * Math.pow(Math.abs(nx) + eps, n - 1) * Math.sign(nx || 1)) / ax;
        const gy =
          (n * Math.pow(Math.abs(ny) + eps, n - 1) * Math.sign(ny || 1)) / ay;
        const gMag = Math.sqrt(gx * gx + gy * gy) || 1;
        const cos = gx / gMag;
        const sin = gy / gMag;

        const t = distFromEdge / bezelWidth;
        const fade = Math.min(1, Math.max(0, t < 0.08 ? t / 0.08 : 1));
        const bi = Math.min((t * S) | 0, S - 1);
        const disp = profile[bi] || 0;
        const dX = (-cos * disp) / maxDisp;
        const dY = (-sin * disp) / maxDisp;
        const idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * fade + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * fade + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function generateRoundSpecularMap(w, h, radius, bezelWidth, angle) {
    angle = angle != null ? angle : Math.PI / 3;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    d.fill(0);

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2;
    const hB = h - r * 2;
    const sv = [Math.cos(angle), Math.sin(angle)];

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op =
          dSq < rSq
            ? 1
            : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = -y / dist;
        const dot = Math.abs(cos * sv[0] + sin * sv[1]);
        const edge = Math.sqrt(
          Math.max(0, 1 - (1 - fromSide / Math.max(bezelWidth, 1)) ** 2)
        );
        const coeff = dot * edge;
        const col = (255 * coeff) | 0;
        const alpha = (col * coeff * op) | 0;
        const idx = (y1 * w + x1) * 4;
        d[idx] = col;
        d[idx + 1] = col;
        d[idx + 2] = col;
        d[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function generateSquircleSpecularMap(w, h, bezelWidth, angle, n) {
    angle = angle != null ? angle : Math.PI / 3;
    n = n || 5;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    d.fill(0);

    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const ax = w / 2;
    const ay = h / 2;
    const sv = [Math.cos(angle), Math.sin(angle)];
    const eps = 1e-6;

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const nx = (x1 - cx) / ax;
        const ny = (y1 - cy) / ay;
        const rho = Math.pow(Math.abs(nx), n) + Math.pow(Math.abs(ny), n);
        if (rho < eps) continue;
        const r = Math.pow(rho, 1 / n);
        const distFromEdge = (1 - r) * Math.min(ax, ay);
        if (distFromEdge < 0 || distFromEdge > bezelWidth) continue;

        const gx =
          (n * Math.pow(Math.abs(nx) + eps, n - 1) * Math.sign(nx || 1)) / ax;
        const gy =
          (n * Math.pow(Math.abs(ny) + eps, n - 1) * Math.sign(ny || 1)) / ay;
        const gMag = Math.sqrt(gx * gx + gy * gy) || 1;
        const cos = gx / gMag;
        const sin = -gy / gMag;
        const fromSide = distFromEdge;
        const op = Math.min(1, fromSide / 2);
        const dot = Math.abs(cos * sv[0] + sin * sv[1]);
        const edge = Math.sqrt(
          Math.max(0, 1 - (1 - fromSide / bezelWidth) ** 2)
        );
        const coeff = dot * edge;
        const col = (255 * coeff) | 0;
        const alpha = (col * coeff * op) | 0;
        const idx = (y1 * w + x1) * 4;
        d[idx] = col;
        d[idx + 1] = col;
        d[idx + 2] = col;
        d[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function ensureBaseFilters(defs) {
    if (document.getElementById("lg-turbulence-distort")) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const filter = document.createElementNS(svgNS, "filter");
    filter.setAttribute("id", "lg-turbulence-distort");
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.innerHTML = `
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03"
        numOctaves="2" seed="7" result="noise" />
      <feGaussianBlur in="noise" stdDeviation="1.2" result="soft" />
      <feDisplacementMap in="SourceGraphic" in2="soft"
        scale="${CONFIG.turbulenceScale}"
        xChannelSelector="R" yChannelSelector="G" />
    `;
    defs.appendChild(filter);
  }

  function setFilterMarkup(defs, id, markup) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    // Parse in an SVG context so filter primitives are real SVG nodes
    const svgNS = "http://www.w3.org/2000/svg";
    const holder = document.createElementNS(svgNS, "svg");
    holder.innerHTML = markup;
    const node = holder.querySelector("filter");
    if (node) defs.appendChild(node);
  }

  function buildPhysicsFilter(id, w, h, dispUrl, specUrl, blurAmt, scale, specOpacity, specSat) {
    return `
      <filter id="${id}" x="-15%" y="-15%" width="130%" height="130%"
        color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blurAmt}" result="blurred_source" />
        <feImage href="${dispUrl}" x="0" y="0" width="${w}" height="${h}"
          result="disp_map" preserveAspectRatio="none" />
        <feDisplacementMap in="blurred_source" in2="disp_map"
          scale="${scale}" xChannelSelector="R" yChannelSelector="G"
          result="displaced" />
        <feColorMatrix in="displaced" type="saturate" values="${specSat}" result="displaced_sat" />
        <feImage href="${specUrl}" x="0" y="0" width="${w}" height="${h}"
          result="spec_layer" preserveAspectRatio="none" />
        <feComposite in="displaced_sat" in2="spec_layer" operator="in" result="spec_masked" />
        <feComponentTransfer in="spec_layer" result="spec_faded">
          <feFuncA type="linear" slope="${specOpacity}" />
        </feComponentTransfer>
        <feBlend in="spec_masked" in2="displaced" mode="normal" result="with_sat" />
        <feBlend in="spec_faded" in2="with_sat" mode="normal" />
      </filter>`;
  }

  function initOrb(el, opts) {
    const filterId = opts.filterId;
    const shape = opts.shape;
    const useSvgBackdrop = opts.useSvgBackdrop;
    const w = Math.max(2, Math.round(el.offsetWidth || SIZE));
    const h = Math.max(2, Math.round(el.offsetHeight || SIZE));
    const radius =
      shape === "circle" ? Math.min(w, h) / 2 : Math.min(w, h) * 0.34;

    const heightFn =
      shape === "circle" ? SURFACE.convexCircle : SURFACE.convexSquircle;
    const bezel = Math.min(
      CONFIG.bezelWidth,
      Math.max(2, radius - 1),
      Math.min(w, h) / 2 - 1
    );

    const profile = calculateRefractionProfile(
      CONFIG.glassThickness,
      bezel,
      heightFn,
      CONFIG.ior,
      128
    );
    const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
    const scale = Math.max(28, maxDisp * CONFIG.scaleRatio);

    let dispUrl;
    let specUrl;
    if (shape === "squircle") {
      dispUrl = generateSquircleDisplacementMap(w, h, bezel, profile, maxDisp, 5);
      specUrl = generateSquircleSpecularMap(w, h, bezel * 2.5, Math.PI / 3, 5);
    } else {
      dispUrl = generateRoundDisplacementMap(w, h, radius, bezel, profile, maxDisp);
      specUrl = generateRoundSpecularMap(w, h, radius, bezel * 2.5);
    }

    const defs = document.getElementById("liquid-glass-defs");
    if (!defs) return;
    ensureBaseFilters(defs);

    setFilterMarkup(
      defs,
      filterId,
      buildPhysicsFilter(
        filterId,
        w,
        h,
        dispUrl,
        specUrl,
        CONFIG.blurAmt,
        scale,
        CONFIG.specOpacity,
        CONFIG.specSat
      )
    );

    const effect = el.querySelector(".lg-effect");
    if (!effect) return;

    // Reset previous inline filters
    effect.style.backdropFilter = "";
    effect.style.webkitBackdropFilter = "";
    effect.style.filter = "";

    if (useSvgBackdrop) {
      el.classList.add("lg-refraction");
      el.classList.remove("lg-fallback");
      // Chromium: warp the real page backdrop
      const bf = `blur(1.5px) url(#${filterId}) saturate(1.35) brightness(1.06)`;
      effect.style.backdropFilter = bf;
      effect.style.webkitBackdropFilter = bf;
    } else {
      el.classList.add("lg-fallback");
      el.classList.remove("lg-refraction");
      // Capture backdrop, then displace that bitmap with filter:url
      // (works in Safari/Firefox — warping is of the frosted snapshot)
      const bf = "blur(14px) saturate(170%) brightness(1.08)";
      effect.style.backdropFilter = bf;
      effect.style.webkitBackdropFilter = bf;
      effect.style.filter = "url(#lg-turbulence-distort)";
    }
  }

  function initAll() {
    const orbs = document.querySelectorAll("[data-liquid-glass]");
    if (!orbs.length) return;

    const useSvgBackdrop = supportsSvgBackdropFilter();
    document.documentElement.style.setProperty(
      "--lg-tint-opacity",
      String(CONFIG.tintOpacity)
    );
    document.documentElement.classList.toggle("lg-chrome", useSvgBackdrop);

    orbs.forEach((el) => {
      const shape = el.getAttribute("data-liquid-glass") || "circle";
      const filterId =
        el.getAttribute("data-filter-id") ||
        `lg-filter-${shape}-${Math.random().toString(36).slice(2, 7)}`;
      el.setAttribute("data-filter-id", filterId);
      initOrb(el, { shape, filterId, useSvgBackdrop });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      requestAnimationFrame(() => requestAnimationFrame(initAll));
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(initAll));
  }

  window.addEventListener(
    "resize",
    (() => {
      let t;
      return () => {
        clearTimeout(t);
        t = setTimeout(initAll, 180);
      };
    })()
  );
})();
