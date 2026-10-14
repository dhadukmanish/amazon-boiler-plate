/* Barcode (Code 128, set B – any printable ASCII) and QR helpers. No dependencies for the barcode.
   QR uses the small "qrcode-generator" library (loaded from cdnjs on pages that print QR);
   if it is not loaded (offline) qrSvg() returns null and callers fall back to the barcode only.
   Usage: Codes.barcodeSvg('1014')  /  Codes.qrSvg('1014') */
(function () {
  // bar/space widths for symbol values 0..106 (106 = stop, 7 elements)
  const PAT = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
    '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 ' +
    '131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 ' +
    '213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
    '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 ' +
    '421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');

  function code128(text) {
    const vals = [104];                                   // start code B
    for (const ch of String(text)) { const v = ch.charCodeAt(0) - 32; if (v >= 0 && v <= 95) vals.push(v); }
    let sum = 104; vals.slice(1).forEach((v, i) => { sum += v * (i + 1); });
    vals.push(sum % 103, 106);                            // checksum + stop
    return vals.map((v) => PAT[v]).join('');
  }

  function barcodeSvg(text, { height = 40, module = 1.6, quiet = 10 } = {}) {
    let x = quiet, bar = true, rects = '';
    for (const d of code128(text)) { const w = +d * module; if (bar) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; bar = !bar; }
    return `<svg class="barcode" viewBox="0 0 ${x + quiet} ${height}" preserveAspectRatio="none" role="img" aria-label="Barcode ${text}"><g fill="#000">${rects}</g></svg>`;
  }

  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return null;
    const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make();
    const n = q.getModuleCount(); let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c},${r}h1v1h-1z`;
    return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code ${text}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;
  }

  window.Codes = { PAT, code128, barcodeSvg, qrSvg };
})();
