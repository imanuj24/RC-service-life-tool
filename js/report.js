/* ============================================================
   report.js
   Generates a complete formatted PDF service-life report using
   jsPDF: inputs, prediction, compliance, model info, equation,
   contour map, sensitivity charts and binder comparison chart.
   Depends on: equations.js (MODELS, DESIGN_SPACE, DESIGN_LIFE_TARGETS,
   clampSCM) and window.RCTool (drawContour, drawLineChartPNG,
   drawBarChartPNG, BINDER_COLORS) exported by app.js.
   ============================================================ */

/**
 * Build an offscreen canvas wrapped in a positioned container so that
 * getBoundingClientRect() returns a real width (needed by drawContour).
 */
function _makeOffscreenCanvas(widthPx) {
  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-99999px';
  wrap.style.top = '0';
  wrap.style.width = widthPx + 'px';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  return { wrap, canvas };
}

/**
 * Generate and download a complete PDF report for a given prediction.
 * @param {Object} params
 * @param {string} params.binder - binder key ('OPC','FA','GGBS','SF')
 * @param {number} params.C - cover depth (mm)
 * @param {number} params.W - water-binder ratio
 * @param {number|null} params.S - SCM percentage (null for OPC)
 * @param {number} params.sl - predicted service life (years)
 */
