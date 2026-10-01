"""
Búsqueda de productos en Bsale (API v1) para las etiquetas de precio.

Variables de entorno:
    BSALE_ACCESS_TOKEN   token de la API (Bsale → Configuración → API / integraciones)
    BSALE_LISTA_PRECIO   (opcional) id de la lista de precios; por defecto la primera activa
    BSALE_API_URL        (opcional) por defecto https://api.bsale.io/v1

El token nunca llega al navegador: el servidor hace las consultas.
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

MAX_RESULTADOS = 20
DURACION_CACHE = 300  # segundos

_cache = {}
_candado = threading.Lock()


class ErrorBsale(Exception):
    pass


def configurado():
    return bool(os.environ.get("BSALE_ACCESS_TOKEN", "").strip())


def _url_base():
    return os.environ.get("BSALE_API_URL", "https://api.bsale.io/v1").rstrip("/")


def _get(ruta, **params):
    params = {k: v for k, v in params.items() if v is not None}
    url = f"{_url_base()}/{ruta}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "access_token": os.environ.get("BSALE_ACCESS_TOKEN", "").strip(),
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ErrorBsale("Bsale rechazó el token (revisa BSALE_ACCESS_TOKEN)") from e
        if e.code == 404:
            return {}
        raise ErrorBsale(f"Bsale respondió {e.code}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise ErrorBsale("No se pudo conectar con Bsale") from e


def _cacheado(clave, funcion):
    ahora = time.time()
    with _candado:
        v = _cache.get(clave)
        if v and ahora - v[0] < DURACION_CACHE:
            return v[1]
    valor = funcion()
    with _candado:
        _cache[clave] = (ahora, valor)
    return valor


def _items(datos):
    """Bsale entrega colecciones como {"items": [...]} (o lista al expandir)."""
    if isinstance(datos, list):
        return datos
    if isinstance(datos, dict):
        return datos.get("items") or []
    return []


def lista_precio():
    fija = os.environ.get("BSALE_LISTA_PRECIO", "").strip()
    if fija:
        return fija

    def primera():
        listas = _items(_get("price_lists.json", state=0, limit=50))
        if not listas:
            raise ErrorBsale("La cuenta de Bsale no tiene listas de precio activas")
        return str(listas[0]["id"])

    return _cacheado("lista", primera)


def precio_variante(variante_id):
    lista = lista_precio()

    def consultar():
        detalles = _items(_get(f"price_lists/{lista}/details.json", variantid=variante_id))
        if not detalles:
            return None
        d = detalles[0]
        valor = d.get("variantValueWithTaxes")
        if valor is None:
            valor = d.get("variantValue")
        return None if valor is None else int(round(float(valor)))

    return _cacheado(("precio", lista, variante_id), consultar)


def _nombre(producto, variante):
    nombre = (producto or {}).get("name") or ""
    desc = (variante.get("description") or "").strip()
    if desc and desc.lower() not in nombre.lower():
        nombre = f"{nombre} {desc}".strip()
    return nombre or desc


def _parece_codigo(q):
    return bool(re.fullmatch(r"[\w.\-/]+", q))


def buscar(q):
    """Lista de {id, nombre, sku, codigo, precio} que calzan con q."""
    q = (q or "").strip()[:100]
    if not q:
        return []
    pares = []  # (producto, variante)

    if _parece_codigo(q):
        for filtro in ("barcode", "code"):
            variantes = _items(_get("variants.json", **{filtro: q, "expand": "[product]", "limit": MAX_RESULTADOS}))
            pares = [(v.get("product") or {}, v) for v in variantes]
            if pares:
                break

    if not pares:
        productos = _items(_get("products.json", name=q, state=0, expand="[variants]", limit=MAX_RESULTADOS))
        for p in productos:
            for v in _items(p.get("variants")):
                if str(v.get("state", 0)) == "0":
                    pares.append((p, v))

    pares = pares[:MAX_RESULTADOS]
    with ThreadPoolExecutor(max_workers=8) as ex:
        precios = list(ex.map(lambda par: precio_variante(par[1]["id"]), pares))

    return [
        {
            "id": v["id"],
            "nombre": _nombre(p, v),
            "sku": v.get("code") or "",
            "codigo": v.get("barCode") or "",
            "precio": precio,
        }
        for (p, v), precio in zip(pares, precios)
    ]
