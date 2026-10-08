(function () {
  'use strict';
  const C = window.Codigos, $ = id => document.getElementById(id);
  const CLAVE = 'codigos.items', AJUSTES = 'codigos.ajustes';
  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Sigue sin almacenamiento. */ } }
  let items = [];
  const almacenados = leer(CLAVE);
  if (Array.isArray(almacenados)) {
    for (const it of almacenados) {
      try { const v = C.normalizar(it); C.filas([...items, v]); items.push(v); } catch { /* Ignora registros corruptos. */ }
    }
  }
  function acotar(v, limite) { return Number.isFinite(Number(v)) ? Math.max(-limite, Math.min(limite, Math.round(Number(v) * 8) / 8)) : 0; }
  const guardado = leer(AJUSTES) || {};
  let ajustes = { x: acotar(guardado.x, 2), y: acotar(guardado.y, 1) };
  $('codigoX').value = ajustes.x; $('codigoY').value = ajustes.y;
  function mensaje(texto, error = false) {
    $('mensajeCodigo').textContent = texto;
    $('mensajeCodigo').className = 'mensaje mensaje--' + (error ? 'error' : 'ok');
  }
  function agregar(it) {
    try {
      const v = C.normalizar(it);
      const mismo = items.find(x => x.codigo === v.codigo);
      if (mismo && (mismo.sku !== v.sku || mismo.nombre !== v.nombre)) throw Error('Ese código ya está en el lote con otro nombre o SKU. Revisa el producto.');
      const nuevos = items.map(x => ({ ...x }));
      if (mismo) nuevos[items.indexOf(mismo)].cantidad = C.cantidad(mismo.cantidad + v.cantidad);
      else nuevos.push(v);
      C.filas(nuevos);
      items = nuevos; guardar(CLAVE, items); pintar(); mensaje('Agregado: ' + (v.nombre || v.codigo));
      return true;
    } catch (e) { mensaje(e.message, true); return false; }
  }
  function preparar(p, texto) {
    $('codigoNombre').value = p.nombre || ''; $('codigoSku').value = p.sku || '';
    $('codigoValor').value = p.codigo || p.sku || '';
    $('codigoValor').focus();
    if (texto) mensaje(texto);
  }
  window.CodigosUI = {
    agregarDesdeBsale(p) {
      if (!p.codigo && !p.sku) { preparar(p, 'Completa el código para ' + (p.nombre || 'este producto') + '.'); return false; }
      const ok = agregar({ codigo: p.codigo || p.sku, nombre: p.nombre, sku: p.sku, cantidad: 2, bsaleId: p.id });
      if (!ok) preparar(p);
      return ok;
    }
  };
  function elementos(it, centro) { return window.CodigosPDF.elementos(it, centro, ajustes); }
  function canvasFila(fila) {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 200;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Dos etiquetas del código ' + fila[0].codigo);
    const ctx = canvas.getContext('2d'); ctx.scale(8, 8);
    for (const [i, it] of fila.entries()) {
      const centro = i ? 75 : 25;
      ctx.fillStyle = '#fff'; ctx.fillRect(centro - 24, 0, 48, 25);
      const el = elementos(it, centro); ctx.fillStyle = '#000';
      el.barras.forEach(b => ctx.fillRect(b.x, b.y, b.ancho, b.alto));
      ctx.textAlign = 'center';
      el.textos.forEach(t => { ctx.font = `${t.bold ? 'bold' : 'normal'} ${t.pt / (72 / 25.4)}px Helvetica, Arial, sans-serif`; ctx.fillText(t.texto, t.x, t.y); });
    }
    return canvas;
  }
  function pintar() {
    $('tablaCodigos').replaceChildren();
    items.forEach((it, i) => {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.textContent = it.nombre || '(sin nombre)'; const small = document.createElement('small'); small.textContent = it.sku ? 'SKU: ' + it.sku : 'Sin SKU'; td.append(small);
      const codigo = document.createElement('td'); codigo.textContent = it.codigo;
      const cant = document.createElement('td'), input = document.createElement('input'); input.type = 'number'; input.min = 2; input.max = 1000; input.step = 2; input.value = it.cantidad; input.setAttribute('aria-label', 'Cantidad de ' + it.codigo);
      input.addEventListener('change', () => {
        const anterior = it.cantidad;
        try { it.cantidad = C.cantidad(input.value); C.filas(items); guardar(CLAVE, items); pintar(); }
        catch (e) { it.cantidad = anterior; input.value = anterior; mensaje(e.message, true); }
      }); cant.append(input);
      const quitar = document.createElement('td'), btn = document.createElement('button'); btn.className = 'quitar'; btn.textContent = '×'; btn.setAttribute('aria-label', 'Quitar código ' + it.codigo);
      btn.addEventListener('click', () => { items.splice(i, 1); guardar(CLAVE, items); pintar(); }); quitar.append(btn);
      tr.append(td, codigo, cant, quitar); $('tablaCodigos').append(tr);
    });
    const fs = C.filas(items); $('codigosVacios').hidden = !!items.length;
    $('resumenCodigos').textContent = fs.length ? `${fs.length * 2} etiquetas · ${fs.length} páginas` : '';
    $('infoCodigos').textContent = fs.length ? `${fs.length} páginas de 100 × 25 mm` : '';
    $('previaCodigos').replaceChildren(...fs.slice(0, 30).map(canvasFila));
    $('masCodigos').hidden = fs.length <= 30; $('masCodigos').textContent = `… y ${fs.length - 30} páginas más en el PDF.`;
    $('btnAbrirCodigos').disabled = $('btnPdfCodigos').disabled = !fs.length;
  }
  function pdf() { return window.CodigosPDF.generar(items, ajustes); }
  $('formCodigo').addEventListener('submit', e => {
    e.preventDefault();
    if (agregar({ nombre: $('codigoNombre').value, sku: $('codigoSku').value, codigo: $('codigoValor').value, cantidad: $('codigoCantidad').value })) {
      $('codigoValor').value = ''; $('codigoNombre').value = ''; $('codigoSku').value = ''; $('codigoCantidad').value = 2;
    }
  });
  $('btnCodigoNuevo').addEventListener('click', () => {
    let codigo;
    do {
      const numeros = new Uint32Array(2); crypto.getRandomValues(numeros);
      codigo = '99' + Array.from(numeros, n => String(n % 100000).padStart(5, '0')).join('');
    } while (items.some(it => it.codigo === codigo));
    $('codigoValor').value = codigo; mensaje('Código interno generado. Agrega el nombre y la cantidad para imprimir.');
  });
  $('btnVaciarCodigos').addEventListener('click', () => {
    if (items.length && !confirm('¿Vaciar la lista de códigos?')) return;
    items = []; guardar(CLAVE, items); pintar(); mensaje('');
  });
  $('btnPdfCodigos').addEventListener('click', () => pdf().save('codigos-' + new Date().toISOString().slice(0, 10) + '.pdf'));
  $('btnAbrirCodigos').addEventListener('click', () => {
    const url = pdf().output('bloburl'); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  for (const [id, campo, limite] of [['codigoX', 'x', 2], ['codigoY', 'y', 1]]) {
    $(id).addEventListener('change', () => { ajustes[campo] = acotar($(id).value, limite); $(id).value = ajustes[campo]; guardar(AJUSTES, ajustes); pintar(); });
  }
  function cambiar(tab) {
    for (const nombre of ['Precios', 'Codigos']) {
      const activo = nombre === tab; $('tab' + nombre).setAttribute('aria-selected', String(activo)); $('tab' + nombre).tabIndex = activo ? 0 : -1; $('panel' + nombre).hidden = !activo;
    }
    window.dispatchEvent(new CustomEvent('etiquetas:tab', { detail: tab }));
  }
  for (const nombre of ['Precios', 'Codigos']) {
    $('tab' + nombre).addEventListener('click', () => cambiar(nombre));
    $('tab' + nombre).addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const destino = e.key === 'Home' ? 'Precios' : e.key === 'End' ? 'Codigos' : nombre === 'Precios' ? 'Codigos' : 'Precios'; cambiar(destino); $('tab' + destino).focus();
    });
  }
  pintar();
})();
