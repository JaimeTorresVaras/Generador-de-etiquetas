# Generador de etiquetas · Zebra GK888t

Genera e imprime etiquetas de **código de barras** (nombre, SKU, CODE128) y de **solo precio** (CLP) en el rollo de **2 columnas de 51 × 25 mm** de la Zebra GK888t del local.

La app envía **comandos EPL2 en crudo (RAW)** directo a la impresora, así que no pasa por Acrobat ni por el escalado del driver. Así se evitan los ajustes manuales de tamaño de página. El contexto completo de la impresora y los problemas ya resueltos está en [`docs/contexto-zebra-gk888t.md`](docs/contexto-zebra-gk888t.md).

## Instalación (una vez, en la laptop con Windows)

1. Instalar **Python 3** desde <https://www.python.org/downloads/> y marcar *"Add python.exe to PATH"*.
2. Descargar este repositorio (botón **Code → Download ZIP**) y descomprimirlo, por ejemplo en `Documentos\Etiquetas`.
3. Hacer doble clic en **`iniciar.bat`**. La primera vez instala `pywin32` y después abre el navegador en <http://127.0.0.1:8765>.

La ventana negra tiene que quedar abierta mientras se usa la app. Para salir, basta con cerrarla.

## Uso

1. **Productos**
   - **Importar CSV**: el que exporta *"Generar etiquetas"* del sistema de inventario (Tipo de archivo: CSV). La app reconoce las columnas por nombre y deja corregir el mapeo antes de agregarlas.
   - **Agregar fila**: para cargar productos a mano.
   - **Lista rápida de precios**: un precio por línea, con la cantidad opcional (`12990 x 5`, `$4.990;2`, `1990`).
2. **Tipo de etiqueta**: *Código de barras* o *Solo precio* (texto superior opcional como "Oferta" y signo $).
3. **Vista previa**: muestra cada fila de 2 etiquetas a escala sobre el soporte. Si la cantidad total es impar, la etiqueta derecha de la última fila queda en blanco.
4. **Imprimir**
   - **Imprimir prueba (1 fila)**: usar siempre antes de imprimir un lote.
   - **Imprimir todo**: imprime todas las filas. Las filas idénticas se envían una sola vez con `P<n>`.
   - **Calibrar**: envía `xa`, la autocalibración del sensor de gaps. Hay que usarlo al cambiar el rollo.
   - **Fila de alineación**: imprime un marco y una cruz en cada etiqueta para medir el desfase.
   - **Imprimir configuración**: imprime la etiqueta de estado de la impresora (`U`).
   - **Descargar .epl / PDF**: respaldo cuando no está el servidor (ver más abajo).
5. **Ajustes**: se guardan automáticamente en `ajustes.json`.

### Ajustes clave

| Ajuste | Valor inicial | Notas |
|---|---|---|
| Modo | Térmico directo | Usar **Transferencia térmica** solo si hay ribbon instalado. Sin ribbon, la impresora se detiene con **luz roja**. |
| Oscuridad / velocidad | 7 / 76 mm/s | Mismos valores del driver que funcionaba. |
| Alto / gap | 25 mm / 3 mm | El alto es solo el de la etiqueta, **sin** el gap. |
| Desplazamiento Y | 0 mm | Reemplaza el "desplazamiento superior" del driver, que **no se aplica** en RAW. Un valor positivo baja el contenido. |
| Desplazamiento X | 0 mm | Un valor positivo mueve el contenido a la derecha. |
| Inicio columna / paso | 0 / 51 mm | Ajustar según la medida real del rollo. |
| Sentido | ZT | Si la etiqueta queda al revés al despegarla, cambiar a ZB. |

### Ajuste fino la primera vez

1. **Calibrar**.
2. **Fila de alineación**. El marco debe quedar ~1 mm dentro de cada etiqueta.
3. Si el marco queda corrido hacia arriba o abajo, cambiar el **Desplazamiento Y** (por ejemplo `1.5`). Si queda corrido a un lado, cambiar el **Desplazamiento X** o el **Inicio columna izquierda**. Si solo la columna derecha queda corrida, cambiar el **Paso entre columnas**.
4. Repetir hasta que quede centrado y después **Imprimir prueba (1 fila)** con productos reales.

## Versión en Railway (acceso desde cualquier navegador)

Railway aloja la **interfaz**, pero un servidor en la nube no puede ver la impresora USB del local. Para imprimir, la página de Railway le envía el trabajo a `servidor.py` corriendo en la laptop de la impresora (`http://127.0.0.1:8765`), que hace de **puente** local.

### Desplegar

1. En <https://railway.com>: **New Project → Deploy from GitHub repo** y elegir `Generador-de-etiquetas` con la rama que corresponda.
2. Railway detecta `railway.json` y construye con el `Dockerfile`. No hace falta configurar variables: el servidor arranca en **modo nube** (`--nube`), escucha en `$PORT` y deshabilita la impresión y el guardado de ajustes del lado del servidor.
3. En el servicio: **Settings → Networking → Generate Domain**. Así se obtiene una URL del tipo `https://generador-de-etiquetas-production.up.railway.app`.

### Base de datos: catálogo de productos (PostgreSQL)

