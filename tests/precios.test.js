// Ejecutar con:  node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/js/precios.js');
const P = globalThis.Precios;

// Medición aproximada de Helvetica Bold: dígitos 0,556 em, "$" 0,556, "." 0,278.
const medir = (t, pt) => [...String(t)].reduce((s, c) => s + (c === '.' ? 0.278 : 0.556), 0) * pt / P.PT_POR_MM;

test('precios CLP', () => {
  assert.equal(P.parsePrecio('12990'), 12990);
  assert.equal(P.parsePrecio('$12.990'), 12990);
  assert.equal(P.parsePrecio('12.990,00'), 12990);
  assert.equal(P.parsePrecio('1.299.000'), 1299000);
  assert.equal(P.parsePrecio(12990.4), 12990);
  assert.equal(P.parsePrecio('abc'), null);
  assert.equal(P.formatearCLP(12990), '12.990');
  assert.equal(P.formatearCLP(990), '990');
  assert.equal(P.textoPrecio(12990, { simboloPeso: true }), '$12.990');
  assert.equal(P.textoPrecio(12990, { simboloPeso: false }), '12.990');
});

test('cantidades solo pares', () => {
  assert.deepEqual([0, -3, 1, 2, 3, 4, 5, 2001].map(P.cantidadPar), [0, 0, 2, 2, 4, 4, 6, 1000]);
});

test('lista rápida con cantidades pares', () => {
  const l = P.parsearLista('12990 x 5\n$4.990;2\n1990\n12.990 4\n500 x 0\nhola\n');
  assert.deepEqual(l.map((x) => [x.precio, x.cantidad]), [[12990, 6], [4990, 2], [1990, 2], [12990, 4]]);
});

test('cada fila sale completa y con el mismo precio en ambas etiquetas', () => {
  const f = P.agruparFilas(P.expandir([{ precio: 1, cantidad: 3 }, { precio: 2, cantidad: 1 }]));
  assert.deepEqual(f.map((fila) => fila.map((x) => x && x.precio)), [[1, 1], [1, 1], [2, 2]]);
});

test('precio centrado en 25 y 75 mm, ajustado a 42 mm y máximo 40 pt', () => {
  const els = P.disenoFila([{ precio: 12990 }, { precio: 990 }], {}, medir);
  assert.equal(els.length, 2);
  assert.equal(els[0].x, 25);
  assert.equal(els[1].x, 75);
  assert.ok(medir(els[0].texto, els[0].puntos) <= 42.0001);
  assert.ok(els[1].puntos <= 40);
  for (const el of els) assert.ok(el.y > 0 && el.y < 25);
});

test('prefijo, nombre y desplazamiento', () => {
  const a = { prefijo: 'Oferta', mostrarNombre: true, desplazamientoYMm: 1, desplazamientoXMm: -0.5 };
  const els = P.disenoFila([{ precio: 4990, nombre: 'Peluche Squishmallows Bulbasaur muy largo de 30 cm' }, null], a, medir);
  assert.equal(els.length, 3);
  const [pre, nombre, precio] = els;
  assert.equal(pre.texto, 'Oferta');
  assert.ok(nombre.texto.endsWith('…'));
  assert.ok(medir(nombre.texto, nombre.puntos) <= 46.0001);
  assert.equal(precio.x, 24.5);
  assert.ok(pre.y < precio.y && precio.y < nombre.y);
  // El precio no invade el texto superior ni el nombre
  const alto = (precio.puntos * 0.718) / P.PT_POR_MM;
  assert.ok(precio.y - alto >= 7.5 + 1 - 1e-9);
  assert.ok(precio.y <= 25 - 5 + 1 + 1e-9);
});

test('ítems sin precio válido no dibujan nada', () => {
  assert.deepEqual(P.disenoFila([{ precio: '' }, null], {}, medir), []);
});
