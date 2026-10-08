const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/js/codigos.js');
const PDF = require('../web/js/codigos-pdf.js');

test('preserva códigos y ceros iniciales; barras con quiet zones y resolución entera', () => {
  for (const codigo of ['00196566152571', 'SQPK00057', '196566152571', 'ABC-12']) {
    const c = C.codificar(codigo);
    assert.equal(c.codigo, codigo);
    assert.ok(c.ancho <= 44);
    assert.ok(c.modulo >= 0.25);
    assert.equal(c.modulo * 8, Math.round(c.modulo * 8));
    assert.ok(c.barras[0].x >= c.modulo * 10);
    const ultima = c.barras.at(-1);
    assert.ok(c.ancho - ultima.x - ultima.ancho >= c.modulo * 10 - 1e-8);
  }
});
test('rechaza códigos ilegibles en la etiqueta y entradas incompatibles', () => {
  for (const v of ['', 'código', 'abc\n123', 'A'.repeat(40)]) assert.throws(() => C.codificar(v));
});
test('pares iguales por fila, límites de cantidad y lote', () => {
  const a = C.normalizar({ codigo: '00123', cantidad: 3, nombre: 'Producto' });
  const b = C.normalizar({ codigo: '98765', cantidad: 2 });
  const fs = C.filas([a, b]);
  assert.equal(fs.length, 3);
  assert.deepEqual(fs.map(f => f.map(it => it.codigo)), [['00123', '00123'], ['00123', '00123'], ['98765', '98765']]);
  for (const n of [0, -1, 2.5, 1001, 'no']) assert.throws(() => C.cantidad(n));
  assert.throws(() => C.filas(Array(5).fill({ cantidad: 1000 })));
});
test('PDF vectorial de 100 x 25 mm y posiciones dentro de cada etiqueta', () => {
  const item = C.normalizar({ codigo: '00196566152571', cantidad: 4, nombre: 'Producto con nombre muy largo '.repeat(8), sku: 'SKU'.repeat(15) });
  const doc = PDF.generar([item], { x: 0, y: 0 });
  assert.equal(doc.getNumberOfPages(), 2);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 100) < 0.01);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 25) < 0.01);
  for (const centro of [25, 75]) {
    for (const x of [-2, 2]) for (const y of [-1, 1]) {
      const el = PDF.elementos(item, centro, { x, y });
      assert.ok(el.textos[0].texto.endsWith('...'));
      for (const b of el.barras) {
        assert.ok(b.x >= centro - 24 && b.x + b.ancho <= centro + 24);
        assert.ok(b.y > 0 && b.y + b.alto < 25);
      }
    }
  }
});
