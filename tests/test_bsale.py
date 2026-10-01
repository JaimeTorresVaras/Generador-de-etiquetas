"""
Pruebas de la búsqueda en Bsale contra un Bsale simulado (sin red).

    python3 -m unittest discover -s tests -p "test_*.py"
"""

import http.server
import json
import os
import sys
import threading
import unittest
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bsale  # noqa: E402
import servidor  # noqa: E402

TOKEN = "token-de-prueba"
PRODUCTO = {"id": 10, "name": "(057)POKEMON SQUISHMALLOWS"}
VARIANTES = [
    {"id": 101, "description": "", "code": "SQPK00057", "barCode": "196566152571", "state": 0},
    {"id": 102, "description": "Grande", "code": "SQPK00058", "barCode": "196566152588", "state": 0},
    {"id": 103, "description": "Descontinuada", "code": "SQPK00059", "barCode": "", "state": 1},
]
PRECIOS = {101: 12990.0, 102: 19990.4}
pedidos = []


class FalsoBsale(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, datos, codigo=200):
        cuerpo = json.dumps(datos).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        pedidos.append((url.path, q))
        if self.headers.get("access_token") != TOKEN:
            return self._json({"error": "unauthorized"}, 401)
        if url.path == "/v1/price_lists.json":
            return self._json({"items": [{"id": 3, "name": "Lista base", "state": 0}]})
        if url.path == "/v1/price_lists/3/details.json":
            vid = int(q.get("variantid", 0))
            items = [{"variantValue": PRECIOS[vid] / 1.19, "variantValueWithTaxes": PRECIOS[vid]}] if vid in PRECIOS else []
            return self._json({"items": items})
        if url.path == "/v1/variants.json":
            campo = "barCode" if "barcode" in q else "code"
            valor = q.get("barcode") or q.get("code")
            items = [dict(v, product=PRODUCTO) for v in VARIANTES if v[campo] == valor]
            return self._json({"items": items})
        if url.path == "/v1/products.json":
            items = []
            if q.get("name", "").lower() in PRODUCTO["name"].lower():
                items = [dict(PRODUCTO, variants={"items": VARIANTES})]
            return self._json({"items": items})
        return self._json({}, 404)


class PruebasBsale(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.falso = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FalsoBsale)
        threading.Thread(target=cls.falso.serve_forever, daemon=True).start()
        os.environ["BSALE_API_URL"] = f"http://127.0.0.1:{cls.falso.server_port}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.falso.shutdown()

    def setUp(self):
        os.environ["BSALE_ACCESS_TOKEN"] = TOKEN
        os.environ.pop("BSALE_LISTA_PRECIO", None)
        bsale._cache.clear()
        pedidos.clear()

    def test_codigo_de_barras(self):
        r = bsale.buscar("196566152571")
        self.assertEqual(r, [{"id": 101, "nombre": "(057)POKEMON SQUISHMALLOWS", "sku": "SQPK00057",
                              "codigo": "196566152571", "precio": 12990}])
        self.assertEqual(pedidos[0], ("/v1/variants.json", {"barcode": "196566152571", "expand": "[product]", "limit": "20"}))

    def test_sku_si_no_hay_codigo(self):
        r = bsale.buscar("SQPK00058")
        self.assertEqual(r[0]["nombre"], "(057)POKEMON SQUISHMALLOWS Grande")
        self.assertEqual(r[0]["precio"], 19990)

    def test_nombre_omite_variantes_inactivas(self):
        r = bsale.buscar("pokemon squish")
        self.assertEqual([x["id"] for x in r], [101, 102])

    def test_lista_de_precio_fija_y_cache(self):
        os.environ["BSALE_LISTA_PRECIO"] = "3"
        bsale.buscar("196566152571")
        bsale.buscar("196566152571")
        rutas = [p for p, _ in pedidos]
        self.assertNotIn("/v1/price_lists.json", rutas)
        self.assertEqual(rutas.count("/v1/price_lists/3/details.json"), 1)

    def test_token_malo(self):
        os.environ["BSALE_ACCESS_TOKEN"] = "malo"
        with self.assertRaises(bsale.ErrorBsale) as e:
            bsale.buscar("196566152571")
        self.assertIn("token", str(e.exception))

    def test_servidor_y_clave(self):
        srv = servidor.Servidor(("127.0.0.1", 0), servidor.Manejador)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_port}"
        try:
            def get(ruta, clave=None):
                req = urllib.request.Request(base + ruta, headers={"X-Clave": clave} if clave else {})
                try:
                    with urllib.request.urlopen(req) as r:
                        return r.status, json.loads(r.read())
                except urllib.error.HTTPError as e:
                    return e.code, json.loads(e.read())

            os.environ["CLAVE_ACCESO"] = "secreta"
            self.assertEqual(get("/api/estado")[1], {"ok": True, "bsale": True, "requiereClave": True})
            self.assertEqual(get("/api/bsale/buscar?q=SQPK00057")[0], 401)
            codigo, datos = get("/api/bsale/buscar?q=SQPK00057", "secreta")
            self.assertEqual(codigo, 200)
            self.assertEqual(datos["productos"][0]["precio"], 12990)
            self.assertNotIn(TOKEN, json.dumps(datos))
            with urllib.request.urlopen(base + "/") as r:
                self.assertIn(b"Etiquetas de precio", r.read())
        finally:
            os.environ.pop("CLAVE_ACCESO", None)
            srv.shutdown()
            srv.server_close()


if __name__ == "__main__":
    unittest.main()
