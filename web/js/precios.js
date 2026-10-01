/*
 * Etiquetas de precio para el rollo de 2 columnas (Zebra GK888t, 51 × 25 mm).
 * Cada página del PDF es una fila: 100 × 25 mm con 2 etiquetas centradas en
 * x = 25 mm y x = 75 mm, igual que el generador que ya funcionaba con Acrobat.
 *
 * El diseño se calcula en mm. Para medir el texto se recibe una función
 * medir(texto, puntos) -> ancho en mm (jsPDF en el navegador).
 */
(function (global) {
  'use strict';

  const PT_POR_MM = 72 / 25.4;
  const ALTO_MAYUSCULA = 0.718; // Helvetica Bold: alto de dígitos/mayúsculas en em

  const AJUSTES_POR_DEFECTO = {
    anchoPaginaMm: 100,
    altoPaginaMm: 25,
    centroIzqMm: 25,
    centroDerMm: 75,
    anchoTextoMm: 42, // ancho máximo del precio
    tamanoMaxPt: 40,
    desplazamientoXMm: 0,
    desplazamientoYMm: 0,
    prefijo: '',
    simboloPeso: true,
    mostrarNombre: false
  };

  function normalizarAjustes(a) {
    const r = Object.assign({}, AJUSTES_POR_DEFECTO, a || {});
    const num = (k, min, max) => {
      let v = Number(r[k]);
      if (!isFinite(v)) v = AJUSTES_POR_DEFECTO[k];
      r[k] = Math.min(max, Math.max(min, v));
    };
    num('anchoPaginaMm', 30, 120);
    num('altoPaginaMm', 10, 60);
    num('centroIzqMm', 0, 120);
    num('centroDerMm', 0, 120);
    num('anchoTextoMm', 10, 60);
    num('tamanoMaxPt', 8, 80);
    num('desplazamientoXMm', -10, 10);
    num('desplazamientoYMm', -10, 10);
    r.prefijo = String(r.prefijo || '').slice(0, 30);
    r.simboloPeso = r.simboloPeso !== false;
    r.mostrarNombre = !!r.mostrarNombre;
    return r;
  }

  /** Convierte "12990", "$12.990", "12.990,00", "12990.5" en un entero de pesos. */
  function parsePrecio(valor) {
    if (typeof valor === 'number') return isFinite(valor) ? Math.round(valor) : null;
    let s = String(valor == null ? '' : valor).trim().replace(/[^\d.,-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) {
      s = s.replace(/[.,]/g, ''); // separadores de miles: 12.990 o 1,299,000
    } else {
      const ult = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      if (ult >= 0) s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1);
    }
    const n = Number(s);
    return isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  /** 12990 -> "12.990" */
  function formatearCLP(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function textoPrecio(precio, ajustes) {
    const p = parsePrecio(precio);
    if (p === null) return '';
    return (ajustes.simboloPeso ? '$' : '') + formatearCLP(p);
  }

  /**
   * Lista rápida, un precio por línea:
   *   12990          -> 1 etiqueta
   *   12990 x 5      -> 5 etiquetas (también "12990;5", "12990 5", "$12.990 x5")
   */
  function parsearLista(texto) {
    const out = [];
    for (const linea of String(texto || '').split(/\r?\n/)) {
      const l = linea.trim();
      if (!l) continue;
      let precio = l;
      let cantidad = 1;
      const m = l.match(/^(.*?\d.*?)\s*(?:[x*×]|\t|;|\s)\s*(\d+)\s*$/i);
      if (m) {
        precio = m[1];
        cantidad = parseInt(m[2], 10);
      }
      if (parsePrecio(precio) === null) continue;
      out.push({ precio: parsePrecio(precio), cantidad, nombre: '' });
    }
    return out;
  }

  /** Repite cada ítem según su cantidad. */
  function expandir(items) {
    const out = [];
    for (const it of items || []) {
      const n = Math.max(0, Math.min(1000, Math.floor(Number(it.cantidad) || 0)));
      for (let i = 0; i < n; i++) out.push(it);
    }
    return out;
  }

  /** Agrupa de a 2; si el total es impar, la etiqueta derecha de la última fila queda vacía. */
  function agruparFilas(etiquetas) {
    const filas = [];
    for (let i = 0; i < etiquetas.length; i += 2) filas.push([etiquetas[i], etiquetas[i + 1] || null]);
    return filas;
  }

  function recortar(texto, puntos, anchoMax, medir) {
    let t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (medir(t, puntos) <= anchoMax) return t;
    while (t.length > 1 && medir(t + '…', puntos) > anchoMax) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  /**
   * Textos de una etiqueta: [{texto, x (centro), y (línea base), puntos}] en mm.
   */
  function disenoEtiqueta(item, centroX, ajustes, medir) {
    const a = ajustes;
    const H = a.altoPaginaMm;
    const dy = a.desplazamientoYMm;
    const x = centroX + a.desplazamientoXMm;
    const els = [];
    let arriba = 2.5;
    let abajo = H - 2.5;

    if (a.prefijo) {
      const pt = 11;
      els.push({ texto: recortar(a.prefijo, pt, a.anchoTextoMm, medir), x, y: 2 + (pt * ALTO_MAYUSCULA) / PT_POR_MM + dy, puntos: pt });
      arriba = 7.5;
    }
    if (a.mostrarNombre && item.nombre) {
      const pt = 7;
      els.push({ texto: recortar(item.nombre, pt, a.anchoTextoMm + 4, medir), x, y: H - 2.2 + dy, puntos: pt });
      abajo = H - 5;
    }

    const precio = textoPrecio(item.precio, a);
    if (precio) {
      const ancho1pt = medir(precio, 1) || 1;
      const porAncho = a.anchoTextoMm / ancho1pt;
      const porAlto = ((abajo - arriba) * PT_POR_MM) / ALTO_MAYUSCULA;
      const pt = Math.max(6, Math.min(a.tamanoMaxPt, porAncho, porAlto));
      const alto = (pt * ALTO_MAYUSCULA) / PT_POR_MM;
      els.push({ texto: precio, x, y: arriba + (abajo - arriba - alto) / 2 + alto + dy, puntos: pt, precio: true });
    }
    return els;
  }

  function disenoFila(fila, ajustes, medir) {
    const a = normalizarAjustes(ajustes);
    const els = [];
    if (fila[0]) els.push(...disenoEtiqueta(fila[0], a.centroIzqMm, a, medir));
    if (fila[1]) els.push(...disenoEtiqueta(fila[1], a.centroDerMm, a, medir));
    return els;
  }

  global.Precios = {
    PT_POR_MM,
    AJUSTES_POR_DEFECTO,
    normalizarAjustes,
    parsePrecio,
    formatearCLP,
    textoPrecio,
    parsearLista,
    expandir,
    agruparFilas,
    disenoEtiqueta,
    disenoFila
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
