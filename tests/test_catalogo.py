"""
Pruebas del catálogo contra un PostgreSQL real.

    TEST_DATABASE_URL=postgresql://usuario@host:puerto/base python3 -m unittest tests/test_catalogo.py

Se omiten si no hay TEST_DATABASE_URL o psycopg. ¡Borra la tabla productos de esa base!
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import catalogo  # noqa: E402

URL = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(URL and catalogo.psycopg, "requiere TEST_DATABASE_URL y psycopg")
class PruebasCatalogo(unittest.TestCase):
    def setUp(self):
        os.environ["DATABASE_URL"] = URL
        catalogo._esquema_listo = False
        with catalogo.psycopg.connect(URL) as con:
            con.execute("DROP TABLE IF EXISTS productos")

    def test_importar_actualiza_sin_duplicar(self):
        r = catalogo.guardar([
            {"nombre": "(057)POKEMON SQUISHMALLOWS", "sku": "SQPK00057", "codigo": "196566152571", "precio": 12990},
            {"nombre": "Sin SKU", "codigo": "7801234567890", "precio": "4990"},
            {"nombre": "Sin nada"},
        ])
        self.assertEqual(r, {"insertados": 2, "actualizados": 0, "omitidos": 1})

        # Mismo SKU en minúsculas: actualiza el precio y conserva el código si viene vacío
        r = catalogo.guardar([{"nombre": "", "sku": "sqpk00057", "codigo": "", "precio": 9990}])
        self.assertEqual(r["actualizados"], 1)
        p = catalogo.buscar("SQPK00057")["productos"][0]
        self.assertEqual(p["nombre"], "(057)POKEMON SQUISHMALLOWS")
        self.assertEqual(p["codigo"], "196566152571")
        self.assertEqual(p["precio"], 9990)

    def test_buscar_y_eliminar(self):
        catalogo.guardar([
            {"nombre": "Peluche Ñandú", "sku": "PEL1", "codigo": "111"},
            {"nombre": "Taza 100% cerámica", "sku": "TAZ1", "codigo": "222"},
        ])
        self.assertEqual(catalogo.buscar("ñandú")["productos"][0]["sku"], "PEL1")
        self.assertEqual([p["sku"] for p in catalogo.buscar("222")["productos"]], ["TAZ1"])
        self.assertEqual(len(catalogo.buscar("100%")["productos"]), 1)
        self.assertEqual(len(catalogo.buscar("1%")["productos"]), 0)  # % es literal
        todos = catalogo.buscar("")
        self.assertEqual(todos["total"], 2)
        r = catalogo.eliminar([todos["productos"][0]["id"]])
        self.assertEqual(r["eliminados"], 1)
        self.assertEqual(catalogo.buscar("")["total"], 1)

    def test_validaciones(self):
        with self.assertRaises(ValueError):
            catalogo.guardar("no es lista")
        with self.assertRaises(ValueError):
            catalogo.eliminar(["1"])
        self.assertIsNone(catalogo.normalizar({"nombre": "x"}))
        self.assertIsNone(catalogo.normalizar({"sku": "A", "precio": "abc"})["precio"])


if __name__ == "__main__":
    unittest.main()
