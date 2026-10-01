"""
Catálogo de productos en PostgreSQL (Railway).

Se activa cuando existe la variable DATABASE_URL y está instalado psycopg
(pip install "psycopg[binary]"). Cada producto se identifica por su SKU o, si no
tiene, por su código de barras: importar un CSV actualiza los existentes en vez de
duplicarlos.
"""

import os

try:
    import psycopg  # type: ignore
    from psycopg.rows import dict_row  # type: ignore
except ImportError:  # la laptop de la impresora no necesita la base de datos
    psycopg = None

ESQUEMA = """
CREATE TABLE IF NOT EXISTS productos (
    id          BIGSERIAL PRIMARY KEY,
    clave       TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL DEFAULT '',
    sku         TEXT NOT NULL DEFAULT '',
    codigo      TEXT NOT NULL DEFAULT '',
    precio      INTEGER,
    creado      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS productos_nombre ON productos (lower(nombre));
"""

# Un valor vacío en la importación no borra el dato que ya estaba guardado.
UPSERT = """
INSERT INTO productos (clave, nombre, sku, codigo, precio)
VALUES (%(clave)s, %(nombre)s, %(sku)s, %(codigo)s, %(precio)s)
ON CONFLICT (clave) DO UPDATE SET
    nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), productos.nombre),
    sku = COALESCE(NULLIF(EXCLUDED.sku, ''), productos.sku),
    codigo = COALESCE(NULLIF(EXCLUDED.codigo, ''), productos.codigo),
    precio = COALESCE(EXCLUDED.precio, productos.precio),
    actualizado = now()
RETURNING (xmax = 0) AS insertado
"""

MAX_LIMITE = 200
MAX_IMPORTAR = 20000


def url_base():
    return os.environ.get("DATABASE_URL", "").strip()


def disponible():
    """(bool, motivo) — si el catálogo se puede usar en este servidor."""
    if not url_base():
        return False, "No hay base de datos configurada (DATABASE_URL)."
    if psycopg is None:
        return False, 'Falta el paquete psycopg: pip install "psycopg[binary]"'
    return True, ""


def conectar():
    return psycopg.connect(url_base(), row_factory=dict_row, connect_timeout=10)


_esquema_listo = False


def preparar():
    global _esquema_listo
    if _esquema_listo:
        return
    with conectar() as con:
        con.execute(ESQUEMA)
    _esquema_listo = True


def _texto(v, largo=300):
    return str(v if v is not None else "").strip()[:largo]


def _precio(v):
    if v is None or v == "":
        return None
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return n if 0 <= n < 2_000_000_000 else None


def normalizar(p):
    """Producto listo para guardar, o None si no tiene SKU ni código."""
    if not isinstance(p, dict):
        return None
    sku = _texto(p.get("sku"), 100)
    codigo = _texto(p.get("codigo"), 100)
    clave = ("sku:" + sku.upper()) if sku else ("cod:" + codigo) if codigo else ""
    if not clave:
        return None
    return {
        "clave": clave,
        "nombre": _texto(p.get("nombre")),
        "sku": sku,
        "codigo": codigo,
        "precio": _precio(p.get("precio")),
    }


def buscar(q="", limite=50):
    preparar()
    limite = max(1, min(MAX_LIMITE, int(limite or 50)))
    q = _texto(q, 100)
    with conectar() as con:
        if q:
            patron = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            filas = con.execute(
                """SELECT id, nombre, sku, codigo, precio FROM productos
                   WHERE nombre ILIKE %(p)s OR sku ILIKE %(p)s OR codigo ILIKE %(p)s
                   ORDER BY (sku ILIKE %(q)s OR codigo = %(q)s) DESC, nombre
                   LIMIT %(l)s""",
                {"p": patron, "q": q, "l": limite},
            ).fetchall()
        else:
            filas = con.execute(
                "SELECT id, nombre, sku, codigo, precio FROM productos ORDER BY actualizado DESC, nombre LIMIT %s",
                (limite,),
            ).fetchall()
        total = con.execute("SELECT count(*) AS n FROM productos").fetchone()["n"]
    return {"productos": filas, "total": total}


def guardar(productos):
    """Inserta o actualiza. Devuelve cuántos se insertaron, actualizaron y omitieron."""
    if not isinstance(productos, list):
        raise ValueError("Se esperaba una lista de productos")
    if len(productos) > MAX_IMPORTAR:
        raise ValueError(f"Máximo {MAX_IMPORTAR} productos por vez")
    preparar()
    # Si el mismo SKU viene repetido en el archivo, gana la última fila.
    por_clave = {}
    omitidos = 0
    for p in productos:
        n = normalizar(p)
        if n is None:
            omitidos += 1
        else:
            por_clave[n["clave"]] = n
    insertados = actualizados = 0
    with conectar() as con:
        with con.cursor() as cur:
            for fila in por_clave.values():
                cur.execute(UPSERT, fila)
                if cur.fetchone()["insertado"]:
                    insertados += 1
                else:
                    actualizados += 1
    return {"insertados": insertados, "actualizados": actualizados, "omitidos": omitidos}


def eliminar(ids):
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise ValueError("Se esperaba una lista de ids")
    preparar()
    with conectar() as con:
        cur = con.execute("DELETE FROM productos WHERE id = ANY(%s)", (ids,))
        return {"eliminados": cur.rowcount}
