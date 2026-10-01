#!/usr/bin/env python3
"""
Servidor del generador de etiquetas de precio.

Sirve la página (carpeta web/) y busca productos en Bsale sin exponer el token.
Solo usa la biblioteca estándar de Python.

    python servidor.py              # http://127.0.0.1:8765
    PORT=8080 python servidor.py    # Railway (escucha en 0.0.0.0:$PORT)

Variables: BSALE_ACCESS_TOKEN (búsqueda en Bsale), BSALE_LISTA_PRECIO (opcional),
CLAVE_ACCESO (opcional: pide una clave antes de buscar en Bsale).
"""

import hmac
import http.server
import json
import os
import socketserver
import sys
import urllib.parse

import bsale

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, fmt, *args):
        if (self.path or "").startswith("/api/"):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _autorizado(self):
        clave = os.environ.get("CLAVE_ACCESO", "")
        if not clave:
            return True
        enviada = self.headers.get("X-Clave") or ""
        return hmac.compare_digest(enviada.encode("utf-8"), clave.encode("utf-8"))

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/estado":
            return self._json(200, {
                "ok": True,
                "bsale": bsale.configurado(),
                "requiereClave": bool(os.environ.get("CLAVE_ACCESO")),
            })
        if url.path == "/api/bsale/buscar":
            if not bsale.configurado():
                return self._json(503, {"ok": False, "error": "Falta configurar BSALE_ACCESS_TOKEN"})
            if not self._autorizado():
                return self._json(401, {"ok": False, "error": "Clave incorrecta"})
            q = (urllib.parse.parse_qs(url.query).get("q") or [""])[0]
            try:
                return self._json(200, {"ok": True, "productos": bsale.buscar(q)})
            except bsale.ErrorBsale as e:
                return self._json(502, {"ok": False, "error": str(e)})
            except Exception as e:  # noqa: BLE001
                sys.stderr.write(f"Error buscando en Bsale: {type(e).__name__}: {e}\n")
                return self._json(500, {"ok": False, "error": "Error inesperado al consultar Bsale"})
        if url.path.startswith("/api/"):
            return self._json(404, {"ok": False, "error": "Ruta desconocida"})
        return super().do_GET()


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    puerto = os.environ.get("PORT")
    host, puerto = ("0.0.0.0", int(puerto)) if puerto else ("127.0.0.1", 8765)
    srv = Servidor((host, puerto), Manejador)
    print(f"Etiquetas de precio en http://{host}:{puerto}/", flush=True)
    print("Bsale: " + ("configurado" if bsale.configurado() else "sin BSALE_ACCESS_TOKEN (solo lista manual)"), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
