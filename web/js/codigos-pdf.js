(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./codigos.js'), require('../vendor/jspdf.umd.min.js').jsPDF);
  else root.CodigosPDF = factory(root.Codigos, root.jspdf.jsPDF);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, jsPDF) {
  'use strict';
  const medidor = new jsPDF({ unit: 'mm', format: [100, 25], orientation: 'landscape' });
  function abreviar(texto, maximo) {
    let t = String(texto || '').replace(/[\r\n\t]+/g, ' ');
    if (medidor.getTextWidth(t) <= maximo) return t;
    while (t && medidor.getTextWidth(t + '...') > maximo) t = t.slice(0, -1);
    return t + '...';
  }
  function elementos(it, centro, ajustes = { x: 0, y: 0 }) {
    const c = C.codificar(it.codigo);
    const x = centro + ajustes.x, y = ajustes.y;
    medidor.setFont('helvetica', 'bold'); medidor.setFontSize(7);
    const nombre = abreviar(it.nombre, 44);
    medidor.setFont('helvetica', 'normal'); medidor.setFontSize(6);
    const sku = abreviar(it.sku ? 'SKU: ' + it.sku : '', 44);
    return { barras: c.barras.map(b => ({ x: x - c.ancho / 2 + b.x, y: 8 + y, ancho: b.ancho, alto: 11 })),
      textos: [{ texto: nombre, x, y: 3.4 + y, pt: 7, bold: true }, { texto: sku, x, y: 6.3 + y, pt: 6, bold: false },
        { texto: c.codigo, x, y: 22.2 + y, pt: 7, bold: false }] };
  }
  function generar(items, ajustes) {
    const fs = C.filas(items);
    if (!fs.length) throw Error('Agrega códigos antes de descargar el PDF.');
    const doc = new jsPDF({ unit: 'mm', format: [100, 25], orientation: 'landscape', precision: 5 });
    doc.setProperties({ title: 'Códigos de barras · Carnaval' });
    fs.forEach((fila, i) => {
      if (i) doc.addPage([100, 25], 'landscape');
      fila.forEach((it, j) => {
        const el = elementos(it, j ? 75 : 25, ajustes); doc.setFillColor(0, 0, 0);
        el.barras.forEach(b => doc.rect(b.x, b.y, b.ancho, b.alto, 'F'));
        el.textos.forEach(t => { doc.setFont('helvetica', t.bold ? 'bold' : 'normal'); doc.setFontSize(t.pt); doc.text(t.texto, t.x, t.y, { align: 'center' }); });
      });
    });
    return doc;
  }
  return { elementos, generar };
});
