/*
 * Codificador Code 128 (subconjuntos B y C) usado para la vista previa y el PDF.
 * La impresora genera sus propias barras con el comando EPL "B ... 1" (modo auto);
 * aquí solo replicamos el ancho en módulos para centrar el código y elegir el
 * grosor de barra que quepa en la etiqueta.
 */
(function (global) {
  'use strict';

  // Anchos barra/espacio de cada símbolo (valores 0..105) y el stop.
  const PATRONES = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232'
  ];
  const STOP = '2331112';
  const START_B = 104;
  const START_C = 105;
  const CAMBIO_A_C = 99;
  const CAMBIO_A_B = 100;

  const esDigito = (c) => c >= '0' && c <= '9';

  /** Deja solo caracteres imprimibles ASCII (32..126), que es lo que admite el subconjunto B. */
  function limpiar(texto) {
    return String(texto == null ? '' : texto).replace(/[^\x20-\x7e]/g, '');
  }

  /** Devuelve los valores de símbolo (con start y checksum, sin stop). */
  function valores(texto) {
    const t = limpiar(texto);
    const n = t.length;
    const vals = [];
    let set = null;

    const usar = (nuevo) => {
      if (set === nuevo) return;
      if (set === null) vals.push(nuevo === 'C' ? START_C : START_B);
      else vals.push(nuevo === 'C' ? CAMBIO_A_C : CAMBIO_A_B);
      set = nuevo;
    };

    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && esDigito(t[j])) j++;
      const run = j - i;
      const enBorde = i === 0 || j === n;
      if (run >= (enBorde ? 4 : 6)) {
        if (run % 2 === 1) {
          usar('B');
          vals.push(t.charCodeAt(i) - 32);
          i++;
        }
        usar('C');
        for (; i < j; i += 2) vals.push(Number(t.substr(i, 2)));
      } else {
        usar('B');
        vals.push(t.charCodeAt(i) - 32);
        i++;
      }
    }
    if (set === null) usar('B');

    let suma = vals[0];
    for (let k = 1; k < vals.length; k++) suma += vals[k] * k;
    vals.push(suma % 103);
    return vals;
  }

  /** Lista de anchos alternando barra, espacio, barra... en módulos. */
  function anchos(texto) {
    const out = [];
    for (const v of valores(texto)) for (const c of PATRONES[v]) out.push(Number(c));
    for (const c of STOP) out.push(Number(c));
    return out;
  }

  /** Ancho total del código en módulos (sin zona de silencio). */
  function anchoModulos(texto) {
    return valores(texto).length * 11 + 13;
  }

  const Code128 = { PATRONES, STOP, limpiar, valores, anchos, anchoModulos };
  global.Etiquetas = global.Etiquetas || {};
  global.Etiquetas.Code128 = Code128;
})(typeof globalThis !== 'undefined' ? globalThis : this);