El catálogo guarda nombre, SKU, código de barras y precio para no tener que importar el CSV cada vez.

1. En el proyecto de Railway: **+ Create → Database → Add PostgreSQL**.
2. En el servicio de la app, pestaña **Variables**, agregar:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. Se elige como *variable reference* y Railway la conecta sola.
   - `CLAVE_ACCESO` = una clave para el local. La URL es pública, así que sin esta clave el catálogo queda deshabilitado.
3. Railway vuelve a desplegar solo. La tabla `productos` se crea sola la primera vez.

Uso:
- En **1. Productos** aparece **Buscar en el catálogo**. La primera vez en cada navegador pide la clave.
- **Importar CSV** trae la opción *Guardar también en el catálogo*, marcada por defecto. Los productos se identifican por **SKU** (o por código de barras si no tienen SKU), así que reimportar un CSV actualiza nombres y precios **sin duplicar**. Un campo vacío en el CSV no borra el dato guardado.
- Se puede buscar por nombre, SKU o código. Con un **lector de código de barras**, se escanea en el buscador y el producto se agrega a la tabla. Escanearlo de nuevo suma 1 a la cantidad.
- **Guardar tabla en catálogo** guarda o actualiza las filas que se editaron a mano.

### Habilitar la impresión desde esa URL (en la laptop de la impresora)

1. Abrir `origenes-permitidos.txt` (junto a `servidor.py`) y pegar la URL de Railway en una línea, **sin barra final**.
2. Abrir `iniciar.bat` y dejar la ventana abierta. En la consola debe aparecer `Permite imprimir desde: https://…railway.app`.
3. Abrir la URL de Railway en Chrome o Edge. La primera vez el navegador pide permiso para **acceder a dispositivos de la red local**: hay que aceptar. Luego el indicador de arriba debe decir *"Listo para imprimir"*.

Si en otro computador no corre el puente, la página de Railway igual sirve para preparar las etiquetas, ver la vista previa y descargar el `.epl` o el PDF.

Notas:
- En modo nube, los ajustes (desplazamientos, oscuridad, etc.) quedan en el navegador. Cuando hay puente, se guardan en `ajustes.json` de la laptop de la impresora.
- El puente solo acepta páginas de `localhost` y las URLs listadas en `origenes-permitidos.txt`, en `--permitir URL` o en la variable `ORIGENES_PERMITIDOS`. Ninguna otra web puede mandar trabajos a la impresora.

## Respaldo sin servidor

- **Descargar .epl** y enviarlo en crudo: compartir la impresora como `Zebra` (Propiedades → Compartir) y ejecutar
  `copy /b etiquetas.epl \\localhost\Zebra`.
  También se puede usar `py servidor.py --enviar etiquetas.epl`.
- **Descargar PDF**: genera una página de 104 × 25 mm por fila. En Acrobat hay que usar **Tamaño real**, una página por hoja y **sin "Múltiple"**.

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| "Falta pywin32" | Ejecutar `py -m pip install pywin32` y volver a abrir `iniciar.bat`. |
| "Impresora no encontrada" | En el paso 4, elegir el nombre exacto de la lista (debe ser **ZDesigner GK888t (EPL)**, no GK888d). |
| Imprime una fila y queda la luz roja | Modo transferencia sin ribbon: cambiar a *Térmico directo*. También revisar la tapa, presionar Feed y **Calibrar**. |
| Contenido montado entre dos etiquetas | **Calibrar** y verificar alto 25 / gap 3. |
| Número del código cae en el gap | Ajustar el **Desplazamiento Y**. |
| Calibrar avanza mucho papel y queda en rojo | El sensor no ve los gaps: revisar las guías y que el sensor no quede bajo la franja central entre columnas. |
| El trabajo llega pero no imprime nada | Algunos drivers rechazan RAW. Probar el respaldo `copy /b`, o instalar el driver *Generic / Text Only* en el mismo puerto USB y usar esa impresora. |

## Desarrollo

```
web/            interfaz (HTML + JS sin dependencias, jsPDF incluido en web/vendor)
  js/code128.js codificador Code 128 (vista previa y PDF)
  js/etiquetas.js diseño de etiquetas en dots y generación EPL2
  js/csv.js     lectura de CSV y lista rápida de precios
  js/app.js     interfaz
servidor.py     servidor local + envío RAW (win32print en Windows, lp en Linux/macOS);
                con --nube solo sirve la interfaz (Railway)
catalogo.py     catálogo de productos en PostgreSQL (DATABASE_URL)
Dockerfile, railway.json, requirements-nube.txt   despliegue en Railway
tests/          pruebas: node --test tests/*.test.js
```

- Pruebas del catálogo, que necesitan un PostgreSQL de prueba porque borran la tabla:
  `TEST_DATABASE_URL=postgresql://… python3 -m unittest tests/test_catalogo.py`
- `python3 servidor.py --simular` no imprime: guarda cada trabajo en `salida/*.epl` para revisarlo.
- La vista previa, el PDF y el EPL salen del mismo diseño en dots (8 dots/mm), así que lo que se ve es lo que se imprime. Las fuentes de la vista previa son aproximaciones de las fuentes residentes de la impresora.
- El servidor solo escucha en `127.0.0.1` y rechaza peticiones de otros orígenes.
