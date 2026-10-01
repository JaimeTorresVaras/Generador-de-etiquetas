#!/usr/bin/env python3
"""
Servidor local del Generador de etiquetas.

Sirve la interfaz web (carpeta web/) en http://127.0.0.1:8765 y envía los comandos
EPL2 en crudo (RAW) a la Zebra GK888t, sin pasar por Acrobat ni por el escalado del
driver.

Uso:
    python servidor.py                      # abre el navegador
    python servidor.py --puerto 8800
    python servidor.py --simular            # no imprime: guarda los trabajos en salida/
    python servidor.py --enviar archivo.epl  # envía un archivo EPL y termina
    python servidor.py --nube               # solo interfaz (Railway); no imprime

Si la interfaz se abre desde Railway, el navegador imprime a través de este
servidor corriendo en la laptop de la impresora (http://127.0.0.1:8765). Para
eso, la URL de Railway debe estar en origenes-permitidos.txt (una por línea)
o pasarse con --permitir https://mi-app.up.railway.app

Catálogo de productos (opcional): con DATABASE_URL (PostgreSQL) y psycopg
instalado se habilita /api/catalogo. En modo nube exige CLAVE_ACCESO, que la
interfaz envía en la cabecera X-Clave.

La impresión solo depende de la biblioteca estándar. En Windows necesita pywin32
(pip install pywin32) para hablar con la cola de impresión.
"""

import argparse
import datetime
import hmac
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import threading
import urllib.parse
import webbrowser

import catalogo

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")
SALIDA = os.path.join(BASE, "salida")
AJUSTES = os.path.join(BASE, "ajustes.json")
ORIGENES = os.path.join(BASE, "origenes-permitidos.txt")
IMPRESORA_POR_DEFECTO = "ZDesigner GK888t (EPL)"
MAX_TRABAJO = 5 * 1024 * 1024

try:
    import win32print  # type: ignore
except ImportError:  # no es Windows o falta pywin32
    win32print = None


# --------------------------------------------------------------------- impresión

def listar_impresoras():
    if win32print is not None:
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        return [p[2] for p in win32print.EnumPrinters(flags)]
    if shutil.which("lpstat"):
        try:
            out = subprocess.run(["lpstat", "-e"], capture_output=True, text=True, timeout=5).stdout
            return [l.strip() for l in out.splitlines() if l.strip()]
        except (OSError, subprocess.SubprocessError):
            pass
    return []


def impresora_predeterminada():
    if win32print is not None:
        try:
            return win32print.GetDefaultPrinter()
        except Exception:  # noqa: BLE001 - sin impresora predeterminada
            return ""
    return ""


def codificar(epl):
    # La cabecera usa I8,A,001 (Latin-1): tildes y ñ se envían como cp1252.
    return epl.replace("\r\n", "\n").encode("cp1252", errors="replace")


def enviar_raw(impresora, datos, nombre="Etiquetas", simular=False):
    """Envía bytes sin procesar a la impresora. Devuelve un texto descriptivo."""
    if simular:
        os.makedirs(SALIDA, exist_ok=True)
        marca = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        ruta = os.path.join(SALIDA, f"{marca}.epl")
        with open(ruta, "wb") as f:
            f.write(datos)
        return f"Simulación: guardado en {os.path.relpath(ruta, BASE)}"

    if win32print is not None:
        h = win32print.OpenPrinter(impresora)
        try:
            win32print.StartDocPrinter(h, 1, (nombre, None, "RAW"))
            try:
                win32print.StartPagePrinter(h)
                escritos = win32print.WritePrinter(h, datos)
                win32print.EndPagePrinter(h)
            finally:
                win32print.EndDocPrinter(h)
        finally:
            win32print.ClosePrinter(h)
        return f"Enviados {escritos} bytes a {impresora}"

    if sys.platform == "win32":
        raise RuntimeError("Falta pywin32. Instálalo con:  py -m pip install pywin32")

    if shutil.which("lp"):
        r = subprocess.run(
            ["lp", "-d", impresora, "-o", "raw", "-t", nombre],
            input=datos, capture_output=True, timeout=30,
        )
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode(errors="replace").strip() or "lp falló")
        return f"Enviado a {impresora} con lp"

    raise RuntimeError("No hay forma de imprimir en este equipo. Usa --simular o descarga el .epl.")


# --------------------------------------------------------------------- ajustes

def leer_ajustes():
    try:
        with open(AJUSTES, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def guardar_ajustes(datos):
    tmp = AJUSTES + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, AJUSTES)


