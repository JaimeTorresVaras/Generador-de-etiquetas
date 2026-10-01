# Etiquetas de precio · Zebra GK888t

Genera un **PDF de etiquetas de precio** para el rollo de **2 columnas de 51 × 25 mm**:

- **Páginas:** cada página mide 100 × 25 mm y trae 2 etiquetas, centradas en x = 25 mm y x = 75 mm.
- **Precio:** formato CLP (`12990` → `$12.990`), en Helvetica Bold ajustada sola (máx. 40 pt y ~42 mm de ancho).
- **Opcional:** un texto arriba (por ejemplo "Oferta") y el nombre del producto abajo.
- **Búsqueda en Bsale:** por nombre, SKU o código de barras, y también con lector de códigos.

La app **solo genera el PDF**: no se conecta a la impresora. Se imprime desde Acrobat. El contexto de la impresora y del rollo está en [`docs/contexto-zebra-gk888t.md`](docs/contexto-zebra-gk888t.md).

## Uso

1. **Agregar precios**, de cualquiera de estas formas:
   - **Buscar en Bsale**: escribe el nombre o SKU y pulsa *Agregar*. Con un **lector de código de barras**, escaneas en el buscador y el producto entra directo. Si lo escaneas otra vez, suma 1 a la cantidad.
   - **A mano**: precio + cantidad → *Agregar*.
   - **Pegar una lista**: un precio por línea, por ejemplo `12990 x 5`, `$4.990;2` o `1990`.
2. **Diseño**: texto superior opcional, signo $ y nombre del producto abajo. En *Ajuste fino* puedes mover el precio si sale corrido.
3. **Descargar PDF** (o **Abrir PDF**). Si la cantidad total es impar, la última etiqueta derecha queda en blanco.

La lista y el diseño quedan guardados en el navegador.

### Imprimir en la Zebra (Acrobat)

1. Impresora: **ZDesigner GK888t (EPL)**. Su configuración: User defined, 108 × 25 mm, gap 3 mm, *Label with gaps*, y *Térmico directo* si no hay ribbon.
2. **Tamaño real**, una página por hoja. **No** usar "Múltiple" ni "Ajustar".
3. La vista previa debe mostrar ~100 × 25 mm. Si aparece tamaño carta, configura el papel en *Windows → Impresoras → ZDesigner GK888t → Preferencias de impresión* y vuelve a abrir Acrobat.
4. Prueba con **Páginas: 1** antes de imprimir todo.

## Railway

1. **New Project → Deploy from GitHub repo → Generador-de-etiquetas** (rama `main`). Railway construye con el `Dockerfile` de `railway.json`, sin dependencias.
2. En **Variables** del servicio:

   | Variable | Para qué |
   |---|---|
   | `BSALE_ACCESS_TOKEN` | Token de la API de Bsale. Sin esta variable, la búsqueda no aparece y la app funciona solo con precios a mano. |
   | `BSALE_LISTA_PRECIO` | *(opcional)* id de la lista de precios que se usa. Por defecto se toma la primera lista activa. |
   | `CLAVE_ACCESO` | *(recomendado)* clave que la página pide una vez por navegador antes de buscar en Bsale, porque la URL es pública. |

3. **Settings → Networking → Generate Domain** para obtener la URL.

El token de Bsale queda solo en el servidor: el navegador nunca lo ve. El precio mostrado es el **precio con impuestos** (`variantValueWithTaxes`) de la lista elegida.

La versión anterior usaba un PostgreSQL. Si lo creaste en Railway, ya no se usa y puedes borrarlo.

### Cómo se busca en Bsale

- **Si parece un código** (sin espacios): primero `variants.json?barcode=…` y, si no hay resultados, `variants.json?code=…` (SKU).
- **Si no hay resultados o es texto**: `products.json?name=…&expand=[variants]`, y solo se muestran las variantes activas.
- **Precio**: se obtiene con `price_lists/{lista}/details.json?variantid=…` y queda en caché 5 minutos.

## Desarrollo

```
servidor.py        sirve web/ y /api/bsale/buscar (PORT en Railway; 127.0.0.1:8765 local)
bsale.py           consultas a la API de Bsale
web/js/precios.js  formato CLP, lista rápida y diseño de cada etiqueta (mm)
web/js/app.js      interfaz, vista previa y PDF (jsPDF incluido en web/vendor)
tests/             node --test tests/*.test.js  y  python3 -m unittest discover -s tests -p "test_*.py"
```

Las pruebas de Bsale usan un Bsale simulado, así que no necesitan red ni token. Para probarlo en local:
`BSALE_ACCESS_TOKEN=… python3 servidor.py` y abrir <http://127.0.0.1:8765>.
