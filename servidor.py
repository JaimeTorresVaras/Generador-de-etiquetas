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

Solo depende de la biblioteca estándar. En Windows necesita pywin32
(pip install pywin32) para hablar con la cola de impresión.
"""

import argparse
import datetime
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

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")
SALIDA = os.path.join(BASE, "salida")
AJUSTES = os.path.join(BASE, "ajustes.json")
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


# --------------------------------------------------------------------- HTTP

class Manejador(http.server.SimpleHTTPRequestHandler):
    simular = False
    impresora = IMPRESORA_POR_DEFECTO
    candado = threading.Lock()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, fmt, *args):  # menos ruido en la consola
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
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
        host = urllib.parse.urlparse(origen).hostname
        return host in ("127.0.0.1", "localhost")

    def _leer_json(self):
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise ValueError("Se esperaba JSON")
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > MAX_TRABAJO:
            raise ValueError("Trabajo demasiado grande")
        return json.loads(self.rfile.read(largo) or b"{}")

    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path).path
        if ruta == "/api/estado":
            return self._json(200, {
                "ok": True,
                "plataforma": sys.platform,
                "raw": win32print is not None or bool(shutil.which("lp")),
                "simular": self.simular,
                "impresoras": listar_impresoras(),
                "predeterminada": impresora_predeterminada(),
                "impresoraSugerida": self.impresora,
            })
        if ruta == "/api/ajustes":
            return self._json(200, leer_ajustes())
        return super().do_GET()

    def do_POST(self):
        ruta = urllib.parse.urlparse(self.path).path
        if not self._origen_valido():
            return self._json(403, {"ok": False, "error": "Origen no permitido"})
        try:
            datos = self._leer_json()
        except (ValueError, json.JSONDecodeError) as e:
            return self._json(400, {"ok": False, "error": str(e)})

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
    args = p.parse_args()

    if args.enviar:
        with open(args.enviar, "rb") as f:
            print(enviar_raw(args.impresora, f.read(), os.path.basename(args.enviar), args.simular))
        return

    Manejador.simular = args.simular
    Manejador.impresora = args.impresora
    srv = Servidor(("127.0.0.1", args.puerto), Manejador)
    url = f"http://127.0.0.1:{args.puerto}/"
    print(f"Generador de etiquetas en {url}")
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