def leer_origenes(extra=()):
    """Orígenes (https://dominio) a los que se les permite imprimir desde otra web."""
    origenes = set()
    fuentes = list(extra) + os.environ.get("ORIGENES_PERMITIDOS", "").split(",")
    try:
        with open(ORIGENES, encoding="utf-8") as f:
            fuentes += f.read().splitlines()
    except OSError:
        pass
    for o in fuentes:
        o = o.split("#", 1)[0].strip().rstrip("/")
        if o:
            origenes.add(o.lower())
    return origenes


# --------------------------------------------------------------------- HTTP

class Manejador(http.server.SimpleHTTPRequestHandler):
    simular = False
    nube = False
    origenes = set()
    impresora = IMPRESORA_POR_DEFECTO
    candado = threading.Lock()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, fmt, *args):  # menos ruido en la consola
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        origen = self.headers.get("Origin")
        if origen and self._origen_valido():
            # La interfaz alojada en Railway usa este servidor local como puente de impresión.
            self.send_header("Access-Control-Allow-Origin", origen)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _origen_valido(self):
        # Solo aceptamos peticiones desde la propia página (evita que otra web imprima).
        origen = self.headers.get("Origin")
        if origen is None:
            return True
        url = urllib.parse.urlparse(origen)
        if url.hostname in ("127.0.0.1", "localhost"):
            return True
        if url.netloc and url.netloc == self.headers.get("Host"):
            return True  # misma página (p. ej. la interfaz servida por Railway)
        return origen.rstrip("/").lower() in self.origenes

    def do_OPTIONS(self):
        # Preflight CORS / Private Network Access desde la página de Railway.
        if not self._origen_valido():
            return self._json(403, {"ok": False, "error": "Origen no permitido"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Clave")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _leer_json(self):
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise ValueError("Se esperaba JSON")
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > MAX_TRABAJO:
            raise ValueError("Trabajo demasiado grande")
        return json.loads(self.rfile.read(largo) or b"{}")

    # ----------------------------------------------------------- catálogo

    def _catalogo_estado(self):
        ok, motivo = catalogo.disponible()
        clave = os.environ.get("CLAVE_ACCESO", "")
        if ok and self.nube and not clave:
            ok, motivo = False, "Falta la variable CLAVE_ACCESO en Railway."
        return {"ok": True, "disponible": ok, "motivo": motivo, "requiereClave": bool(clave)}

    def _catalogo_autorizado(self):
        clave = os.environ.get("CLAVE_ACCESO", "")
        if not clave:
            return not self.nube  # sin clave solo se permite en la laptop (127.0.0.1)
        enviada = self.headers.get("X-Clave") or ""
        return hmac.compare_digest(enviada.encode("utf-8"), clave.encode("utf-8"))

    def _catalogo(self, metodo, ruta, consulta=None, datos=None):
        if ruta == "/api/catalogo/estado":
            return self._json(200, self._catalogo_estado())
        estado = self._catalogo_estado()
        if not estado["disponible"]:
            return self._json(503, {"ok": False, "error": estado["motivo"]})
        if not self._catalogo_autorizado():
            return self._json(401, {"ok": False, "error": "Clave incorrecta", "requiereClave": True})
        try:
            if metodo == "GET" and ruta == "/api/catalogo":
                q = (consulta.get("q") or [""])[0]
                limite = (consulta.get("limite") or ["50"])[0]
                return self._json(200, dict(ok=True, **catalogo.buscar(q, int(limite) if limite.isdigit() else 50)))
            if metodo == "POST" and ruta == "/api/catalogo/guardar":
                return self._json(200, dict(ok=True, **catalogo.guardar(datos.get("productos"))))
            if metodo == "POST" and ruta == "/api/catalogo/eliminar":
                return self._json(200, dict(ok=True, **catalogo.eliminar(datos.get("ids"))))
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001 - error de base de datos
            sys.stderr.write(f"Error del catálogo: {type(e).__name__}: {e}\n")
            return self._json(500, {"ok": False, "error": "Error de la base de datos: " + type(e).__name__})
        return self._json(404, {"ok": False, "error": "Ruta desconocida"})

    # ----------------------------------------------------------- rutas

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        ruta = url.path
        if ruta.startswith("/api/catalogo"):
            return self._catalogo("GET", ruta, urllib.parse.parse_qs(url.query))
        if ruta == "/api/estado" and self.nube:
            return self._json(200, {"ok": True, "nube": True, "raw": False, "impresoras": []})
        if ruta == "/api/estado":
            return self._json(200, {
                "nube": False,
                "origenPermitido": self._origen_valido(),
                "ok": True,
                "plataforma": sys.platform,
                "raw": win32print is not None or bool(shutil.which("lp")),
                "simular": self.simular,
                "impresoras": listar_impresoras(),
                "predeterminada": impresora_predeterminada(),
                "impresoraSugerida": self.impresora,
            })
        if ruta == "/api/ajustes":
            return self._json(200, {} if self.nube else leer_ajustes())
        return super().do_GET()

    def do_POST(self):
        ruta = urllib.parse.urlparse(self.path).path
        if not self._origen_valido():
            return self._json(403, {"ok": False, "error": "Origen no permitido"})
        if self.nube and not ruta.startswith("/api/catalogo"):
            return self._json(403, {"ok": False, "error": "La versión en la nube no imprime: usa el servidor local"})
        try:
            datos = self._leer_json()
        except (ValueError, json.JSONDecodeError) as e:
            return self._json(400, {"ok": False, "error": str(e)})
        if not isinstance(datos, dict):
            return self._json(400, {"ok": False, "error": "Se esperaba un objeto JSON"})

        if ruta.startswith("/api/catalogo"):
            return self._catalogo("POST", ruta, datos=datos)

        if ruta == "/api/imprimir":
            epl = datos.get("epl")
            impresora = (datos.get("impresora") or self.impresora).strip()
            if not isinstance(epl, str) or not epl.strip():
                return self._json(400, {"ok": False, "error": "No hay comandos para imprimir"})
            try:
                with self.candado:  # un trabajo a la vez
                    msg = enviar_raw(impresora, codificar(epl), datos.get("nombre") or "Etiquetas", self.simular)
            except Exception as e:  # noqa: BLE001 - se informa a la interfaz
                return self._json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})
            return self._json(200, {"ok": True, "mensaje": msg})

        if ruta == "/api/ajustes":
            if not isinstance(datos, dict):
                return self._json(400, {"ok": False, "error": "Ajustes inválidos"})
            guardar_ajustes(datos)
            return self._json(200, {"ok": True})

        return self._json(404, {"ok": False, "error": "Ruta desconocida"})


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    p = argparse.ArgumentParser(description="Generador de etiquetas para Zebra GK888t (EPL2 RAW)")
    p.add_argument("--puerto", type=int, default=8765)
    p.add_argument("--impresora", default=IMPRESORA_POR_DEFECTO, help="nombre de la impresora en Windows")
    p.add_argument("--simular", action="store_true", help="no imprimir; guardar los trabajos en salida/")
    p.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    p.add_argument("--enviar", metavar="ARCHIVO", help="enviar un archivo EPL a la impresora y salir")
    p.add_argument("--nube", action="store_true",
                   help="modo alojado (Railway): escucha en 0.0.0.0:$PORT, solo sirve la interfaz")
    p.add_argument("--permitir", action="append", default=[], metavar="ORIGEN",
                   help="URL de la interfaz alojada que puede imprimir aquí (ej. https://x.up.railway.app)")
    args = p.parse_args()
    nube = args.nube or bool(os.environ.get("RAILWAY_ENVIRONMENT"))

    if args.enviar:
        with open(args.enviar, "rb") as f:
            print(enviar_raw(args.impresora, f.read(), os.path.basename(args.enviar), args.simular))
        return

    if nube:
        Manejador.nube = True
        puerto = int(os.environ.get("PORT") or args.puerto)
        srv = Servidor(("0.0.0.0", puerto), Manejador)
        print(f"Generador de etiquetas (modo nube) en el puerto {puerto}", flush=True)
        try:
            srv.serve_forever()
        finally:
            srv.server_close()
        return

    Manejador.simular = args.simular
    Manejador.impresora = args.impresora
    Manejador.origenes = leer_origenes(args.permitir)
    srv = Servidor(("127.0.0.1", args.puerto), Manejador)
    url = f"http://127.0.0.1:{args.puerto}/"
    print(f"Generador de etiquetas en {url}")
    for o in sorted(Manejador.origenes):
        print(f"Permite imprimir desde: {o}")
    print("Modo simulación: los trabajos se guardan en salida/" if args.simular else f"Impresora: {args.impresora}")
    if win32print is None and sys.platform == "win32":
        print("AVISO: falta pywin32 -> py -m pip install pywin32")
    print("Cierra esta ventana (o Ctrl+C) para detener.")
    if not args.sin_navegador:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
