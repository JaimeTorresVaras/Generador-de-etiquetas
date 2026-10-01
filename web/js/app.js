/* Interfaz: productos, vista previa, impresión RAW y respaldo PDF. */
(function () {
  'use strict';

  const E = window.Etiquetas;
  const $ = (id) => document.getElementById(id);
  const MAX_FILAS_PREVIA = 40;
  const CLAVE_PRODUCTOS = 'etiquetas.productos';
  const CLAVE_AJUSTES = 'etiquetas.ajustes';
  const CLAVE_CATALOGO = 'etiquetas.claveCatalogo';
  // Servidor local que hace de puente cuando la interfaz se abre desde Railway.
  const PUENTE_LOCAL = 'http://127.0.0.1:8765';

  const estado = {
    productos: [],
    ajustes: E.normalizarAjustes({}),
    servidor: false,
    base: '', // '' = mismo servidor; PUENTE_LOCAL = interfaz en la nube
    csvPendiente: null,
    catalogo: { disponible: false, clave: '' }
  };

  // ------------------------------------------------------------ almacenamiento

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
        /* modo privado o almacenamiento bloqueado */
      }
    }
  };

  async function api(ruta, datos) {
    const opciones = datos === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) };
    const r = await fetch(estado.base + ruta, opciones);
    const json = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));
    if (!r.ok || json.ok === false) throw new Error(json.error || 'Error ' + r.status);
    return json;
  }

  let temporizadorAjustes = null;
  function guardarAjustes() {
    local.guardar(CLAVE_AJUSTES, estado.ajustes);
    clearTimeout(temporizadorAjustes);
    temporizadorAjustes = setTimeout(async () => {
      if (!estado.servidor) return;
      try {
        await api('/api/ajustes', estado.ajustes);
        $('ajustesGuardados').textContent = 'Ajustes guardados en ajustes.json de este computador';
      } catch (e) {
        $('ajustesGuardados').textContent = 'No se pudieron guardar: ' + e.message;
      }
    }, 400);
  }

  const guardarProductos = () => local.guardar(CLAVE_PRODUCTOS, estado.productos);

  // ------------------------------------------------------------ servidor

  async function estadoServidor() {
    if (location.protocol !== 'file:') {
      estado.base = '';
      const s = await api('/api/estado').catch(() => null);
      if (s && !s.nube) return s;
    }
    // Interfaz en Railway (o abierta como archivo): usar el servidor local como puente.
    estado.base = PUENTE_LOCAL;
    return api('/api/estado');
  }

  async function conectar() {
    const el = $('estado');
    try {
      const s = await estadoServidor();
      estado.servidor = true;
      const dl = $('listaImpresoras');
      dl.innerHTML = '';
      for (const p of s.impresoras || []) {
        const o = document.createElement('option');
        o.value = p;
        dl.appendChild(o);
      }
      const guardados = await api('/api/ajustes').catch(() => ({}));
      if (guardados && Object.keys(guardados).length) {
        estado.ajustes = E.normalizarAjustes(Object.assign({}, estado.ajustes, guardados));
      }
      if (!estado.ajustes.impresora) estado.ajustes.impresora = s.impresoraSugerida;
      const lista = s.impresoras || [];
      if (s.simular) {
        el.className = 'estado estado--aviso';
        el.textContent = 'Modo simulación (salida/)';
      } else if (!s.raw) {
        el.className = 'estado estado--error';
        el.textContent = s.plataforma === 'win32' ? 'Falta pywin32' : 'Sin cola de impresión';
      } else if (lista.length && !lista.includes(estado.ajustes.impresora)) {
        el.className = 'estado estado--aviso';
        el.textContent = 'Impresora no encontrada';
      } else {
        el.className = 'estado estado--ok';
        el.textContent = 'Listo para imprimir';
      }
      pintarAjustes();
      actualizar();
    } catch (e) {
      el.className = 'estado estado--error';
      if (estado.base === PUENTE_LOCAL) {
        el.textContent = 'Sin conexión con la impresora';
        mensaje(
          'Para imprimir desde esta página, abre iniciar.bat en el computador de la impresora y agrega ' +
            location.origin + ' al archivo origenes-permitidos.txt. Mientras tanto puedes descargar .epl o PDF.',
          'error'
        );
      } else {
        el.textContent = 'Servidor no responde';
      }
    }
  }

  // ------------------------------------------------------------ productos

  const CAMPOS = [
    ['nombre', 'text'],
    ['sku', 'text'],
    ['codigo', 'text'],
    ['precio', 'text'],
    ['cantidad', 'number']
  ];

  function pintarTabla() {
    const cuerpo = $('cuerpoTabla');
    cuerpo.innerHTML = '';
    estado.productos.forEach((p, i) => {
      const tr = document.createElement('tr');
      for (const [campo, tipo] of CAMPOS) {
        const td = document.createElement('td');
        if (campo === 'precio' || campo === 'cantidad') td.className = 'num';
        const input = document.createElement('input');
        input.type = tipo;
        if (tipo === 'number') input.min = '0';
        if (campo === 'precio') input.inputMode = 'numeric';
        input.value = p[campo] == null ? '' : p[campo];
        input.addEventListener('input', () => {
          p[campo] = campo === 'cantidad' ? Math.max(0, parseInt(input.value, 10) || 0) : input.value;
          guardarProductos();
          actualizarPronto();
        });
        td.appendChild(input);
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      const quitar = document.createElement('button');
      quitar.className = 'quitar';
      quitar.title = 'Quitar';
      quitar.textContent = '×';
      quitar.addEventListener('click', () => {
        estado.productos.splice(i, 1);
        guardarProductos();
        pintarTabla();
        actualizar();
      });
      td.appendChild(quitar);
      tr.appendChild(td);
      cuerpo.appendChild(tr);
    });
    $('tablaVacia').hidden = estado.productos.length > 0;
  }

  function agregarProductos(lista, reemplazar) {
    if (reemplazar) estado.productos = [];
    estado.productos.push(...lista);
    guardarProductos();
    pintarTabla();
    actualizar();
  }

  // CSV: se lee como UTF-8 y, si trae caracteres inválidos, se reintenta como Windows-1252.
  function leerArchivo(archivo) {
    return archivo.arrayBuffer().then((buf) => {
      let texto = new TextDecoder('utf-8').decode(buf);
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
      return texto;
    });
  }

  function mostrarMapeo(nombreArchivo, filas) {
    const cabecera = E.CSV.tieneCabecera(filas);
    const titulos = cabecera ? filas[0] : filas[0].map((_, i) => 'Columna ' + (i + 1));
    const mapeo = E.CSV.sugerirMapeo(cabecera ? filas[0] : []);
    estado.csvPendiente = { filas, mapeo };
    $('mapeoTitulo').textContent = `${nombreArchivo}: ${filas.length - (cabecera ? 1 : 0)} filas.`;
    $('mapeoCabecera').checked = cabecera;
    const cont = $('mapeoCampos');
    cont.innerHTML = '';
    const nombres = { nombre: 'Nombre', sku: 'SKU', codigo: 'Código de barras', precio: 'Precio', cantidad: 'Cantidad' };
    for (const campo of Object.keys(nombres)) {
      const label = document.createElement('label');
      label.textContent = nombres[campo];
      const sel = document.createElement('select');
      sel.add(new Option('— no usar —', '-1'));
      titulos.forEach((t, i) => {
        const ejemplo = filas[cabecera ? 1 : 0] ? filas[cabecera ? 1 : 0][i] : '';
        sel.add(new Option(`${t}${ejemplo ? ' (ej. ' + String(ejemplo).slice(0, 18) + ')' : ''}`, String(i)));
      });
      sel.value = String(mapeo[campo]);
      sel.addEventListener('change', () => (mapeo[campo] = Number(sel.value)));
      label.appendChild(sel);
      cont.appendChild(label);
    }
    $('panelMapeo').hidden = false;
  }

  function aceptarMapeo(reemplazar) {
    const p = estado.csvPendiente;
    if (!p) return;
    const lista = E.CSV.aProductos(p.filas, p.mapeo, $('mapeoCabecera').checked);
    agregarProductos(lista, reemplazar);
    estado.csvPendiente = null;
    $('panelMapeo').hidden = true;
    mensaje(`${lista.length} productos importados.`, 'ok');
    if (!$('mapeoCatalogoOpcion').hidden && $('mapeoCatalogo').checked) {
      guardarEnCatalogo(lista);
    }
  }

  // ------------------------------------------------------------ catálogo (PostgreSQL)

  // El catálogo vive en el servidor que sirve la página (Railway), no en el puente de impresión.
  async function apiCatalogo(ruta, datos) {
    const headers = { 'X-Clave': estado.catalogo.clave || '' };
    const opciones = { headers };
    if (datos !== undefined) {
      opciones.method = 'POST';
      headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
    const r = await fetch(ruta, opciones);
    const json = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));
    if (r.status === 401) {
      estado.catalogo.clave = null;
      local.guardar(CLAVE_CATALOGO, null);
      mostrarCatalogo();
    }
    if (!r.ok || json.ok === false) throw new Error(json.error || 'Error ' + r.status);
    return json;
  }

  function mensajeCatalogo(texto, tipo) {
    const el = $('catalogoMensaje');
    el.textContent = texto;
    el.className = 'mensaje' + (tipo ? ' mensaje--' + tipo : '');
  }

  function mostrarCatalogo() {
    const c = estado.catalogo;
    $('panelCatalogo').hidden = !c.disponible;
    const pedirClave = c.disponible && c.requiereClave && !c.clave;
    $('catalogoClave').hidden = !pedirClave;
    $('catalogoBuscador').hidden = !c.disponible || pedirClave;
    $('mapeoCatalogoOpcion').hidden = !c.disponible || pedirClave;
  }

  async function iniciarCatalogo() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('/api/catalogo/estado').then((x) => x.json());
      estado.catalogo.disponible = !!r.disponible;
      estado.catalogo.requiereClave = !!r.requiereClave;
      estado.catalogo.clave = local.leer(CLAVE_CATALOGO) || '';
      mostrarCatalogo();
      if (r.disponible && !(r.requiereClave && !estado.catalogo.clave)) buscarCatalogo('');
    } catch (e) {
      /* servidor sin catálogo */
    }
  }

  function aItem(p) {
    return { nombre: p.nombre || '', sku: p.sku || '', codigo: p.codigo || '', precio: p.precio == null ? '' : String(p.precio), cantidad: 1 };
  }

  /** Agrega un producto del catálogo; si ya está en la tabla, suma 1 a la cantidad. */
  function agregarDesdeCatalogo(p) {
    const existente = estado.productos.find(
      (x) => (p.sku && x.sku === p.sku) || (!p.sku && p.codigo && x.codigo === p.codigo)
    );
    if (existente) {
      existente.cantidad = (Number(existente.cantidad) || 0) + 1;
      guardarProductos();
      pintarTabla();
      actualizar();
    } else {
      agregarProductos([aItem(p)]);
    }
    mensajeCatalogo(`Agregado: ${p.nombre || p.sku || p.codigo}`, 'ok');
  }

  let resultadosCatalogo = [];
  let busquedaActual = 0;

  async function buscarCatalogo(q) {
    const n = ++busquedaActual;
    try {
      const r = await apiCatalogo('/api/catalogo?limite=50&q=' + encodeURIComponent(q));
      if (n !== busquedaActual) return; // llegó una búsqueda más nueva
      resultadosCatalogo = r.productos;
      $('catalogoTotal').textContent = `(${r.total} productos)`;
      pintarResultados(q);
    } catch (e) {
      if (n === busquedaActual) mensajeCatalogo('Catálogo: ' + e.message, 'error');
    }
  }

  function pintarResultados(q) {
    const ul = $('resultadosCatalogo');
    ul.innerHTML = '';
    if (!resultadosCatalogo.length) {
      const li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = q ? 'Sin resultados.' : 'El catálogo está vacío: importa un CSV para llenarlo.';
      ul.appendChild(li);
      return;
    }
    for (const p of resultadosCatalogo) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.textContent = p.nombre || '(sin nombre)';
      const det = document.createElement('span');
      det.className = 'detalle';
      det.textContent = [p.sku && 'SKU ' + p.sku, p.codigo].filter(Boolean).join(' · ');
      info.appendChild(det);
      const precio = document.createElement('span');
      precio.className = 'precio';
      precio.textContent = p.precio == null ? '' : '$' + E.formatearCLP(p.precio);
      const acciones = document.createElement('span');
      const agregar = document.createElement('button');
      agregar.className = 'boton';
      agregar.textContent = 'Agregar';
      agregar.addEventListener('click', () => agregarDesdeCatalogo(p));
      const quitar = document.createElement('button');
      quitar.className = 'quitar';
      quitar.title = 'Eliminar del catálogo';
      quitar.textContent = '×';
      quitar.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar "${p.nombre || p.sku}" del catálogo?`)) return;
        try {
          await apiCatalogo('/api/catalogo/eliminar', { ids: [p.id] });
          buscarCatalogo($('buscarCatalogo').value.trim());
        } catch (e) {
          mensajeCatalogo('No se pudo eliminar: ' + e.message, 'error');
        }
      });
      acciones.append(agregar, quitar);
      li.append(info, precio, acciones);
      ul.appendChild(li);
    }
  }

  async function guardarEnCatalogo(lista) {
    const productos = lista
      .filter((p) => p.sku || p.codigo)
      .map((p) => ({ nombre: p.nombre, sku: p.sku, codigo: p.codigo, precio: E.parsePrecio(p.precio) }));
    if (!productos.length) {
      mensajeCatalogo('Ningún producto tiene SKU o código de barras para guardarlo en el catálogo.', 'error');
      return;
    }
    mensajeCatalogo('Guardando en el catálogo…');
    try {
      const r = await apiCatalogo('/api/catalogo/guardar', { productos });
      mensajeCatalogo(`Catálogo: ${r.insertados} nuevos, ${r.actualizados} actualizados` + (r.omitidos ? `, ${r.omitidos} sin SKU/código` : '') + '.', 'ok');
      buscarCatalogo($('buscarCatalogo').value.trim());
    } catch (e) {
      mensajeCatalogo('No se pudo guardar en el catálogo: ' + e.message, 'error');
    }
  }

  function enlazarCatalogo() {
    const entrar = () => {
      estado.catalogo.clave = $('claveCatalogo').value;
      local.guardar(CLAVE_CATALOGO, estado.catalogo.clave);
      $('claveCatalogo').value = '';
      mostrarCatalogo();
      mensajeCatalogo('');
      buscarCatalogo('');
    };
    $('btnClave').addEventListener('click', entrar);
    $('claveCatalogo').addEventListener('keydown', (ev) => ev.key === 'Enter' && entrar());

    let t = null;
    const input = $('buscarCatalogo');
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => buscarCatalogo(input.value.trim()), 250);
    });
    // Lector de código de barras: escribe el código y envía Enter.
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      clearTimeout(t);
      const q = input.value.trim();
      if (!q) return;
      await buscarCatalogo(q);
      const exacto = resultadosCatalogo.filter((p) => p.codigo === q || (p.sku && p.sku.toLowerCase() === q.toLowerCase()));
      const elegido = exacto.length === 1 ? exacto[0] : resultadosCatalogo.length === 1 ? resultadosCatalogo[0] : null;
      if (elegido) {
        agregarDesdeCatalogo(elegido);
        input.value = '';
      } else if (!resultadosCatalogo.length) {
        mensajeCatalogo(`"${q}" no está en el catálogo.`, 'error');
      }
    });
    $('btnGuardarCatalogo').addEventListener('click', () => guardarEnCatalogo(estado.productos));
  }

  // ------------------------------------------------------------ ajustes

  function leerControl(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.dataset.ajuste === 'termicoDirecto') return el.value === 'true';
    if (el.type === 'number' || el.dataset.ajuste === 'velocidad') return Number(el.value);
    return el.value;
  }

  function pintarAjustes() {
    const a = estado.ajustes;
    document.querySelectorAll('[data-ajuste]').forEach((el) => {
      const v = a[el.dataset.ajuste];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
    });
    document.querySelectorAll('input[name=tipo]').forEach((r) => (r.checked = r.value === a.tipo));
    document.querySelectorAll('.campos[data-tipo]').forEach((c) => (c.hidden = c.dataset.tipo !== a.tipo));
  }

  // ------------------------------------------------------------ filas y EPL

  function filasActuales() {
    return E.agruparFilas(E.expandir(estado.productos));
  }

  function generar(filas) {
    const avisos = [];
    const epl = E.generarEPL(filas, estado.ajustes, avisos);
    return { epl, avisos: [...new Set(avisos)] };
  }

  // ------------------------------------------------------------ vista previa

  const ESCALA = 1.5; // px de canvas por dot

  function dibujarTexto(ctx, el) {
    const [, ch] = E.FUENTES[el.fuente];
    ctx.save();
    ctx.font = `bold ${ch * el.v}px Consolas, "Courier New", monospace`;
    ctx.textBaseline = 'top';
    const medido = ctx.measureText(el.texto).width || 1;
    ctx.translate(el.x, el.y);
    ctx.scale(el.ancho / medido, 1);
    ctx.fillText(el.texto, 0, 0);
    ctx.restore();
  }

  function dibujarBarras(ctx, el) {
    let x = el.x;
    E.Code128.anchos(el.datos).forEach((w, i) => {
      if (i % 2 === 0) ctx.fillRect(x, el.y, w * el.angosta, el.alto);
      x += w * el.angosta;
    });
    if (el.legible) {
      ctx.save();
      ctx.font = 'bold 16px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(el.datos, el.x + el.ancho / 2, el.y + el.alto + 4);
      ctx.restore();
    }
  }

  function dibujarFila(fila, guias) {
    const a = estado.ajustes;
    const anchoDots = E.mm(a.anchoImpresionMm);
    const altoDots = E.mm(a.altoEtiquetaMm);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(anchoDots * ESCALA);
    canvas.height = Math.round(altoDots * ESCALA);
    const ctx = canvas.getContext('2d');
    ctx.scale(ESCALA, ESCALA);

    // Etiquetas físicas sobre el soporte
    for (let col = 0; col < 2; col++) {
      const x = E.mm(a.origenXMm + col * a.pasoColumnaMm);
      const w = E.mm(a.anchoEtiquetaMm);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x + 0.5, 0.5, w - 1, altoDots - 1, 16);
      else ctx.rect(x + 0.5, 0.5, w - 1, altoDots - 1);
      ctx.fill();
      if (guias) {
        ctx.strokeStyle = 'rgba(0,0,0,.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#111111';
    for (const el of E.disenoFila(fila, a)) {
      if (el.tipo === 'texto' && el.texto) dibujarTexto(ctx, el);
      else if (el.tipo === 'barras') dibujarBarras(ctx, el);
    }
    return canvas;
  }

  function pintarPrevia(filas, avisos) {
    const cont = $('previa');
    cont.innerHTML = '';
    const guias = $('previaGuias').checked;
    filas.slice(0, MAX_FILAS_PREVIA).forEach((fila, i) => {
      const div = document.createElement('div');
      div.className = 'fila-previa';
      const span = document.createElement('span');
      span.textContent = `Fila ${i + 1}`;
      div.append(span, dibujarFila(fila, guias));
      cont.appendChild(div);
    });
    const mas = $('previaMas');
    mas.hidden = filas.length <= MAX_FILAS_PREVIA;
    mas.textContent = `… y ${filas.length - MAX_FILAS_PREVIA} filas más (se imprimen todas).`;

    const ul = $('avisos');
    ul.innerHTML = '';
    if (!estado.ajustes.termicoDirecto) {
      avisos = avisos.concat('Modo transferencia térmica: si no hay ribbon instalado la impresora se detiene con luz roja.');
    }
    for (const a of avisos.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = a;
      ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------ refresco

  let temporizadorPrevia = null;
  function actualizarPronto() {
    clearTimeout(temporizadorPrevia);
    temporizadorPrevia = setTimeout(actualizar, 200);
  }

  function actualizar() {
    const filas = filasActuales();
    const { epl, avisos } = generar(filas);
    const etiquetas = filas.reduce((n, f) => n + f.filter(Boolean).length, 0);
    $('resumen').textContent = estado.productos.length
      ? `${estado.productos.length} productos · ${etiquetas} etiquetas · ${filas.length} filas`
      : '';
    $('previaInfo').textContent = filas.length ? `${filas.length} filas de 2` : '';
    $('verEpl').value = filas.length ? epl : '';
    pintarPrevia(filas, avisos);
    const hay = filas.length > 0;
    $('btnTodo').disabled = !hay || !estado.servidor;
    $('btnPrueba').disabled = !hay || !estado.servidor;
    ['btnCalibrar', 'btnMarco', 'btnConfig'].forEach((id) => ($(id).disabled = !estado.servidor));
    $('btnEpl').disabled = !hay;
    $('btnPdf').disabled = !hay;
  }

  // ------------------------------------------------------------ acciones

  function mensaje(texto, tipo) {
    const el = $('mensaje');
    el.textContent = texto;
    el.className = 'mensaje' + (tipo ? ' mensaje--' + tipo : '');
  }

  async function imprimir(epl, nombre) {
    if (!estado.servidor) {
      mensaje('No hay conexión con el servidor local (iniciar.bat). Descarga el .epl o el PDF.', 'error');
      return;
    }
    mensaje('Enviando…');
    try {
      const r = await api('/api/imprimir', { epl, impresora: estado.ajustes.impresora, nombre });
      mensaje(r.mensaje, 'ok');
    } catch (e) {
      mensaje('No se pudo imprimir: ' + e.message, 'error');
    }
  }

  function descargar(nombre, contenido, tipo) {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function marcaTiempo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  /** Respaldo: PDF de una fila por página para imprimir con Acrobat en "Tamaño real". */
  function generarPDF(filas) {
    if (!window.jspdf) throw new Error('No se cargó jsPDF');
    // En Acrobat el desfase lo corrige el driver; el PDF va sin offset.
    const a = Object.assign({}, estado.ajustes, { offsetXMm: 0, offsetYMm: 0 });
    const W = a.anchoImpresionMm;
    const H = a.altoEtiquetaMm;
    const d = 1 / E.DOTS_POR_MM;
    const doc = new window.jspdf.jsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'mm', format: [W, H] });
    const ptPorMm = 72 / 25.4;
    doc.setFont('courier', 'bold');
    filas.forEach((fila, i) => {
      if (i > 0) doc.addPage([W, H], W > H ? 'landscape' : 'portrait');
      for (const el of E.disenoFila(fila, a)) {
        if (el.tipo === 'texto' && el.texto) {
          const [cw] = E.FUENTES[el.fuente];
          // Courier: cada carácter mide 0,6 em; igualamos el ancho de celda EPL.
          doc.setFontSize(((cw * el.h * d) / 0.6) * ptPorMm);
          doc.text(el.texto, el.x * d, (el.y + el.alto / 2) * d, { baseline: 'middle' });
        } else if (el.tipo === 'barras') {
          let x = el.x;
          E.Code128.anchos(el.datos).forEach((w, k) => {
            if (k % 2 === 0) doc.rect(x * d, el.y * d, w * el.angosta * d, el.alto * d, 'F');
            x += w * el.angosta;
          });
          doc.setFontSize(7);
          doc.text(el.datos, (el.x + el.ancho / 2) * d, (el.y + el.alto + 4) * d, { align: 'center', baseline: 'top' });
        }
      }
    });
    return doc.output('blob');
  }

  // ------------------------------------------------------------ eventos

  function enlazar() {
    $('archivoCsv').addEventListener('change', async (ev) => {
      const archivo = ev.target.files[0];
      ev.target.value = '';
      if (!archivo) return;
      const filas = E.CSV.parsear(await leerArchivo(archivo));
      if (!filas.length) return mensaje('El archivo está vacío.', 'error');
      mostrarMapeo(archivo.name, filas);
    });
    $('mapeoAceptar').addEventListener('click', () => aceptarMapeo(false));
    $('mapeoReemplazar').addEventListener('click', () => aceptarMapeo(true));
    $('mapeoCancelar').addEventListener('click', () => {
      estado.csvPendiente = null;
      $('panelMapeo').hidden = true;
    });

    $('btnAgregar').addEventListener('click', () => {
      agregarProductos([{ nombre: '', sku: '', codigo: '', precio: '', cantidad: 1 }]);
      const inputs = $('cuerpoTabla').querySelectorAll('tr:last-child input');
      if (inputs[0]) inputs[0].focus();
    });
    $('btnListaPrecios').addEventListener('click', () => {
      $('panelLista').hidden = false;
      $('listaPrecios').focus();
    });
    $('listaCancelar').addEventListener('click', () => ($('panelLista').hidden = true));
    $('listaAceptar').addEventListener('click', () => {
      const lista = E.CSV.parsearListaPrecios($('listaPrecios').value);
      if (!lista.length) return mensaje('No se reconoció ningún precio.', 'error');
      agregarProductos(lista);
      $('listaPrecios').value = '';
      $('panelLista').hidden = true;
      if (estado.ajustes.tipo !== 'precio') {
        estado.ajustes.tipo = 'precio';
        pintarAjustes();
        guardarAjustes();
        actualizar();
      }
    });
    $('btnLimpiar').addEventListener('click', () => {
      if (estado.productos.length && !confirm('¿Vaciar la lista de productos?')) return;
      agregarProductos([], true);
    });
    $('btnCantidadUno').addEventListener('click', () => {
      estado.productos.forEach((p) => (p.cantidad = 1));
      guardarProductos();
      pintarTabla();
      actualizar();
    });

    document.querySelectorAll('input[name=tipo]').forEach((r) =>
      r.addEventListener('change', () => {
        estado.ajustes.tipo = r.value;
        pintarAjustes();
        guardarAjustes();
        actualizar();
      })
    );
    document.querySelectorAll('[data-ajuste]').forEach((el) =>
      el.addEventListener(el.type === 'text' ? 'input' : 'change', () => {
        estado.ajustes[el.dataset.ajuste] = leerControl(el);
        estado.ajustes = E.normalizarAjustes(estado.ajustes);
        guardarAjustes();
        actualizarPronto();
      })
    );
    $('btnRestaurar').addEventListener('click', () => {
      if (!confirm('¿Volver a los valores por defecto? (se conserva la impresora)')) return;
      estado.ajustes = E.normalizarAjustes({ impresora: estado.ajustes.impresora, tipo: estado.ajustes.tipo });
      pintarAjustes();
      guardarAjustes();
      actualizar();
    });
    $('previaGuias').addEventListener('change', actualizar);

    $('btnPrueba').addEventListener('click', () => {
      const filas = filasActuales().slice(0, 1);
      imprimir(generar(filas).epl, 'Etiquetas (prueba)');
    });
    $('btnTodo').addEventListener('click', () => {
      const filas = filasActuales();
      const etiquetas = filas.reduce((n, f) => n + f.filter(Boolean).length, 0);
      if (!confirm(`Se imprimirán ${etiquetas} etiquetas en ${filas.length} filas. ¿Continuar?`)) return;
      imprimir(generar(filas).epl, `Etiquetas (${etiquetas})`);
    });
    $('btnCalibrar').addEventListener('click', () => imprimir(E.eplCalibrar(estado.ajustes), 'Calibrar'));
    $('btnMarco').addEventListener('click', () => imprimir(E.filaPrueba(estado.ajustes), 'Alineación'));
    $('btnConfig').addEventListener('click', () => imprimir(E.eplConfiguracion(), 'Configuración'));

    $('btnEpl').addEventListener('click', () => {
      descargar(`etiquetas-${marcaTiempo()}.epl`, generar(filasActuales()).epl, 'text/plain');
      mensaje('Para imprimir el .epl: compartir la impresora como "Zebra" y ejecutar  copy /b archivo.epl \\\\localhost\\Zebra', 'ok');
    });
    $('btnPdf').addEventListener('click', () => {
      try {
        descargar(`etiquetas-${marcaTiempo()}.pdf`, generarPDF(filasActuales()));
        mensaje('PDF listo. En Acrobat: Tamaño real, una página por hoja, sin "Múltiple".', 'ok');
      } catch (e) {
        mensaje('No se pudo generar el PDF: ' + e.message, 'error');
      }
    });
  }

  // ------------------------------------------------------------ inicio

  estado.ajustes = E.normalizarAjustes(local.leer(CLAVE_AJUSTES) || {});
  estado.productos = (local.leer(CLAVE_PRODUCTOS) || []).filter((p) => p && typeof p === 'object');
  enlazar();
  enlazarCatalogo();
  pintarAjustes();
  pintarTabla();
  actualizar();
  conectar();
  iniciarCatalogo();
})();
