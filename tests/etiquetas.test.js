// Ejecutar con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['code128.js', 'etiquetas.js', 'csv.js']) require(path.join(__dirname, '..', 'web', 'js', f));
const E = globalThis.Etiquetas;

test('patrones Code128 suman 11 módulos y el stop 13', () => {
  assert.equal(E.Code128.PATRONES.length, 106);
  for (const p of E.Code128.PATRONES) assert.equal([...p].reduce((s, c) => s + Number(c), 0), 11, p);
  assert.equal([...E.Code128.STOP].reduce((s, c) => s + Number(c), 0), 13);
});

test('Code128 numérico usa subconjunto C con checksum correcto', () => {
  const v = E.Code128.valores('196566152571');
  assert.equal(v[0], 105);
  assert.deepEqual(v.slice(1, 7), [19, 65, 66, 15, 25, 71]);
  let suma = v[0];
  for (let i = 1; i < 7; i++) suma += v[i] * i;
  assert.equal(v[7], suma % 103);
  assert.equal(E.Code128.anchoModulos('196566152571'), 101);
});

test('Code128 alfanumérico usa subconjunto B', () => {
  const v = E.Code128.valores('SQPK00057');
  assert.equal(v[0], 104);
  assert.equal(v[1], 'S'.charCodeAt(0) - 32);
  const total = E.Code128.anchos('SQPK00057').reduce((s, w) => s + w, 0);
  assert.equal(total, E.Code128.anchoModulos('SQPK00057'));
});

test('precios CLP', () => {
  assert.equal(E.parsePrecio('12990'), 12990);
  assert.equal(E.parsePrecio('$12.990'), 12990);
  assert.equal(E.parsePrecio('12.990,00'), 12990);
  assert.equal(E.parsePrecio('12990.00'), 12990);
  assert.equal(E.parsePrecio('1.299.000'), 1299000);
  assert.equal(E.parsePrecio(''), null);
  assert.equal(E.formatearCLP(12990), '12.990');
  assert.equal(E.formatearCLP(1299000), '1.299.000');
  assert.equal(E.formatearCLP(990), '990');
});

test('filas de 2 con la última derecha en blanco', () => {
  const filas = E.agruparFilas(E.expandir([{ nombre: 'A', cantidad: 2 }, { nombre: 'B', cantidad: 1 }]));
  assert.equal(filas.length, 2);
  assert.equal(filas[1][0].nombre, 'B');
  assert.equal(filas[1][1], null);
});

test('EPL de etiqueta de código: cabecera, posiciones y P1', () => {
  const item = { nombre: '(057)POKEMON SQUISHMALLOWS BULBASAUR 8"', sku: 'SQPK00057', codigo: '196566152571', cantidad: 2 };
  const epl = E.generarEPL(E.agruparFilas(E.expandir([item])), {});
  const l = epl.split('\n');
  assert.ok(l.includes('OD'));
  assert.ok(l.includes('q832'));
  assert.ok(l.includes('Q200,24'));
  assert.ok(l.includes('S3'));
  assert.ok(l.includes('D7'));
  assert.ok(l.includes('ZT'));
  assert.ok(l.includes('A16,8,0,2,1,1,N,"(057)POKEMON SQUISHMALLOWS BULBASA..."'));
  assert.ok(l.includes('A424,30,0,2,1,1,N,"SKU: SQPK00057"'));
  // 101 módulos x 3 dots = 303 dots, centrado en 408 (52,5 -> 53)
  assert.ok(l.includes('B53,54,0,1,3,6,88,B,"196566152571"'));
  assert.ok(l.includes('B461,54,0,1,3,6,88,B,"196566152571"'));
  assert.equal(l.filter((x) => x === 'N').length, 1);
  assert.ok(l.includes('P1'));
  assert.ok(epl.endsWith('\n'));
});

test('filas idénticas se agrupan con P<n>', () => {
  const epl = E.generarEPL(E.agruparFilas(E.expandir([{ precio: '4990', cantidad: 6 }])), { tipo: 'precio' });
  const l = epl.split('\n');
  assert.equal(l.filter((x) => x === 'N').length, 1);
  assert.ok(l.includes('P3'));
});

