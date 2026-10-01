/* Interfaz: lista de precios, búsqueda en Bsale, vista previa y PDF. */
(function () {
  'use strict';

  const P = window.Precios;
  const $ = (id) => document.getElementById(id);
  const MAX_FILAS_PREVIA = 30;
  const CLAVE_ITEMS = 'precios.items';
  const CLAVE_AJUSTES = 'precios.ajustes';
  const CLAVE_ACCESO = 'precios.clave';

  const estado = {
    items: [],
    ajustes: P.normalizarAjustes({}),
    bsale: { activo: false, requiereClave: false, clave: '' },
    resultados: []
  };

  // ------------------------------------------------------------ almacenamiento local

  const local = {
    leer(clave) {
      try {
        return JSON.parse(localStorage.getItem(clave) || 'null');
      } catch (e) {
        return null;
      }
    },
    guardar(clave, valor) {
      try {
        localStorage.setItem(clave, JSON.stringify(valor));
      } catch (e) {
        /* almacenamiento bloqueado: la app sigue funcionando */
      }
    }
  };
  const guardarItems = () => local.guardar(CLAVE_ITEMS, estado.items);
  const guardarAjustes = () => local.guardar(CLAVE_AJUSTES, estado.ajustes);

  // ------------------------------------------------------------ medición de texto (jsPDF)

  const medidor = new window.jspdf.jsPDF({ unit: 'mm', format: [100, 25], orientation: 'landscape' });
  medidor.setFont('helvetica', 'bold');
  /** Ancho en mm de un texto en Helvetica Bold a `puntos`. */
  function medir(texto, puntos) {
    return (medidor.getStringUnitWidth(String(texto)) * puntos) / P.PT_POR_MM;
  }

  // ------------------------------------------------------------ lista de precios

  function agregar(items) {
    for (const it of items) {
      const precio = P.parsePrecio(it.precio);
      if (precio === null) continue;
      // Mismo producto (o mismo precio sin nombre) ya en la lista: suma la cantidad.
      const igual = estado.items.find((x) =>
        it.bsaleId ? x.bsaleId === it.bsaleId : !x.bsaleId && x.precio === precio && (x.nombre || '') === (it.nombre || '')
      );
      if (igual) igual.cantidad += Math.max(1, it.cantidad || 1);
      else estado.items.push({ precio, cantidad: Math.max(1, it.cantidad || 1), nombre: it.nombre || '', bsaleId: it.bsaleId || null });
    }
    guardarItems();
    pintarTabla();
    actualizar();
  }

  function pintarTabla() {
    const cuerpo = $('cuerpoTabla');
    cuerpo.innerHTML = '';
    estado.items.forEach((it, i) => {
      const tr = document.createElement('tr');

      const tdNombre = document.createElement('td');
      const nombre = document.createElement('input');
      nombre.type = 'text';
      nombre.value = it.nombre;
      nombre.placeholder = '(sin nombre)';
      nombre.className = 'producto';
      nombre.addEventListener('input', () => {
        it.nombre = nombre.value;
        guardarItems();
        actualizarPronto();
      });
      tdNombre.appendChild(nombre);

      const tdPrecio = document.createElement('td');
      tdPrecio.className = 'num';
      const precio = document.createElement('input');
      precio.type = 'text';
      precio.inputMode = 'numeric';
      precio.value = P.formatearCLP(it.precio);
      precio.addEventListener('change', () => {
        const v = P.parsePrecio(precio.value);
        if (v !== null) it.precio = v;
        precio.value = P.formatearCLP(it.precio);
        guardarItems();
        actualizar();
      });
      tdPrecio.appendChild(precio);

      const tdCant = document.createElement('td');
      tdCant.className = 'num';
      const cant = document.createElement('input');
      cant.type = 'number';
      cant.min = '0';
      cant.value = it.cantidad;
      cant.addEventListener('input', () => {
        it.cantidad = Math.max(0, parseInt(cant.value, 10) || 0);
        guardarItems();
        actualizarPronto();
      });
      tdCant.appendChild(cant);

      const tdQuitar = document.createElement('td');
      const quitar = document.createElement('button');
      quitar.className = 'quitar';
      quitar.title = 'Quitar';
      quitar.textContent = '×';
      quitar.addEventListener('click', () => {
        estado.items.splice(i, 1);
        guardarItems();
        pintarTabla();
        actualizar();
      });
      tdQuitar.appendChild(quitar);

      tr.append(tdNombre, tdPrecio, tdCant, tdQuitar);
      cuerpo.appendChild(tr);
    });
    $('tablaVacia').hidden = estado.items.length > 0;
  }

  // ------------------------------------------------------------ Bsale

  function mensajeBsale(texto, tipo) {
    const el = $('mensajeBsale');
    el.textContent = texto || '';
    el.className = 'mensaje' + (tipo ? ' mensaje--' + tipo : '');
  }

  function mostrarBsale() {
    const b = estado.bsale;
    const pedirClave = b.requiereClave && !b.clave;
    $('seccionBsale').hidden = !b.activo;
    $('bsaleClave').hidden = !pedirClave;
    $('bsaleBuscador').hidden = pedirClave;
  }

  async function iniciarBsale() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('/api/estado').then((x) => x.json());
      estado.bsale.activo = !!r.bsale;
      estado.bsale.requiereClave = !!r.requiereClave;
      estado.bsale.clave = local.leer(CLAVE_ACCESO) || '';
      mostrarBsale();
    } catch (e) {
      /* sin servidor: solo lista manual */
    }
  }

  let busqueda = 0;
  async function buscar(q) {
    const n = ++busqueda;
    if (!q) {
      estado.resultados = [];
      pintarResultados('');
      mensajeBsale('');
      return;
    }
    mensajeBsale('Buscando…');
    try {
      const r = await fetch('/api/bsale/buscar?q=' + encodeURIComponent(q), {
        headers: { 'X-Clave': estado.bsale.clave || '' }
      });
      const json = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));
      if (n !== busqueda) return; // llegó una búsqueda más nueva
      if (r.status === 401) {
        estado.bsale.clave = '';
        local.guardar(CLAVE_ACCESO, null);
        mostrarBsale();
      }
      if (!r.ok || !json.ok) throw new Error(json.error || 'Error ' + r.status);
      estado.resultados = json.productos;
      pintarResultados(q);
      mensajeBsale('');
    } catch (e) {
      if (n === busqueda) mensajeBsale(e.message, 'error');
    }
  }

  function agregarDesdeBsale(p) {
    if (p.precio == null) {
      mensajeBsale(`"${p.nombre}" no tiene precio en la lista de Bsale.`, 'error');
      return;
    }
    agregar([{ precio: p.precio, cantidad: 1, nombre: p.nombre, bsaleId: p.id }]);
    mensajeBsale(`Agregado: ${p.nombre} · $${P.formatearCLP(p.precio)}`, 'ok');
  }

  function pintarResultados(q) {
    const ul = $('resultados');
    ul.innerHTML = '';
    if (!q) return;
    if (!estado.resultados.length) {
      const li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'Sin resultados en Bsale.';
      ul.appendChild(li);
      return;
    }
    for (const p of estado.resultados) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.textContent = p.nombre || '(sin nombre)';
      const det = document.createElement('span');
      det.className = 'detalle';
      det.textContent = [p.sku && 'SKU ' + p.sku, p.codigo].filter(Boolean).join(' · ');
      info.appendChild(det);
      const precio = document.createElement('span');
      precio.className = 'precio';
      precio.textContent = p.precio == null ? 'sin precio' : '$' + P.formatearCLP(p.precio);
      const boton = document.createElement('button');
      boton.className = 'boton';
      boton.textContent = 'Agregar';
      boton.disabled = p.precio == null;
      boton.addEventListener('click', () => agregarDesdeBsale(p));
      li.append(info, precio, boton);
      ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------ vista previa

  const ESCALA = 8; // px de canvas por mm

  function dibujarFila(fila) {
    const a = estado.ajustes;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(a.anchoPaginaMm * ESCALA);
    canvas.height = Math.round(a.altoPaginaMm * ESCALA);
    const ctx = canvas.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    // Etiquetas físicas de ~48 × 25 mm sobre el soporte
    for (const cx of [a.centroIzqMm, a.centroDerMm]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - 24, 0.2, 48, a.altoPaginaMm - 0.4, 2);
      else ctx.rect(cx - 24, 0.2, 48, a.altoPaginaMm - 0.4);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const el of P.disenoFila(fila, a, medir)) {
      const mm = el.puntos / P.PT_POR_MM;
      ctx.font = `bold ${mm}px Helvetica, Arial, sans-serif`;
      ctx.fillText(el.texto, el.x, el.y);
    }
    return canvas;
  }

  function filas() {
    return P.agruparFilas(P.expandir(estado.items));
  }

  let temporizador = null;
  function actualizarPronto() {
    clearTimeout(temporizador);
    temporizador = setTimeout(actualizar, 200);
  }

  function actualizar() {
    const fs = filas();
    const total = fs.reduce((n, f) => n + f.filter(Boolean).length, 0);
    $('resumen').textContent = total ? `${total} etiquetas · ${fs.length} páginas` : '';
    $('previaInfo').textContent = fs.length ? `${fs.length} páginas de 100 × 25 mm` : '';
    const cont = $('previa');
    cont.innerHTML = '';
    fs.slice(0, MAX_FILAS_PREVIA).forEach((f) => cont.appendChild(dibujarFila(f)));
    const mas = $('previaMas');
    mas.hidden = fs.length <= MAX_FILAS_PREVIA;
    mas.textContent = `… y ${fs.length - MAX_FILAS_PREVIA} páginas más (todas van en el PDF).`;
    $('btnPdf').disabled = !fs.length;
    $('btnAbrir').disabled = !fs.length;
  }

  // ------------------------------------------------------------ PDF

  function generarPDF() {
    const a = estado.ajustes;
    const formato = [a.anchoPaginaMm, a.altoPaginaMm];
    const orientacion = a.anchoPaginaMm > a.altoPaginaMm ? 'landscape' : 'portrait';
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: formato, orientation: orientacion });
    doc.setFont('helvetica', 'bold');
    doc.setProperties({ title: 'Etiquetas de precio' });
    filas().forEach((fila, i) => {
      if (i > 0) doc.addPage(formato, orientacion);
      for (const el of P.disenoFila(fila, a, medir)) {
        doc.setFontSize(el.puntos);
        doc.text(el.texto, el.x, el.y, { align: 'center' });
      }
    });
    return doc;
  }

  function nombreArchivo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `precios-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`;
  }

  // ------------------------------------------------------------ ajustes

  function pintarAjustes() {
    document.querySelectorAll('[data-ajuste]').forEach((el) => {
      const v = estado.ajustes[el.dataset.ajuste];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
    });
  }

  // ------------------------------------------------------------ eventos

  function enlazar() {
    $('formPrecio').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const precio = P.parsePrecio($('nuevoPrecio').value);
      if (precio === null) return;
      agregar([{ precio, cantidad: parseInt($('nuevaCantidad').value, 10) || 1 }]);
      $('nuevoPrecio').value = '';
      $('nuevaCantidad').value = '1';
      $('nuevoPrecio').focus();
    });
    $('btnLista').addEventListener('click', () => {
      const lista = P.parsearLista($('lista').value);
      if (!lista.length) return;
      agregar(lista);
      $('lista').value = '';
    });
    $('btnVaciar').addEventListener('click', () => {
      if (estado.items.length && !confirm('¿Vaciar la lista?')) return;
      estado.items = [];
      guardarItems();
      pintarTabla();
      actualizar();
    });

    document.querySelectorAll('[data-ajuste]').forEach((el) =>
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const k = el.dataset.ajuste;
        estado.ajustes[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        estado.ajustes = P.normalizarAjustes(estado.ajustes);
        guardarAjustes();
        actualizarPronto();
      })
    );
    $('btnRestaurar').addEventListener('click', () => {
      estado.ajustes = P.normalizarAjustes({});
      guardarAjustes();
      pintarAjustes();
      actualizar();
    });

    $('btnPdf').addEventListener('click', () => generarPDF().save(nombreArchivo()));
    $('btnAbrir').addEventListener('click', () => {
      const url = generarPDF().output('bloburl');
      window.open(url, '_blank');
    });

    // Bsale
    const entrar = () => {
      estado.bsale.clave = $('clave').value;
      local.guardar(CLAVE_ACCESO, estado.bsale.clave);
      $('clave').value = '';
      mostrarBsale();
      $('buscar').focus();
    };
    $('btnClave').addEventListener('click', entrar);
    $('clave').addEventListener('keydown', (ev) => ev.key === 'Enter' && entrar());

    let t = null;
    const input = $('buscar');
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      t = setTimeout(() => buscar(q), q.length < 3 ? 0 : 400);
    });
    // Lector de códigos: escribe el código y envía Enter -> agrega directo si hay un solo calce.
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      clearTimeout(t);
      const q = input.value.trim();
      if (!q) return;
      await buscar(q);
      const exactos = estado.resultados.filter((p) => p.codigo === q || (p.sku && p.sku.toLowerCase() === q.toLowerCase()));
      const elegido = exactos.length === 1 ? exactos[0] : estado.resultados.length === 1 ? estado.resultados[0] : null;
      if (elegido) {
        agregarDesdeBsale(elegido);
        input.value = '';
        pintarResultados('');
      }
    });
  }

  // ------------------------------------------------------------ inicio

  estado.ajustes = P.normalizarAjustes(local.leer(CLAVE_AJUSTES) || {});
  estado.items = (local.leer(CLAVE_ITEMS) || [])
    .filter((x) => x && P.parsePrecio(x.precio) !== null)
    .map((x) => ({ precio: P.parsePrecio(x.precio), cantidad: Math.max(0, parseInt(x.cantidad, 10) || 0), nombre: x.nombre || '', bsaleId: x.bsaleId || null }));
  enlazar();
  pintarAjustes();
  pintarTabla();
  actualizar();
  iniciarBsale();
})();
