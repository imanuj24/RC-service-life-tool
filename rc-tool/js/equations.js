/* ============================================================
   equations.js
   Service life prediction equations for RC under chloride exposure
   Selected model forms per binder, validated against independent
   test data (see README / About panel for validation statistics).
   ============================================================ */

const MODELS = {
  OPC: {
    name: 'OPC',
    fullName: 'Ordinary Portland Cement',
    form: 'Power',
    eq: 'SL = 0.2667 \u00B7 C^0.8500 \u00B7 (w/b)^\u22120.8919',
    r2train: 0.9550,
    r2val: 0.9330,
    rmse: 1.16,
    mape: 4.30,
    scm: null,
    predict: (C, W, S) => 0.266655 * Math.pow(C, 0.85001) * Math.pow(W, -0.89190)
  },
  FA: {
    name: 'FA',
    fullName: 'Fly Ash',
    form: 'Exponential',
    eq: 'SL = exp(2.8581 + 0.02791\u00B7C \u2212 4.7385\u00B7(w/b) + 0.03582\u00B7FA%)',
    r2train: 0.9835,
    r2val: 0.9689,
    rmse: 2.49,
    mape: 5.96,
    scm: { label: 'FA replacement', short: 'FA%', min: 20, max: 40, def: 30, step: 1 },
    predict: (C, W, S) => Math.exp(2.8581 + 0.02791 * C - 4.7385 * W + 0.03582 * S)
  },
  GGBS: {
    name: 'GGBS',
    fullName: 'Ground Granulated Blast Furnace Slag',
    form: 'Exponential',
    eq: 'SL = exp(2.7813 + 0.02952\u00B7C \u2212 4.9762\u00B7(w/b) + 0.02728\u00B7GGBS%)',
    r2train: 0.9847,
    r2val: 0.9696,
    rmse: 3.34,
    mape: 6.56,
    scm: { label: 'GGBS replacement', short: 'GGBS%', min: 30, max: 70, def: 50, step: 1 },
    predict: (C, W, S) => Math.exp(2.7813 + 0.02952 * C - 4.9762 * W + 0.02728 * S)
  },
  SF: {
    name: 'SF',
    fullName: 'Silica Fume',
    form: 'Exponential',
    eq: 'SL = exp(2.8719 + 0.02721\u00B7C \u2212 4.6104\u00B7(w/b) + 0.13895\u00B7SF%)',
    r2train: 0.9836,
    r2val: 0.9735,
    rmse: 3.84,
    mape: 8.23,
    scm: { label: 'SF replacement', short: 'SF%', min: 5, max: 15, def: 10, step: 1 },
    predict: (C, W, S) => Math.exp(2.8719 + 0.02721 * C - 4.6104 * W + 0.13895 * S)
  }
};

// Valid design space (shared across all binders)
const DESIGN_SPACE = {
  cover: { min: 45, max: 80, unit: 'mm' },
  wb: { min: 0.30, max: 0.50, unit: '' }
};

// Standard design-life targets used for compliance checks
const DESIGN_LIFE_TARGETS = [25, 50, 75, 100];

/**
 * Predict service life for a given binder and inputs.
 * @param {string} binderKey - one of 'OPC','FA','GGBS','SF'
 * @param {number} cover - cover depth in mm
 * @param {number} wb - water-binder ratio
 * @param {number|null} scm - SCM replacement percentage (null for OPC)
 * @returns {number} predicted service life in years
 */
function predictSL(binderKey, cover, wb, scm) {
  const m = MODELS[binderKey];
  return m.predict(cover, wb, scm);
}

/**
 * Clamp a SCM value to the valid range for a given binder.
 */
function clampSCM(binderKey, value) {
  const scm = MODELS[binderKey].scm;
  if (!scm) return null;
  return Math.max(scm.min, Math.min(scm.max, value));
}
