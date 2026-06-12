/* ============================================================
   app.js
   Main application logic: navigation, prediction, contour maps,
   sensitivity charts, reverse lookup, binder comparison.
   Depends on: equations.js (MODELS, predictSL, clampSCM, etc.)
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     NAVIGATION
     ---------------------------------------------------------- */
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.tab-panel');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menuToggle');

  const TAB_META = {
    predict:    { title: 'Service life prediction', subtitle: 'Estimate corrosion-induced service life for a given mix design' },
    contour:    { title: 'Contour maps', subtitle: 'Service life across the cover depth \u2013 w/b design space' },
    sensitivity:{ title: 'Sensitivity analysis', subtitle: 'Response of predicted service life to individual design variables' },
    reverse:    { title: 'Design lookup', subtitle: 'Identify mix designs that satisfy a target service life' },
    compare:    { title: 'Binder comparison', subtitle: 'Compare predicted service life across binder systems for a fixed mix' },
    about:      { title: 'Documentation', subtitle: 'Model basis, validation statistics and scope of application' }
  };

  function activateTab(tab) {
    navItems.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
    const meta = TAB_META[tab];
    if (meta) {
      pageTitle.textContent = meta.title;
      pageSubtitle.textContent = meta.subtitle;
    }
    if (tab === 'contour') renderContour();
    if (tab === 'sensitivity') renderSensitivity();
    if (tab === 'compare') renderCompare();
    if (tab === 'about') renderAbout();
    sidebar.classList.remove('open');
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

  /* ----------------------------------------------------------
     PREDICTION TAB
     ---------------------------------------------------------- */
  const binderSel = document.getElementById('binder');
  const coverInput = document.getElementById('cover');
  const wbInput = document.getElementById('wb');
  const scmInput = document.getElementById('scm');
  const scmField = document.getElementById('scm-field');
  const scmLabel = document.getElementById('scm-label');
  const scmMinLbl = document.getElementById('scm-min');
  const scmMaxLbl = document.getElementById('scm-max');

  function onBinderChange() {
    const m = MODELS[binderSel.value];
    if (m.scm) {
      scmField.hidden = false;
      scmLabel.textContent = m.scm.label;
      scmInput.min = m.scm.min;
      scmInput.max = m.scm.max;
      scmInput.step = m.scm.step;
      scmInput.value = m.scm.def;
      scmMinLbl.textContent = m.scm.min + '%';
      scmMaxLbl.textContent = m.scm.max + '%';
    } else {
      scmField.hidden = true;
    }
    updatePrediction();
  }

  function updatePrediction() {
    const binder = binderSel.value;
    const m = MODELS[binder];
    const C = parseFloat(coverInput.value);
    const W = parseFloat(wbInput.value);
    const S = m.scm ? parseFloat(scmInput.value) : null;

    document.getElementById('cover-out').textContent = C + ' mm';
    document.getElementById('wb-out').textContent = W.toFixed(2);
    if (m.scm) document.getElementById('scm-out').textContent = S + '%';

    const sl = predictSL(binder, C, W, S);
    document.getElementById('sl-value').textContent = sl.toFixed(1);

    // Status badge
    let label, cls;
    if (sl >= 75) { label = 'Meets 75-year design life'; cls = 'badge-pass'; }
    else if (sl >= 50) { label = 'Meets 50-year design life'; cls = 'badge-pass'; }
    else if (sl >= 25) { label = 'Meets 25-year design life'; cls = 'badge-warn'; }
    else { label = 'Below 25-year design life \u2014 review mix design'; cls = 'badge-fail'; }
    document.getElementById('sl-status').innerHTML =
      `<span class="badge ${cls}">${label}</span>`;

    // Compliance table
    const tbody = document.querySelector('#compliance-table tbody');
    tbody.innerHTML = DESIGN_LIFE_TARGETS.map(dl => {
      const ok = sl >= dl;
      const margin = (sl - dl).toFixed(1);
      const sign = ok ? '+' : '';
      return `<tr>
        <td>${dl} years</td>
        <td><span class="badge ${ok ? 'badge-pass' : 'badge-fail'}">${ok ? 'Satisfied' : 'Not met'}</span></td>
        <td class="${ok ? '' : 'danger-text'}" style="color:${ok ? 'var(--success-text)' : 'var(--danger-text)'}; font-family:var(--font-mono)">${sign}${margin} yr</td>
      </tr>`;
    }).join('');

    // Model spec
    document.getElementById('model-spec').innerHTML = `
      <dt>Binder system</dt><dd>${m.name} \u2014 ${m.fullName}</dd>
      <dt>Model form</dt><dd>${m.form}</dd>
      <dt>R\u00B2 (training)</dt><dd>${m.r2train.toFixed(4)}</dd>
      <dt>R\u00B2 (validation)</dt><dd>${m.r2val.toFixed(4)}</dd>
      <dt>RMSE (validation)</dt><dd>${m.rmse.toFixed(2)} yr</dd>
      <dt>MAPE (validation)</dt><dd>${m.mape.toFixed(2)}%</dd>
    `;
    document.getElementById('model-eq').textContent = m.eq;
  }

  binderSel.addEventListener('change', onBinderChange);
  coverInput.addEventListener('input', updatePrediction);
  wbInput.addEventListener('input', updatePrediction);
  scmInput.addEventListener('input', updatePrediction);

  document.getElementById('downloadPdf').addEventListener('click', () => {
    const binder = binderSel.value;
    const m = MODELS[binder];
    const C = parseFloat(coverInput.value);
    const W = parseFloat(wbInput.value);
    const S = m.scm ? parseFloat(scmInput.value) : null;
    generateServiceLifeReport({ binder, C, W, S, sl: predictSL(binder, C, W, S) });
  });

  /* ----------------------------------------------------------
     CONTOUR MAP TAB
     ---------------------------------------------------------- */
  const cBinder = document.getElementById('c-binder');
  const cScmField = document.getElementById('c-scm-field');
  const cScm = document.getElementById('c-scm');
  const cScmLabel = document.getElementById('c-scm-label');
  const cScmOut = document.getElementById('c-scm-out');

  // 10 visually distinct discrete bands: purple -> blue -> sky -> cyan -> green
  // -> yellow-green -> yellow -> orange -> red -> dark red
  function bandColor(idx, total) {
    const palette = [
      [106, 13, 173],  // purple
      [30, 64, 220],   // blue
      [0, 150, 255],   // sky blue
      [0, 210, 230],   // cyan
      [0, 180, 90],    // green
      [150, 215, 0],   // yellow-green
      [255, 221, 0],   // yellow
      [255, 140, 0],   // orange
      [230, 50, 30],   // red
      [150, 0, 0]      // dark red
    ];
    if (total <= 1) return palette[0];
    const idx10 = Math.round(idx / (total - 1) * (palette.length - 1));
    return palette[Math.max(0, Math.min(palette.length - 1, idx10))];
  }

  function drawContour(canvas, binderKey, scmVal) {
    const m = MODELS[binderKey];
    const wrap = canvas.parentElement;
    const measuredW = wrap.getBoundingClientRect().width || wrap.offsetWidth;
    const cssW = Math.max(320, Math.floor(measuredW) || 900);
    const cssH = Math.round(cssW * 0.56);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = '100%';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // All subsequent drawing is in CSS-pixel units (cssW x cssH)
    const W_px = cssW, H_px = cssH;
    const padL = 64, padR = 90, padT = 24, padB = 60;
    const plotW = W_px - padL - padR;
    const plotH = H_px - padT - padB;

    const { min: W_min, max: W_max } = DESIGN_SPACE.wb;
    const { min: C_min, max: C_max } = DESIGN_SPACE.cover;
    const RES = 160; // sampling grid resolution (smooth per-pixel interpolation)

    const grid = [];
    let minSL = Infinity, maxSL = -Infinity;
    for (let ci = 0; ci < RES; ci++) {
      grid[ci] = new Float32Array(RES);
      const cv = C_min + ci * (C_max - C_min) / (RES - 1);
      for (let wi = 0; wi < RES; wi++) {
        const wv = W_min + wi * (W_max - W_min) / (RES - 1);
        const sl = m.predict(cv, wv, scmVal);
        grid[ci][wi] = sl;
        if (sl < minSL) minSL = sl;
        if (sl > maxSL) maxSL = sl;
      }
    }

    const range = maxSL - minSL;
    const step = range > 120 ? 25 : range > 60 ? 10 : 5;
    const levels = [];
    for (let l = Math.floor(minSL / step) * step; l <= Math.ceil(maxSL / step) * step + step; l += step) levels.push(l);
    const nBands = levels.length - 1;

    function getBand(sl) {
      for (let b = 0; b < nBands; b++) if (sl >= levels[b] && sl < levels[b + 1]) return b;
      return sl < levels[0] ? 0 : nBands - 1;
    }

    const xF = wv => padL + (wv - W_min) / (W_max - W_min) * plotW;
    const yF = cv => padT + (C_max - cv) / (C_max - C_min) * plotH;

    ctx.clearRect(0, 0, W_px, H_px);

    // Smooth per-pixel fill via bilinear interpolation of the sampled grid.
    // Build at device-pixel resolution for a crisp render, then draw scaled.
    const fillW = Math.round(plotW * dpr);
    const fillH = Math.round(plotH * dpr);
    const imgData = ctx.createImageData(fillW, fillH);
    for (let py = 0; py < fillH; py++) {
      const cf = 1 - py / (fillH - 1);          // 0 at bottom (C_min), 1 at top (C_max)
      const ci_f = cf * (RES - 1);
      const ci0 = Math.floor(ci_f), ci1 = Math.min(ci0 + 1, RES - 1);
      const fc = ci_f - ci0;
      for (let px = 0; px < fillW; px++) {
        const wf = px / (fillW - 1);
        const wi_f = wf * (RES - 1);
        const wi0 = Math.floor(wi_f), wi1 = Math.min(wi0 + 1, RES - 1);
        const fw = wi_f - wi0;
        const sl = grid[ci0][wi0] * (1 - fw) * (1 - fc) + grid[ci0][wi1] * fw * (1 - fc) +
                   grid[ci1][wi0] * (1 - fw) * fc       + grid[ci1][wi1] * fw * fc;
        const [r, g, b] = bandColor(getBand(sl), nBands);
        const idx = (py * fillW + px) * 4;
        imgData.data[idx] = r; imgData.data[idx + 1] = g; imgData.data[idx + 2] = b; imgData.data[idx + 3] = 255;
      }
    }
    // Draw the high-res image data into a temp canvas, then scale onto main canvas
    const tmp = document.createElement('canvas');
    tmp.width = fillW; tmp.height = fillH;
    tmp.getContext('2d').putImageData(imgData, 0, 0);
    ctx.drawImage(tmp, 0, 0, fillW, fillH, padL, padT, plotW, plotH);

    // Band boundary lines
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = 'rgba(20,20,30,0.25)';
    levels.slice(1, -1).forEach(lv => {
      for (let ci = 0; ci < RES - 1; ci++) {
        for (let wi = 0; wi < RES - 1; wi++) {
          const v00 = grid[ci][wi], v01 = grid[ci][wi + 1];
          const v10 = grid[ci + 1][wi], v11 = grid[ci + 1][wi + 1];
          const W0 = W_min + wi * (W_max - W_min) / (RES - 1), W1 = W_min + (wi + 1) * (W_max - W_min) / (RES - 1);
          const C0 = C_min + ci * (C_max - C_min) / (RES - 1), C1 = C_min + (ci + 1) * (C_max - C_min) / (RES - 1);
          const pts = [];
          const lerp = (a, b, va, vb) => a + (b - a) * (lv - va) / (vb - va);
          if ((v00 < lv) !== (v01 < lv)) pts.push([lerp(W0, W1, v00, v01), C0]);
          if ((v10 < lv) !== (v11 < lv)) pts.push([lerp(W0, W1, v10, v11), C1]);
          if ((v00 < lv) !== (v10 < lv)) pts.push([W0, lerp(C0, C1, v00, v10)]);
          if ((v01 < lv) !== (v11 < lv)) pts.push([W1, lerp(C0, C1, v01, v11)]);
          if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(xF(pts[0][0]), yF(pts[0][1]));
            ctx.lineTo(xF(pts[1][0]), yF(pts[1][1]));
            ctx.stroke();
          }
        }
      }
    });

    // Border
    ctx.strokeStyle = 'rgba(20,40,60,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Axes - large labels (MATLAB contourf style)
    ctx.fillStyle = '#1A2632';
    ctx.font = '14px IBM Plex Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0.30, 0.35, 0.40, 0.45, 0.50].forEach(wv => {
      const x = xF(wv);
      ctx.beginPath(); ctx.moveTo(x, padT + plotH); ctx.lineTo(x, padT + plotH + 5);
      ctx.strokeStyle = 'rgba(20,40,60,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillText(wv.toFixed(2), x, padT + plotH + 8);
    });
    ctx.font = '16px IBM Plex Sans, sans-serif';
    ctx.fillText('w/b ratio', padL + plotW / 2, padT + plotH + 32);

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '14px IBM Plex Mono, monospace';
    for (let cv = C_min; cv <= C_max; cv += 5) {
      const y = yF(cv);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL - 5, y);
      ctx.strokeStyle = 'rgba(20,40,60,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillText(cv, padL - 8, y);
    }
    ctx.save();
    ctx.translate(20, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '16px IBM Plex Sans, sans-serif';
    ctx.fillText('Cover depth, d (mm)', 0, 0);
    ctx.restore();

    // Colorbar - large
    const cbX = padL + plotW + 22, cbW = 28, cbH = plotH;
    const bH = cbH / nBands;
    for (let b = 0; b < nBands; b++) {
      const [r, g, bv] = bandColor(nBands - 1 - b, nBands);
      ctx.fillStyle = `rgb(${r},${g},${bv})`;
      ctx.fillRect(cbX, padT + b * bH, cbW, bH + 1);
    }
    ctx.strokeStyle = 'rgba(20,40,60,0.6)'; ctx.lineWidth = 1;
    ctx.strokeRect(cbX, padT, cbW, cbH);

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '13px IBM Plex Mono, monospace';
    levels.forEach((lv, idx) => {
      const y = padT + cbH * (1 - idx / nBands);
      ctx.beginPath(); ctx.moveTo(cbX + cbW, y); ctx.lineTo(cbX + cbW + 5, y);
      ctx.strokeStyle = 'rgba(20,40,60,0.5)'; ctx.lineWidth = 0.75; ctx.stroke();
      ctx.fillText(Math.round(lv), cbX + cbW + 7, y);
    });

    ctx.save();
    ctx.translate(W_px - 8, padT + cbH / 2); ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '15px IBM Plex Sans, sans-serif';
    ctx.fillText('Service life (years)', 0, 0);
    ctx.restore();
  }

  function renderContour() {
    const container = document.getElementById('contour-container');

    const b = cBinder.value;
    const m = MODELS[b];
    cScmField.hidden = !m.scm;
    let scmVal = null;
    if (m.scm) {
      cScm.min = m.scm.min; cScm.max = m.scm.max; cScm.step = m.scm.step;
      if (parseFloat(cScm.value) < m.scm.min || parseFloat(cScm.value) > m.scm.max) cScm.value = m.scm.def;
      scmVal = parseFloat(cScm.value);
      cScmLabel.textContent = m.scm.label;
      cScmOut.textContent = scmVal + '%';
    }
    container.className = 'contour-grid';
    container.innerHTML = `<div class="contour-cell contour-single" style="grid-column:1/-1"><canvas id="cc-single"></canvas></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      drawContour(document.getElementById('cc-single'), b, scmVal);
    }));
  }

  cBinder.addEventListener('change', renderContour);
  cScm.addEventListener('input', renderContour);
  window.addEventListener('resize', debounce(() => {
    if (document.getElementById('panel-contour').classList.contains('active')) renderContour();
    if (document.getElementById('panel-sensitivity').classList.contains('active')) renderSensitivity();
    if (document.getElementById('panel-compare').classList.contains('active')) renderCompare();
  }, 200));

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* ----------------------------------------------------------
     SENSITIVITY TAB
     ---------------------------------------------------------- */
  const sBinder = document.getElementById('s-binder');
  const sCover = document.getElementById('s-cover');
  const sWb = document.getElementById('s-wb');
  const sScm = document.getElementById('s-scm');
  const sScmField = document.getElementById('s-scm-field');
  const sScmLabel = document.getElementById('s-scm-label');
  const scmChartCard = document.getElementById('scm-chart-card');
  const scmChartTitle = document.getElementById('scm-chart-title');

  let chartCover = null, chartWb = null, chartScm = null;

  function destroyChart(c) { if (c) { try { c.destroy(); } catch (e) {} } return null; }

  const CHART_BASE_OPTIONS = (xLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { title: { display: true, text: xLabel, font: { size: 11, family: 'IBM Plex Sans' } }, ticks: { font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: '#EBEFF3' } },
      y: { title: { display: true, text: 'Service life (years)', font: { size: 11, family: 'IBM Plex Sans' } }, ticks: { font: { size: 10 } }, grid: { color: '#EBEFF3' } }
    }
  });

  function lineDataset(data, color) {
    return { data, borderColor: color, backgroundColor: color + '1A', fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2.5 };
  }

  function renderSensitivity() {
    const b = sBinder.value;
    const m = MODELS[b];

    sScmField.style.display = m.scm ? '' : 'none';
    scmChartCard.style.display = m.scm ? '' : 'none';

    // Clamp inputs to valid design space
    const { min: Cmn, max: Cmx } = DESIGN_SPACE.cover;
    const { min: Wmn, max: Wmx } = DESIGN_SPACE.wb;
    sCover.min = Cmn; sCover.max = Cmx;
    sWb.min = Wmn; sWb.max = Wmx;
    if (parseFloat(sCover.value) < Cmn) sCover.value = Cmn;
    if (parseFloat(sCover.value) > Cmx) sCover.value = Cmx;
    if (parseFloat(sWb.value) < Wmn) sWb.value = Wmn.toFixed(2);
    if (parseFloat(sWb.value) > Wmx) sWb.value = Wmx.toFixed(2);

    const C0 = parseFloat(sCover.value) || 65;
    const W0 = parseFloat(sWb.value) || 0.40;

    let S0 = null;
    if (m.scm) {
      if (parseFloat(sScm.value) < m.scm.min || parseFloat(sScm.value) > m.scm.max) sScm.value = m.scm.def;
      sScm.min = m.scm.min; sScm.max = m.scm.max; sScm.step = m.scm.step;
      sScmLabel.textContent = 'Fixed ' + m.scm.short;
      S0 = parseFloat(sScm.value);
    }

    chartCover = destroyChart(chartCover);
    chartWb = destroyChart(chartWb);
    chartScm = destroyChart(chartScm);

    const { min: Cmin, max: Cmax } = DESIGN_SPACE.cover;
    const Cs = []; for (let c = Cmin; c <= Cmax; c++) Cs.push(c);
    chartCover = new Chart(document.getElementById('chart-cover'), {
      type: 'line',
      data: { labels: Cs, datasets: [lineDataset(Cs.map(c => +m.predict(c, W0, S0).toFixed(2)), '#1B3A5C')] },
      options: CHART_BASE_OPTIONS('Cover depth (mm)')
    });

    const { min: Wmin, max: Wmax } = DESIGN_SPACE.wb;
    const Ws = []; for (let w = Wmin; w <= Wmax + 1e-9; w += 0.01) Ws.push(+w.toFixed(2));
    chartWb = new Chart(document.getElementById('chart-wb'), {
      type: 'line',
      data: { labels: Ws.map(w => w.toFixed(2)), datasets: [lineDataset(Ws.map(w => +m.predict(C0, w, S0).toFixed(2)), '#1E6F50')] },
      options: CHART_BASE_OPTIONS('w/b ratio')
    });

    if (m.scm) {
      scmChartTitle.textContent = `SL vs. ${m.scm.label}`;
      const Ss = [];
      const n = 20;
      for (let i = 0; i < n; i++) Ss.push(+(m.scm.min + i * (m.scm.max - m.scm.min) / (n - 1)).toFixed(1));
      chartScm = new Chart(document.getElementById('chart-scm'), {
        type: 'line',
        data: { labels: Ss.map(s => s.toFixed(1)), datasets: [lineDataset(Ss.map(s => +m.predict(C0, W0, s).toFixed(2)), '#C1622D')] },
        options: CHART_BASE_OPTIONS(`${m.scm.short}`)
      });
    }
  }

  [sBinder, sCover, sWb, sScm].forEach(el => el.addEventListener('input', renderSensitivity));
  sBinder.addEventListener('change', renderSensitivity);

  /* ----------------------------------------------------------
     REVERSE LOOKUP TAB
     ---------------------------------------------------------- */
  document.getElementById('runLookup').addEventListener('click', runReverseLookup);

  function runReverseLookup() {
    const target = parseFloat(document.getElementById('r-target').value) || 50;
    const binderFilter = document.getElementById('r-binder').value;
    const sortBy = document.getElementById('r-sort').value;
    const container = document.getElementById('reverse-results');

    const binders = binderFilter === 'ALL' ? ['OPC', 'FA', 'GGBS', 'SF'] : [binderFilter];
    const { min: Cmin, max: Cmax } = DESIGN_SPACE.cover;
    const { min: Wmin, max: Wmax } = DESIGN_SPACE.wb;

    const Cs = []; for (let c = Cmin; c <= Cmax; c += 5) Cs.push(c);
    const Ws = []; for (let w = Wmin; w <= Wmax + 1e-9; w += 0.02) Ws.push(+w.toFixed(2));

    const results = [];
    binders.forEach(b => {
      const m = MODELS[b];
      if (m.scm) {
        const step = b === 'SF' ? 2 : b === 'FA' ? 5 : 10;
        const Ss = [];
        for (let s = m.scm.min; s <= m.scm.max; s += step) Ss.push(s);
        Cs.forEach(C => Ws.forEach(W => Ss.forEach(S => {
          const sl = m.predict(C, W, S);
          if (sl >= target) results.push({ binder: b, cover: C, wb: W, scm: S, sl: +sl.toFixed(1) });
        })));
      } else {
        Cs.forEach(C => Ws.forEach(W => {
          const sl = m.predict(C, W, null);
          if (sl >= target) results.push({ binder: b, cover: C, wb: W, scm: null, sl: +sl.toFixed(1) });
        }));
      }
    });

    if (sortBy === 'sl') results.sort((a, b) => b.sl - a.sl);
    else if (sortBy === 'cover') results.sort((a, b) => a.cover - b.cover || a.wb - b.wb);
    else results.sort((a, b) => b.wb - a.wb || a.cover - b.cover);

    if (results.length === 0) {
      container.innerHTML = `<article class="card"><div class="card-body"><p class="muted-text">No combinations within the valid design space achieve a service life of ${target} years. Try a lower target.</p></div></article>`;
      return;
    }

    const top = results.slice(0, 50);
    const sortLabel = sortBy === 'sl' ? 'highest predicted service life' : (sortBy === 'cover' ? 'lowest cover depth' : 'highest w/b ratio');

    container.innerHTML = `
      <article class="card">
        <header class="card-header">
          <h2>Matching mix designs</h2>
          <span class="badge badge-info">${results.length} found \u2014 showing top ${top.length}</span>
        </header>
        <div class="card-body card-body-table">
          <table class="data-table">
            <thead><tr><th>#</th><th>Binder</th><th>SCM</th><th>Cover (mm)</th><th>w/b</th><th>Predicted SL (yr)</th><th>Margin</th></tr></thead>
            <tbody>
              ${top.map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td><strong>${r.binder}</strong></td>
                <td>${r.scm !== null ? r.scm + '%' : '\u2014'}</td>
                <td>${r.cover}</td>
                <td>${r.wb.toFixed(2)}</td>
                <td><strong>${r.sl}</strong></td>
                <td style="color:var(--success-text); font-family:var(--font-mono)">+${(r.sl - target).toFixed(1)} yr</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-body" style="padding-top:0">
          <p class="lookup-meta">Results sorted by ${sortLabel}. A higher w/b ratio combined with lower cover depth generally represents a more economical mix design.</p>
        </div>
      </article>
    `;
  }

  /* ----------------------------------------------------------
     BINDER COMPARISON TAB
     ---------------------------------------------------------- */
  const cmpCover = document.getElementById('cmp-cover');
  const cmpWb = document.getElementById('cmp-wb');
  const cmpScm = document.getElementById('cmp-scm');
  let chartCompare = null;

  const BINDER_COLORS = { OPC: '#1B3A5C', FA: '#1E6F50', GGBS: '#C1622D', SF: '#6E5BA6' };

  function renderCompare() {
    const C = parseFloat(cmpCover.value) || 65;
    const W = parseFloat(cmpWb.value) || 0.40;
    const Sraw = parseFloat(cmpScm.value) || 30;

    document.getElementById('cmp-cover-out').textContent = C + ' mm';
    document.getElementById('cmp-wb-out').textContent = W.toFixed(2);
    document.getElementById('cmp-scm-out').textContent = Sraw + '%';

    const binders = ['OPC', 'FA', 'GGBS', 'SF'];
    const results = binders.map(b => {
      const m = MODELS[b];
      const S = m.scm ? clampSCM(b, Sraw) : null;
      return { binder: b, sl: m.predict(C, W, S), scm: S, color: BINDER_COLORS[b] };
    });
    const maxSL = Math.max(...results.map(r => r.sl));

    document.getElementById('compare-cards').innerHTML = results.map(r => `
      <div class="metric-card" style="border-top-color:${r.color}">
        <div class="metric-name">${r.binder}${r.scm ? ' (' + r.scm + '%)' : ''}</div>
        <div class="metric-value" style="color:${r.color}">${r.sl.toFixed(1)}</div>
        <div class="metric-unit">years</div>
        <div class="metric-bar"><div class="metric-bar-fill" style="width:${(r.sl / maxSL * 100).toFixed(0)}%; background:${r.color}"></div></div>
      </div>
    `).join('');

    chartCompare = destroyChart(chartCompare);
    chartCompare = new Chart(document.getElementById('chart-compare'), {
      type: 'bar',
      data: {
        labels: results.map(r => r.binder + (r.scm ? ` (${r.scm}%)` : '')),
        datasets: [{
          label: 'Predicted service life (yr)',
          data: results.map(r => +r.sl.toFixed(1)),
          backgroundColor: results.map(r => r.color + 'CC'),
          borderColor: results.map(r => r.color),
          borderWidth: 1.5,
          borderRadius: 4,
          maxBarThickness: 64
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(1)} years` } } },
        scales: {
          y: { title: { display: true, text: 'Service life (years)', font: { size: 11, family: 'IBM Plex Sans' } }, beginAtZero: true, grid: { color: '#EBEFF3' } },
          x: { ticks: { font: { size: 11, family: 'IBM Plex Sans' } }, grid: { display: false } }
        }
      }
    });
  }

  [cmpCover, cmpWb, cmpScm].forEach(el => el.addEventListener('input', renderCompare));

  /* ----------------------------------------------------------
     ABOUT TAB
     ---------------------------------------------------------- */
  function renderAbout() {
    const el = document.getElementById('about-models');
    if (el.dataset.rendered) return;
    el.innerHTML = Object.values(MODELS).map(m => `
      <div class="model-entry">
        <div class="model-entry-head">
          <strong>${m.name} \u2014 ${m.fullName}</strong>
          <span class="badge badge-info">${m.form}</span>
        </div>
        <div class="eq-display">${m.eq}</div>
      </div>
    `).join('');
    el.dataset.rendered = '1';
  }

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  /* ----------------------------------------------------------
     SIMPLE CANVAS CHART HELPERS (used for PDF report export,
     synchronous and self-contained - no Chart.js dependency)
     ---------------------------------------------------------- */
  function drawLineChartPNG(canvas, xVals, yVals, xLabel, yLabel, color) {
    const cssW = canvas.width, cssH = canvas.height; // canvas pre-sized by caller (device px)
    const ctx = canvas.getContext('2d');
    const padL = 70, padR = 24, padT = 24, padB = 56;
    const plotW = cssW - padL - padR, plotH = cssH - padT - padB;

    let minY = Math.min(...yVals), maxY = Math.max(...yVals);
    const yPad = (maxY - minY) * 0.08 || 1;
    minY -= yPad; maxY += yPad;
    const minX = xVals[0], maxX = xVals[xVals.length - 1];

    const xF = x => padL + (x - minX) / (maxX - minX) * plotW;
    const yF = y => padT + (maxY - y) / (maxY - minY) * plotH;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cssW, cssH);

    // Grid
    ctx.strokeStyle = '#EBEFF3'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    // Area fill
    ctx.beginPath();
    ctx.moveTo(xF(xVals[0]), yF(yVals[0]));
    for (let i = 1; i < xVals.length; i++) ctx.lineTo(xF(xVals[i]), yF(yVals[i]));
    ctx.lineTo(xF(xVals[xVals.length - 1]), padT + plotH);
    ctx.lineTo(xF(xVals[0]), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = color + '26';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(xF(xVals[0]), yF(yVals[0]));
    for (let i = 1; i < xVals.length; i++) ctx.lineTo(xF(xVals[i]), yF(yVals[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();

    // Axes
    ctx.strokeStyle = 'rgba(20,40,60,0.6)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(padL, padT, plotW, plotH);

    ctx.fillStyle = '#1A2632';
    ctx.font = '15px IBM Plex Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const nTicksX = 5;
    for (let i = 0; i <= nTicksX; i++) {
      const xv = minX + (maxX - minX) * i / nTicksX;
      ctx.fillText(xv.toFixed(xv < 10 ? 2 : 0), xF(xv), padT + plotH + 8);
    }
    ctx.font = '17px IBM Plex Sans, sans-serif';
    ctx.fillText(xLabel, padL + plotW / 2, padT + plotH + 34);

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '15px IBM Plex Mono, monospace';
    for (let i = 0; i <= 4; i++) {
      const yv = maxY - (maxY - minY) * i / 4;
      ctx.fillText(yv.toFixed(1), padL - 8, padT + plotH * i / 4);
    }
    ctx.save();
    ctx.translate(20, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '17px IBM Plex Sans, sans-serif';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  function drawBarChartPNG(canvas, labels, values, colors) {
    const cssW = canvas.width, cssH = canvas.height;
    const ctx = canvas.getContext('2d');
    const padL = 80, padR = 24, padT = 24, padB = 60;
    const plotW = cssW - padL - padR, plotH = cssH - padT - padB;

    const maxY = Math.max(...values) * 1.12;
    const yF = y => padT + plotH - (y / maxY) * plotH;

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cssW, cssH);

    // Grid
    ctx.strokeStyle = '#EBEFF3'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    const n = values.length;
    const slot = plotW / n;
    const barW = slot * 0.55;

    values.forEach((v, i) => {
      const x = padL + i * slot + (slot - barW) / 2;
      const y = yF(v);
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, y, barW, padT + plotH - y);
      ctx.fillStyle = '#1A2632';
      ctx.font = '16px IBM Plex Mono, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(v.toFixed(1), x + barW / 2, y - 6);
    });

    // Axes
    ctx.strokeStyle = 'rgba(20,40,60,0.6)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // X labels
    ctx.fillStyle = '#1A2632';
    ctx.font = '15px IBM Plex Sans, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    labels.forEach((lab, i) => {
      const x = padL + i * slot + slot / 2;
      ctx.fillText(lab, x, padT + plotH + 10);
    });

    // Y labels
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '15px IBM Plex Mono, monospace';
    for (let i = 0; i <= 4; i++) {
      const yv = maxY * (1 - i / 4);
      ctx.fillText(yv.toFixed(0), padL - 8, padT + plotH * i / 4);
    }
    ctx.save();
    ctx.translate(22, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '17px IBM Plex Sans, sans-serif';
    ctx.fillText('Service life (years)', 0, 0);
    ctx.restore();
  }

  // Expose helpers for use by report.js
  window.RCTool = {
    drawContour,
    drawLineChartPNG,
    drawBarChartPNG,
    BINDER_COLORS
  };

  onBinderChange();
})();
