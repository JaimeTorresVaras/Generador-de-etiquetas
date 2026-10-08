/* CODE128 vectorial, con módulos enteros para la Zebra de 203 dpi. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const sandbox = { window: {} };
    require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../vendor/JsBarcode.all.min.js'), 'utf8'), sandbox);
    module.exports = factory(sandbox.window.JsBarcode);
  }
  else root.Codigos = factory(root.JsBarcode);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (JsBarcode) {
  'use strict';
  function codificar(valor) {
    const codigo = String(valor == null ? '' : valor).trim();
    if (!/^[\x20-\x7e]{1,40}$/.test(codigo)) throw Error('Usa letras, números o signos sin tildes en el código.');
    const destino = {};
    JsBarcode(destino, codigo, { format: 'CODE128', displayValue: false });
    const datos = destino.encodings.map(e => e.data).join('');
    const puntos = Math.min(3, Math.floor(44 * 8 / (datos.length + 20)));
    if (puntos < 2) throw Error('El código es demasiado largo para esta etiqueta. Usa un código más corto.');
    const modulo = puntos / 8;
    const ancho = (datos.length + 20) * modulo;
    const barras = [];
    for (let i = 0; i < datos.length;) {
      if (datos[i] !== '1') { i++; continue; }
      const inicio = i;
      while (i < datos.length && datos[i] === '1') i++;
      barras.push({ x: (inicio + 10) * modulo, ancho: (i - inicio) * modulo });
    }
    return { codigo, datos, modulo, ancho, barras };
  }
  function cantidad(valor) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > 1000) throw Error('La cantidad debe ser un entero entre 1 y 1000.');
    return n % 2 ? n + 1 : n;
  }
  function normalizar(item) {
    return { codigo: codificar(item.codigo).codigo, cantidad: cantidad(item.cantidad),
      nombre: String(item.nombre || '').slice(0, 120), sku: String(item.sku || '').slice(0, 60), bsaleId: item.bsaleId || null };
  }
  function filas(items) {
    const total = items.reduce((n, it) => n + cantidad(it.cantidad), 0);
    if (total > 4000) throw Error('El lote admite hasta 4000 etiquetas. Divide la impresión en varios lotes.');
    return items.flatMap(it => Array.from({ length: cantidad(it.cantidad) / 2 }, () => [it, it]));
  }
  return { codificar, cantidad, normalizar, filas };
});
