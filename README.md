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
servidor.py     servidor local + envío RAW (win32print en Windows, lp en Linux/macOS)
tests/          pruebas: node --test tests/*.test.js
```

- `python3 servidor.py --simular` no imprime: guarda cada trabajo en `salida/*.epl` para revisarlo.
- La vista previa, el PDF y el EPL salen del mismo diseño en dots (8 dots/mm), así que lo que se ve es lo que se imprime. Las fuentes de la vista previa son aproximaciones de las fuentes residentes de la impresora.
- El servidor solo escucha en `127.0.0.1` y rechaza peticiones de otros orígenes.
