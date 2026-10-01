/*
 * Lectura del CSV que exporta "Generar etiquetas" (u otro similar).
 * Detecta separador y columnas por nombre; el usuario puede corregir el mapeo en pantalla.
 */
(function (global) {
  'use strict';

  const E = (global.Etiquetas = global.Etiquetas || {});

  function detectarSeparador(texto) {
    const primera = texto.split(/\r?\n/).find((l) => l.trim()) || '';
    let mejor = ',';
    let max = -1;
    for (const sep of [',', ';', '\t', '|']) {
      const n = primera.split(sep).length - 1;
      if (n > max) {
        max = n;
        mejor = sep;
      }
    }
    return mejor;
  }

  /** CSV con comillas dobles (RFC 4180). Devuelve matriz de strings. */
  function parsear(texto, separador) {
    const t = String(texto || '').replace(/^﻿/, '');
    const sep = separador || detectarSeparador(t);
    const filas = [];
    let fila = [];
    let campo = '';
    let comillas = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (comillas) {
        if (c === '"') {
          if (t[i + 1] === '"') {
            campo += '"';
            i++;
          } else comillas = false;
        } else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) {
        fila.push(campo);
        campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        fila.push(campo);
        filas.push(fila);
        fila = [];
        campo = '';
      } else campo += c;
    }
    if (campo !== '' || fila.length) {
      fila.push(campo);
      filas.push(fila);
    }
    return filas.filter((f) => f.some((v) => v.trim() !== ''));
  }

  const normalizar = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // Orden de prioridad: el primer patrón que calce gana.
  const SINONIMOS = {
    codigo: ['codigo de barras', 'cod barras', 'barcode', 'ean', 'upc', 'gtin', 'codigo barra', 'barra'],
    sku: ['sku', 'codigo interno', 'referencia', 'ref', 'item code', 'codigo producto', 'codigo'],
    nombre: ['nombre', 'producto', 'descripcion', 'name', 'title', 'titulo', 'detalle', 'articulo'],
    precio: ['precio venta', 'precio', 'price', 'valor', 'pvp', 'monto'],
    cantidad: ['cantidad', 'copias', 'etiquetas', 'qty', 'quantity', 'cant', 'stock', 'unidades']
  };

  /** Sugiere qué columna corresponde a cada campo. Devuelve {campo: índice|-1}. */
  function sugerirMapeo(cabecera) {
    const norm = cabecera.map(normalizar);
    const usado = new Set();
    const mapeo = {};
    for (const campo of ['codigo', 'sku', 'nombre', 'precio', 'cantidad']) {
      mapeo[campo] = -1;
      for (const patron of SINONIMOS[campo]) {
        const idx = norm.findIndex((h, i) => !usado.has(i) && (h === patron || h.includes(patron)));
        if (idx >= 0) {
          mapeo[campo] = idx;
          usado.add(idx);
          break;
        }
      }
    }
    return mapeo;
  }

  /** ¿La primera fila parece cabecera? (ninguna celda es un número puro largo) */
  function tieneCabecera(filas) {
    if (!filas.length) return false;
    const m = sugerirMapeo(filas[0]);
    return Object.values(m).some((v) => v >= 0);
  }

  function aProductos(filas, mapeo, conCabecera) {
    const datos = conCabecera ? filas.slice(1) : filas;
    const celda = (f, campo) => (mapeo[campo] >= 0 ? String(f[mapeo[campo]] || '').trim() : '');
    return datos
      .map((f) => {
        const cant = parseInt(celda(f, 'cantidad').replace(/[^\d-]/g, ''), 10);
        return {
          nombre: celda(f, 'nombre'),
          sku: celda(f, 'sku'),
          codigo: celda(f, 'codigo'),
          precio: celda(f, 'precio'),
          cantidad: isFinite(cant) && cant >= 0 ? cant : 1
        };
      })
      .filter((p) => p.nombre || p.sku || p.codigo || p.precio);
  }

  /**
   * Lista rápida de precios, una línea por precio:
   *   12990          -> 1 etiqueta
   *   12990 x 5      -> 5 etiquetas
   *   12990;5  /  12990,5 (solo si no son miles) /  12990 5
   */
  function parsearListaPrecios(texto) {
    const out = [];
    for (const linea of String(texto || '').split(/\r?\n/)) {
      const l = linea.trim();
      if (!l) continue;
      let m = l.match(/^(.*?)\s*(?:[x*×]|\t|;|\s)\s*(\d+)\s*$/i);
      let precio = l;
      let cantidad = 1;
      if (m && m[1] && /\d/.test(m[1])) {
        precio = m[1];
        cantidad = parseInt(m[2], 10);
      } else if ((m = l.match(/^(\d+),(\d{1,2})$/))) {
        // "12990,5" -> precio 12990, 5 copias (",5" no son miles)
        precio = m[1];
        cantidad = parseInt(m[2], 10);
      }
      if (E.parsePrecio(precio) === null) continue;
      out.push({ nombre: '', sku: '', codigo: '', precio: precio.trim(), cantidad });
    }
    return out;
  }

  E.CSV = { detectarSeparador, parsear, sugerirMapeo, tieneCabecera, aProductos, parsearListaPrecios, normalizar };
})(typeof globalThis !== 'undefined' ? globalThis : this);