test('etiqueta de precio centrada y sin térmica directa', () => {
  const epl = E.generarEPL([[{ precio: 12990 }, null]], { tipo: 'precio', termicoDirecto: false, prefijoPrecio: 'Oferta' });
  const l = epl.split('\n');
  assert.ok(l.includes('O'));
  assert.ok(!l.includes('OD'));
  const precio = l.find((x) => x.includes('$12.990'));
  // 7 caracteres x 14 dots x h=3 = 294 dots -> x = (408-294)/2 = 57
  assert.match(precio, /^A57,\d+,0,4,3,4,N,"\$12\.990"$/);
  assert.ok(l.some((x) => x.endsWith('"Oferta"')));
  // Solo la etiqueta izquierda: nada en x >= 408
  assert.ok(!l.some((x) => /^A(4\d\d|[5-9]\d\d),/.test(x)));
});

test('offset Y desplaza y se recorta en 0', () => {
  const avisos = [];
  const epl = E.generarEPL([[{ nombre: 'X', sku: 'Y', codigo: '123' }, null]], { offsetYMm: -2 }, avisos);
  const l = epl.split('\n');
  assert.ok(l.includes('A16,0,0,2,1,1,N,"X"')); // y = 8 - 16 -> recortado a 0
  assert.ok(l.includes('A16,14,0,2,1,1,N,"SKU: Y"')); // y = 30 - 16
  assert.ok(avisos.some((a) => a.includes('borde')));
});

test('comillas escapadas en EPL', () => {
  assert.equal(E.escaparEPL('8" \\ x'), '8\\" \\\\ x');
});

test('calibración envía xa', () => {
  assert.ok(E.eplCalibrar({}).split('\n').includes('xa'));
});

test('CSV: separador, comillas y mapeo de columnas', () => {
  const csv = '﻿Nombre;SKU;Código de barras;Precio;Cantidad\n"(057)POKEMON; SQUISH";SQPK00057;196566152571;$12.990;3\n';
  const filas = E.CSV.parsear(csv);
  assert.equal(filas.length, 2);
  assert.equal(filas[1][0], '(057)POKEMON; SQUISH');
  const m = E.CSV.sugerirMapeo(filas[0]);
  assert.deepEqual(m, { codigo: 2, sku: 1, nombre: 0, precio: 3, cantidad: 4 });
  const p = E.CSV.aProductos(filas, m, true);
  assert.deepEqual(p[0], { nombre: '(057)POKEMON; SQUISH', sku: 'SQPK00057', codigo: '196566152571', precio: '$12.990', cantidad: 3 });
});

test('lista rápida de precios', () => {
  const l = E.CSV.parsearListaPrecios('12990 x 5\n$4.990;2\n1990\n12990,3\nhola\n');
  assert.deepEqual(l.map((p) => [E.parsePrecio(p.precio), p.cantidad]), [[12990, 5], [4990, 2], [1990, 1], [12990, 3]]);
});

test('las barras generadas se decodifican al texto original', () => {
  const { PATRONES, anchos } = E.Code128;
  const decodificar = (w) => {
    const vals = [];
    for (let i = 0; i + 6 <= w.length - 7; i += 6) vals.push(PATRONES.indexOf(w.slice(i, i + 6).join('')));
    let suma = vals[0];
    for (let i = 1; i < vals.length - 1; i++) suma += vals[i] * i;
    assert.equal(suma % 103, vals[vals.length - 1], 'checksum');
    let set = vals[0] === 105 ? 'C' : 'B';
    let out = '';
    for (const v of vals.slice(1, -1)) {
      if (v === 99) set = 'C';
      else if (v === 100) set = 'B';
      else out += set === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
    }
    return out;
  };
  for (const t of ['196566152571', 'SQPK00057', '7801234567890', 'AB12345678CD', '12345', 'X', '00', 'a-b c_1234567']) {
    assert.equal(decodificar(anchos(t)), t, t);
  }
});