function generateServiceLifeReport({ binder, C, W, S, sl }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const m = MODELS[binder];
  const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const NAVY = [27, 58, 92];
  const SLATE = [110, 134, 155];
  const TEXT = [26, 38, 50];
  const MUTED = [91, 107, 124];
  const BG_MUTED = [235, 239, 243];
  const SUCCESS = [30, 111, 80];
  const SUCCESS_BG = [231, 243, 238];
  const DANGER = [162, 58, 42];
  const DANGER_BG = [251, 234, 231];

  const pw = 210, mg = 18;
  const contentW = pw - 2 * mg;
  const totalPages = 4;
  let y = 0;

  function header(title) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pw, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('RC Service Life Design Tool', mg, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(title, mg, 17);
    return 30;
  }

  function footer(pageNum) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text('Developed by: Anuj Mishra & Laxmi Kant Mishra | Department of Civil Engineering, MNNIT Allahabad', mg, 290);
    doc.text(`Page ${pageNum} of ${totalPages}`, pw - mg, 290, { align: 'right' });
  }

  /* ============================================================
     PAGE 1 - Summary: inputs, prediction, compliance, model info
     ============================================================ */
  y = header('Service Life Prediction Report');

  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Service Life Prediction Report', mg, y);
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Generated: ' + now, pw - mg, y, { align: 'right' });
  y += 4;
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.6);
  doc.line(mg, y, pw - mg, y);
  y += 9;

  doc.setTextColor(...TEXT); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Mix Design Inputs', mg, y);
  y += 6;

  const inputRows = [
    ['Binder system', `${m.name} \u2014 ${m.fullName}`],
    ['Cover depth', `${C} mm`],
    ['Water\u2013binder ratio (w/b)', W.toFixed(2)],
  ];
  if (S !== null) inputRows.push([m.scm.label, `${S}%`]);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  inputRows.forEach(([k, v]) => {
    doc.setFillColor(...BG_MUTED);
    doc.rect(mg, y - 4.5, contentW, 7.5, 'F');
    doc.setTextColor(...MUTED);
    doc.text(k, mg + 3, y);
    doc.setTextColor(...TEXT); doc.setFont('helvetica', 'bold');
    doc.text(v, pw - mg - 3, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8.5;
  });
  y += 5;

  doc.setFillColor(239, 246, 251);
  doc.setDrawColor(191, 213, 232);
  doc.roundedRect(mg, y, contentW, 26, 2, 2, 'FD');
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Predicted Service Life', mg + 6, y + 9);
  doc.setFontSize(24);
  doc.text(`${sl.toFixed(1)} years`, mg + 6, y + 20);
  y += 33;

  doc.setTextColor(...TEXT); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Design Life Compliance', mg, y);
  y += 6;

  doc.setFontSize(10);
  DESIGN_LIFE_TARGETS.forEach(dl => {
    const ok = sl >= dl;
    const margin = (sl - dl).toFixed(1);
    doc.setFillColor(...(ok ? SUCCESS_BG : DANGER_BG));
    doc.rect(mg, y - 4.5, contentW, 7.5, 'F');
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
    doc.text(`${dl}-year design life`, mg + 3, y);
    doc.setTextColor(...(ok ? SUCCESS : DANGER)); doc.setFont('helvetica', 'bold');
    doc.text(ok ? 'Satisfied' : 'Not met', pw / 2, y, { align: 'center' });
    doc.text(`${ok ? '+' : ''}${margin} yr`, pw - mg - 3, y, { align: 'right' });
    y += 8.5;
  });
  y += 5;

  doc.setTextColor(...TEXT); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Model Information', mg, y);
  y += 6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const infoRows = [
    ['Model form', m.form],
    ['R\u00B2 (training dataset)', m.r2train.toFixed(4)],
    ['R\u00B2 (independent validation)', m.r2val.toFixed(4)],
    ['RMSE (validation)', `${m.rmse.toFixed(2)} years`],
    ['MAPE (validation)', `${m.mape.toFixed(2)}%`],
  ];
  infoRows.forEach(([k, v]) => {
    doc.text(`${k}:`, mg + 3, y);
    doc.setTextColor(...TEXT); doc.setFont('helvetica', 'bold');
    doc.text(v, mg + 70, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    y += 5.5;
  });
  y += 3;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text('Governing Equation', mg, y);
  y += 5;
  doc.setFillColor(...BG_MUTED);
  doc.rect(mg, y - 4.5, contentW, 9, 'F');
  doc.setFont('courier', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(m.eq, mg + 3, y + 0.5, { maxWidth: contentW - 6 });
  y += 14;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text('Valid Design Space', mg, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Cover depth: ${DESIGN_SPACE.cover.min}\u2013${DESIGN_SPACE.cover.max} mm   |   w/b ratio: ${DESIGN_SPACE.wb.min.toFixed(2)}\u2013${DESIGN_SPACE.wb.max.toFixed(2)}` +
    (m.scm ? `   |   ${m.scm.short}: ${m.scm.min}\u2013${m.scm.max}%` : ''), mg + 3, y);
  y += 9;

  doc.setDrawColor(...SLATE); doc.setLineWidth(0.3);
  doc.line(mg, y, pw - mg, y);
  y += 5;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Disclaimer: This report is for preliminary design guidance only and does not replace verification by a qualified engineer. Predictions are valid strictly within the stated design space.',
    mg, y, { maxWidth: contentW });

  footer(1);

  /* ============================================================
     PAGE 2 - Contour map
     ============================================================ */
  doc.addPage();
  y = header('Service Life Contour Map');

  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`Contour Map \u2014 ${m.name}${S !== null ? ` (${m.scm.short} = ${S}%)` : ''}`, mg, y);
  y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Predicted service life (years) across the cover depth \u2013 w/b design space.', mg, y + 4);
  y += 10;

  {
    const { wrap, canvas } = _makeOffscreenCanvas(1000);
    const scmForContour = S !== null ? S : (m.scm ? m.scm.def : null);
    window.RCTool.drawContour(canvas, binder, scmForContour);
    const imgData = canvas.toDataURL('image/png');
    const aspect = canvas.height / canvas.width;
    const imgW = contentW;
    const imgH = imgW * aspect;
    doc.addImage(imgData, 'PNG', mg, y, imgW, imgH);
    document.body.removeChild(wrap);
    y += imgH + 8;
  }

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('Each color band represents a discrete service-life range, allowing identification of cover depth and w/b combinations that satisfy a target service life.', mg, y, { maxWidth: contentW });

  footer(2);

  /* ============================================================
     PAGE 3 - Sensitivity charts
     ============================================================ */
  doc.addPage();
  y = header('Sensitivity Analysis');

  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`Sensitivity Analysis \u2014 ${m.name}`, mg, y);
  y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Fixed point: cover = ${C} mm, w/b = ${W.toFixed(2)}` + (S !== null ? `, ${m.scm.short} = ${S}%` : ''), mg, y + 4);
  y += 11;

  const S0 = S !== null ? S : (m.scm ? m.scm.def : null);

  {
    const { wrap, canvas } = _makeOffscreenCanvas(1000);
    canvas.width = 1000; canvas.height = 320;
    const { min: Cmin, max: Cmax } = DESIGN_SPACE.cover;
    const xs = []; const ys = [];
    for (let c = Cmin; c <= Cmax; c++) { xs.push(c); ys.push(m.predict(c, W, S0)); }
    window.RCTool.drawLineChartPNG(canvas, xs, ys, 'Cover depth (mm)', 'Service life (yr)', '#1B3A5C');
    const imgData = canvas.toDataURL('image/png');
    const imgW = contentW, imgH = imgW * (canvas.height / canvas.width);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TEXT);
    doc.text('Service life vs. cover depth', mg, y);
    y += 4;
    doc.addImage(imgData, 'PNG', mg, y, imgW, imgH);
    document.body.removeChild(wrap);
    y += imgH + 8;
  }

  {
    const { wrap, canvas } = _makeOffscreenCanvas(1000);
    canvas.width = 1000; canvas.height = 320;
    const { min: Wmin, max: Wmax } = DESIGN_SPACE.wb;
    const xs = []; const ys = [];
    for (let w = Wmin; w <= Wmax + 1e-9; w += 0.01) { xs.push(+w.toFixed(2)); ys.push(m.predict(C, w, S0)); }
    window.RCTool.drawLineChartPNG(canvas, xs, ys, 'w/b ratio', 'Service life (yr)', '#1E6F50');
    const imgData = canvas.toDataURL('image/png');
    const imgW = contentW, imgH = imgW * (canvas.height / canvas.width);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TEXT);
    doc.text('Service life vs. w/b ratio', mg, y);
    y += 4;
    doc.addImage(imgData, 'PNG', mg, y, imgW, imgH);
    document.body.removeChild(wrap);
    y += imgH + 8;
  }

  if (m.scm) {
    const { wrap, canvas } = _makeOffscreenCanvas(1000);
    canvas.width = 1000; canvas.height = 320;
    const xs = []; const ys = [];
    const n = 25;
    for (let i = 0; i < n; i++) {
      const s = m.scm.min + i * (m.scm.max - m.scm.min) / (n - 1);
      xs.push(+s.toFixed(1)); ys.push(m.predict(C, W, s));
    }
    window.RCTool.drawLineChartPNG(canvas, xs, ys, m.scm.label + ' (%)', 'Service life (yr)', '#C1622D');
    const imgData = canvas.toDataURL('image/png');
    const imgW = contentW, imgH = imgW * (canvas.height / canvas.width);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TEXT);
    doc.text(`Service life vs. ${m.scm.label}`, mg, y);
    y += 4;
    doc.addImage(imgData, 'PNG', mg, y, imgW, imgH);
    document.body.removeChild(wrap);
    y += imgH + 8;
  }

  footer(3);

  /* ============================================================
     PAGE 4 - Binder comparison
     ============================================================ */
  doc.addPage();
  y = header('Binder Comparison');

  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Binder Comparison', mg, y);
  y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Predicted service life for all binder systems at cover = ${C} mm, w/b = ${W.toFixed(2)} (SCM% clamped to each binder's valid range).`, mg, y + 4, { maxWidth: contentW });
  y += 12;

  const binders = ['OPC', 'FA', 'GGBS', 'SF'];
  const SrawForCompare = S !== null ? S : 30;
  const compareResults = binders.map(b => {
    const mb = MODELS[b];
    const sb = mb.scm ? clampSCM(b, SrawForCompare) : null;
    return { binder: b, sl: mb.predict(C, W, sb), scm: sb };
  });

  {
    const { wrap, canvas } = _makeOffscreenCanvas(1000);
    canvas.width = 1000; canvas.height = 480;
    const labels = compareResults.map(r => r.binder + (r.scm !== null ? ` (${r.scm}%)` : ''));
    const values = compareResults.map(r => r.sl);
    const colors = binders.map(b => window.RCTool.BINDER_COLORS[b]);
    window.RCTool.drawBarChartPNG(canvas, labels, values, colors);
    const imgData = canvas.toDataURL('image/png');
    const imgW = contentW, imgH = imgW * (canvas.height / canvas.width);
    doc.addImage(imgData, 'PNG', mg, y, imgW, imgH);
    document.body.removeChild(wrap);
    y += imgH + 10;
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text('Summary', mg, y);
  y += 6;

  doc.setFontSize(9.5);
  compareResults.forEach(r => {
    doc.setFillColor(...BG_MUTED);
    doc.rect(mg, y - 4.5, contentW, 7.5, 'F');
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
    doc.text(`${r.binder} \u2014 ${MODELS[r.binder].fullName}${r.scm !== null ? ` (${MODELS[r.binder].scm.short} = ${r.scm}%)` : ''}`, mg + 3, y);
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
    doc.text(`${r.sl.toFixed(1)} years`, pw - mg - 3, y, { align: 'right' });
    y += 8.5;
  });

  footer(4);

  /* ---------- Save ---------- */
  const scmTag = S !== null ? `_${m.scm.short.replace('%', '')}${S}` : '';
  doc.save(`SL_Report_${binder}_C${C}_wb${W.toFixed(2)}${scmTag}.pdf`);
}
