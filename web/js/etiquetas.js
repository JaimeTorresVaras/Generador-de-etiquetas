/*
 * Núcleo del generador: arma el diseño de cada etiqueta en dots (203 dpi = 8 dots/mm)
 * y lo traduce a EPL2. La vista previa y el PDF usan el mismo diseño, así lo que se ve
 * es lo que se envía a la impresora.
 */
(function (global) {
  'use strict';

  const E = (global.Etiquetas = global.Etiquetas || {});
  const Code128 = E.Code128;

  const DOTS_POR_MM = 8;
  const mm = (v) => Math.round(Number(v) * DOTS_POR_MM);

  // Fuentes residentes EPL2 a 203 dpi: [ancho, alto] de la celda en dots.
  const FUENTES = { 1: [8, 12], 2: [10, 16], 3: [12, 20], 4: [14, 24], 5: [32, 48] };
  // Alto aproximado del texto legible que la impresora pone bajo el código de barras.
  const ALTO_TEXTO_BARRAS = 22;

  const AJUSTES_POR_DEFECTO = {
    impresora: 'ZDesigner GK888t (EPL)',
    tipo: 'codigo', // 'codigo' | 'precio'
    // Geometría del rollo
    anchoEtiquetaMm: 51,
    altoEtiquetaMm: 25,
    gapMm: 3,
    anchoImpresionMm: 104,
    origenXMm: 0, // borde izquierdo de la etiqueta izquierda
    pasoColumnaMm: 51, // distancia entre el borde izquierdo de cada columna
    margenMm: 2, // margen interior de cada etiqueta
    // Corrección fina (equivale al "desplazamiento superior" del driver)
    offsetXMm: 0,
    offsetYMm: 0,
    // Impresora
    oscuridad: 7, // D0..D15
    velocidad: 3, // S2=51 mm/s, S3=76 mm/s, S4=102 mm/s
    termicoDirecto: true, // false = transferencia térmica (requiere ribbon)
    orientacion: 'T', // ZT o ZB
    // Etiqueta de código de barras
    alturaBarrasMm: 11,
    mostrarPrecioEnCodigo: false,
    // Etiqueta de precio
    prefijoPrecio: '',
    simboloPeso: true,
    mostrarNombreEnPrecio: false
  };

  function normalizarAjustes(a) {
    const r = Object.assign({}, AJUSTES_POR_DEFECTO, a || {});
    const num = (k, min, max) => {
      let v = Number(r[k]);
      if (!isFinite(v)) v = AJUSTES_POR_DEFECTO[k];
      r[k] = Math.min(max, Math.max(min, v));
    };
    num('anchoEtiquetaMm', 10, 104);
    num('altoEtiquetaMm', 5, 100);
    num('gapMm', 0, 20);
    num('anchoImpresionMm', 20, 104);
    num('origenXMm', 0, 50);
    num('pasoColumnaMm', 10, 104);
    num('margenMm', 0, 10);
    num('offsetXMm', -20, 20);
    num('offsetYMm', -20, 20);
    num('oscuridad', 0, 15);
    num('velocidad', 2, 5);
    num('alturaBarrasMm', 4, 20);
    r.oscuridad = Math.round(r.oscuridad);
    r.velocidad = Math.round(r.velocidad);
    r.orientacion = r.orientacion === 'B' ? 'B' : 'T';
    r.tipo = r.tipo === 'precio' ? 'precio' : 'codigo';
    r.termicoDirecto = r.termicoDirecto !== false;
    return r;
  }

  // ---------------------------------------------------------------- precios

  /** Convierte "12990", "$12.990", "12.990,00", "12990.5" en un entero de pesos. */
  function parsePrecio(valor) {
    if (typeof valor === 'number') return isFinite(valor) ? Math.round(valor) : null;
    let s = String(valor == null ? '' : valor).trim().replace(/[^\d.,-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) {
      // Separadores de miles: 12.990 o 1,299,000
      s = s.replace(/[.,]/g, '');
    } else {
      // Último separador = decimales
      const ult = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      if (ult >= 0) s = s.slice(0, ult).replace(/[.,]/g, '') + '.' + s.slice(ult + 1);
    }
    const n = Number(s);
    return isFinite(n) ? Math.round(n) : null;
  }

  /** 12990 -> "12.990" (formato CLP, sin decimales). */
  function formatearCLP(n) {
    const v = Math.round(Number(n) || 0);
    const signo = v < 0 ? '-' : '';
    return signo + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function textoPrecio(precio, ajustes) {
    const p = parsePrecio(precio);
    if (p === null) return '';
    return (ajustes.simboloPeso ? '$' : '') + formatearCLP(p);
  }

  // ---------------------------------------------------------------- diseño

  function truncar(texto, maxChars) {
    const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
    if (maxChars <= 0) return '';
    if (t.length <= maxChars) return t;
    if (maxChars <= 3) return t.slice(0, maxChars);
    return t.slice(0, maxChars - 3) + '...';
  }

  function texto(x, y, fuente, h, v, contenido) {
    const [cw, ch] = FUENTES[fuente];
    return { tipo: 'texto', x, y, fuente, h, v, texto: contenido, ancho: contenido.length * cw * h, alto: ch * v };
  }

  function centrado(anchoEtiqueta, y, fuente, h, v, contenido) {
    const el = texto(0, y, fuente, h, v, contenido);
    el.x = Math.max(0, Math.round((anchoEtiqueta - el.ancho) / 2));
    return el;
  }

  /** Etiqueta con nombre, SKU y código de barras (como la plantilla "Etiquetas en rollo 51x25 CODE128"). */
  function disenoCodigo(item, a, avisos) {
    const W = mm(a.anchoEtiquetaMm);
    const H = mm(a.altoEtiquetaMm);
    const m = mm(a.margenMm);
    const util = W - 2 * m;
    const els = [];
    const [cw2] = FUENTES[2];

    els.push(texto(m, 8, 2, 1, 1, truncar(item.nombre, Math.floor(util / cw2))));

    const precio = a.mostrarPrecioEnCodigo ? textoPrecio(item.precio, a) : '';
    const espacioPrecio = precio ? precio.length + 1 : 0;
    const sku = item.sku ? 'SKU: ' + item.sku : '';
    els.push(texto(m, 30, 2, 1, 1, truncar(sku, Math.floor(util / cw2) - espacioPrecio)));
    if (precio) {
      const el = texto(0, 30, 2, 1, 1, precio);
      el.x = W - m - el.ancho;
      els.push(el);
    }

    const datos = Code128.limpiar(item.codigo || '');
    if (datos) {
      const modulos = Code128.anchoModulos(datos);
      let angosta = 3;
      while (angosta > 1 && modulos * angosta > util) angosta--;
      if (modulos * angosta > util) {
        avisos.push(`El código "${datos}" es demasiado largo para ${a.anchoEtiquetaMm} mm y puede salir cortado.`);
      }
      const ancho = modulos * angosta;
      const alto = Math.max(16, Math.min(mm(a.alturaBarrasMm), H - 54 - ALTO_TEXTO_BARRAS - 4));
      els.push({
        tipo: 'barras',
        x: Math.max(0, Math.round((W - ancho) / 2)),
        y: 54,
        angosta,
        alto,
        ancho,
        datos,
        legible: true
      });
    } else if (item.nombre || item.sku) {
      avisos.push(`"${item.nombre || item.sku}" no tiene código de barras.`);
    }
    return els;
  }

  /** Etiqueta de solo precio, con prefijo opcional ("Oferta") y nombre opcional. */
  function disenoPrecio(item, a, avisos) {
    const W = mm(a.anchoEtiquetaMm);
    const H = mm(a.altoEtiquetaMm);
    const m = mm(a.margenMm);
    const util = W - 2 * m;
    const els = [];
    let arriba = 6;
    let abajo = H - 6;

    const prefijo = String(a.prefijoPrecio || '').trim();
    if (prefijo) {
      const el = centrado(W, arriba, 3, 1, 1, truncar(prefijo, Math.floor(util / FUENTES[3][0])));
      els.push(el);
      arriba += el.alto + 4;
    }
    if (a.mostrarNombreEnPrecio && item.nombre) {
      const el = centrado(W, 0, 1, 1, 1, truncar(item.nombre, Math.floor(util / FUENTES[1][0])));
      el.y = abajo - el.alto;
      els.push(el);
      abajo = el.y - 4;
    }

    const precio = textoPrecio(item.precio, a);
    if (!precio) {
      avisos.push(`"${item.nombre || item.sku || 'Fila sin nombre'}" no tiene un precio válido.`);
      return els;
    }
    const [cw, ch] = FUENTES[4];
    const h = Math.max(1, Math.min(6, Math.floor(util / (precio.length * cw))));
    const v = Math.max(1, Math.min(9, h + 1, Math.floor((abajo - arriba) / ch)));
    const el = centrado(W, 0, 4, h, v, precio);
    el.y = Math.max(arriba, Math.round(arriba + (abajo - arriba - el.alto) / 2));
    els.push(el);
    return els;
  }

  function disenoEtiqueta(item, ajustes, avisos) {
    const a = normalizarAjustes(ajustes);
    const lista = avisos || [];
    return a.tipo === 'precio' ? disenoPrecio(item, a, lista) : disenoCodigo(item, a, lista);
  }

  // ---------------------------------------------------------------- filas

  /** Repite cada producto según su cantidad. */
  function expandir(items) {
    const out = [];
    for (const it of items || []) {
      const n = Math.max(0, Math.floor(Number(it.cantidad) || 0));
      for (let i = 0; i < n; i++) out.push(it);
    }
    return out;
  }

  /** Agrupa de a 2 por fila; si el total es impar, la última derecha queda en blanco. */
  function agruparFilas(etiquetas, columnas) {
    const c = columnas || 2;
    const filas = [];
    for (let i = 0; i < etiquetas.length; i += c) {
      const fila = etiquetas.slice(i, i + c);
      while (fila.length < c) fila.push(null);
      filas.push(fila);
    }
    return filas;
  }

  /** Elementos de una fila en coordenadas absolutas de la impresora (dots). */
  function disenoFila(fila, ajustes, avisos) {
    const a = normalizarAjustes(ajustes);
    const els = [];
    fila.forEach((item, col) => {
      if (!item) return;
      const dx = mm(a.origenXMm + col * a.pasoColumnaMm + a.offsetXMm);
      const dy = mm(a.offsetYMm);
      for (const el of disenoEtiqueta(item, a, avisos)) {
        els.push(Object.assign({}, el, { x: el.x + dx, y: el.y + dy, columna: col }));
      }
    });
    return els;
  }

  // ---------------------------------------------------------------- EPL2

  function escaparEPL(t) {
    return String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function cabeceraEPL(ajustes) {
    const a = normalizarAjustes(ajustes);
    return [
      '', // salto inicial: descarta cualquier comando a medias en el buffer
      'I8,A,001', // juego de caracteres Latin-1 (tildes y ñ)
      a.termicoDirecto ? 'OD' : 'O',
      'q' + mm(a.anchoImpresionMm),
      'Q' + mm(a.altoEtiquetaMm) + ',' + mm(a.gapMm),
      'S' + a.velocidad,
      'D' + a.oscuridad,
      'Z' + a.orientacion
    ];
  }

  function comandosElementos(els, avisos) {
    const lineas = [];
    let recortado = false;
    for (const el of els) {
      const x = Math.max(0, Math.round(el.x));
      const y = Math.max(0, Math.round(el.y));
      if (x !== Math.round(el.x) || y !== Math.round(el.y)) recortado = true;
      if (el.tipo === 'texto') {
        if (!el.texto) continue;
        lineas.push(`A${x},${y},0,${el.fuente},${el.h},${el.v},N,"${escaparEPL(el.texto)}"`);
      } else if (el.tipo === 'barras') {
        lineas.push(`B${x},${y},0,1,${el.angosta},${el.angosta * 2},${el.alto},${el.legible ? 'B' : 'N'},"${escaparEPL(el.datos)}"`);
      }
    }
    if (recortado && avisos) avisos.push('El desplazamiento deja contenido fuera del borde; se ajustó a 0.');
    return lineas;
  }

  /**
   * Genera el trabajo EPL2 completo. Las filas idénticas seguidas se imprimen con
   * un solo formulario y "P<n>" para que la impresora no reciba datos repetidos.
   */
  function generarEPL(filas, ajustes, avisos) {
    const a = normalizarAjustes(ajustes);
    const lineas = cabeceraEPL(a);
    let previo = null;
    let copias = 0;
    const cerrar = () => {
      if (previo) lineas.push(...previo, 'P' + copias);
    };
    for (const fila of filas) {
      const cuerpo = ['N', ...comandosElementos(disenoFila(fila, a, avisos), avisos)];
      if (previo && previo.join('\n') === cuerpo.join('\n')) {
        copias++;
      } else {
        cerrar();
        previo = cuerpo;
        copias = 1;
      }
    }
    cerrar();
    return lineas.join('\n') + '\n';
  }

  /** Autocalibración del sensor de gaps (equivale a mantener Feed hasta 2 parpadeos). */
  function eplCalibrar(ajustes) {
    const a = normalizarAjustes(ajustes);
    return ['', a.termicoDirecto ? 'OD' : 'O', 'Q' + mm(a.altoEtiquetaMm) + ',' + mm(a.gapMm), 'xa', ''].join('\n');
  }

  /** Imprime la etiqueta de configuración de la impresora. */
  function eplConfiguracion() {
    return '\nU\n';
  }

  /** Fila de prueba con marco y cruces para medir el desfase real. */
  function filaPrueba(ajustes) {
    const a = normalizarAjustes(ajustes);
    const W = mm(a.anchoEtiquetaMm);
    const H = mm(a.altoEtiquetaMm);
    const lineas = cabeceraEPL(a);
    lineas.push('N');
    for (let col = 0; col < 2; col++) {
      const x0 = Math.max(0, mm(a.origenXMm + col * a.pasoColumnaMm + a.offsetXMm));
      const y0 = Math.max(0, mm(a.offsetYMm));
      // Marco 1 mm hacia adentro del borde teórico de la etiqueta
      lineas.push(`X${x0 + 8},${y0 + 8},2,${x0 + W - 8},${y0 + H - 8}`);
      lineas.push(`LO${x0 + Math.round(W / 2) - 1},${y0 + 8},2,${H - 16}`);
      lineas.push(`LO${x0 + 8},${y0 + Math.round(H / 2) - 1},${W - 16},2`);
      lineas.push(`A${x0 + 16},${y0 + 16},0,2,1,1,N,"${col === 0 ? 'IZQ' : 'DER'} ${a.anchoEtiquetaMm}x${a.altoEtiquetaMm}"`);
      lineas.push(`A${x0 + 16},${y0 + H - 36},0,1,1,1,N,"X${a.offsetXMm} Y${a.offsetYMm} mm"`);
    }
    lineas.push('P1');
    return lineas.join('\n') + '\n';
  }

  Object.assign(E, {
    DOTS_POR_MM,
    FUENTES,
    ALTO_TEXTO_BARRAS,
    AJUSTES_POR_DEFECTO,
    mm,
    normalizarAjustes,
    parsePrecio,
    formatearCLP,
    textoPrecio,
    truncar,
    disenoEtiqueta,
    disenoFila,
    expandir,
    agruparFilas,
    escaparEPL,
    generarEPL,
    eplCalibrar,
    eplConfiguracion,
    filaPrueba
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
