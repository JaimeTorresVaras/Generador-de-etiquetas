# Contexto: impresión de etiquetas en Zebra GK888t (rollo 2 columnas)

Este documento resume la configuración que funciona y los problemas encontrados al imprimir etiquetas de productos (código de barras y precios) en la impresora Zebra del local. Es la base de esta app, que genera el PDF de etiquetas de precio.

## 1. Hardware

| Ítem | Valor |
|---|---|
| Impresora | Zebra **GK888t** (la "t" = admite transferencia térmica con ribbon) |
| Ubicación | Etiquetada "Vespucio" |
| Resolución | 203 dpi (8 dots/mm) |
| Ancho máximo de impresión | ~104 mm (832 dots) |
| Conexión | USB a laptop HP con Windows 11 |
| Driver correcto | **ZDesigner GK888t (EPL)** |

Error ya corregido: estaba instalado el driver **GK888d** (modelo de térmica directa). Hay que usar siempre el de la **GK888t**.

## 2. Rollo de etiquetas

| Medida | Valor |
|---|---|
| Columnas por fila | **2** |
| Etiqueta individual | ~**51 × 25 mm** (ancho × alto), esquinas redondeadas |
| Espacio vertical entre filas (gap) | **3 mm** |
| Ancho total del soporte (liner) | ~**108 mm** |
| Tipo de medio | Etiqueta con separación (gap / web) |

Para la impresora, cada "página" es **una fila completa** de 2 etiquetas: unos 100–108 mm de ancho por 25 mm de alto.

## 3. Configuración del driver que funciona

### Pestaña Opciones
- Formatos: **User defined**
- Unidad: **mm**
- Orientación: **Vertical**, sin girar 180°
- **Ancho: 108** (el PDF actual mide 99,97 mm y también funciona)
- **Altura: 25**, solo el alto de la etiqueta, sin el gap
- Área no imprimible: 0 en los cuatro lados
- Velocidad: 76 mm/s
- Oscuridad: 7

### Pestaña Configuración avanzada
- Ajustes de medio: **Transferencia térmica** solo si hay ribbon instalado; si no hay ribbon, usar **Térmico directo** (ver problemas).
- Tipo de medio: **Label with gaps**
- Altura de intervalo/marca: **3,00 mm**
- Desplazamiento superior: se probó **1 mm** para corregir un desfase vertical de ~2–3 mm. El valor final aún no está confirmado.
- Copia de seguridad superior (backfeed): activado
- Cortador: Nunca
- El botón **Calibrar** está en esta misma pestaña.

Importante: Acrobat no siempre toma el tamaño de papel definido en "Propiedades". Para que quede como predeterminado, hay que configurarlo en **Windows → Impresoras → ZDesigner GK888t → Preferencias de impresión** y reabrir Acrobat.

## 4. Origen de las etiquetas de código de barras

El sistema de inventario genera los PDF desde la pantalla **"Generar etiquetas"**:
- Tipo de archivo: **PDF** (también existe exportación **CSV**, útil para la app)
- Plantilla correcta: **"Etiquetas en rollo – 51.0mm x 25.0mm – CODE128"**
- Las plantillas Avery (5160, 5261, etc.) son para hojas carta: **no usarlas**, porque salen achicadas.
- El PDF resultante tiene páginas de **99,97 × 25,03 mm** con **2 etiquetas por página**.

Contenido de cada etiqueta (ejemplo real):
- Línea 1: nombre truncado, por ejemplo `(057)POKEMON SQUISHMALLOWS B...`
- Línea 2: `SKU: SQPK00057`
- Código de barras **CODE128**
- Número bajo el código, por ejemplo `196566152571`

## 5. Impresión desde Acrobat (flujo anterior / respaldo)

1. Impresora: **ZDesigner GK888t (EPL)**
2. Tamaño y administración de páginas: **Tamaño → Tamaño real**, una página por hoja.
   - **No usar "Múltiple"** con el PDF de 51×25, porque cada página ya trae las 2 etiquetas.
   - "Múltiple 2 por 1, horizontal" solo sirve si el PDF trae una etiqueta por página.
3. Desmarcar "Imprimir borde de página".
4. Verificar que la vista previa muestre unos **100 × 25 mm**, no 215,9 × 279,4 (carta).
5. Hacer siempre una prueba con **Páginas 1** antes de imprimir todo el lote.

Que el texto se vea al revés mirando la salida desde el frente es **normal**: al despegar la etiqueta queda derecha.

## 6. Calibración

- Física: con la impresora encendida, mantener **Feed** hasta que la luz parpadee **2 veces** y soltar. Avanza algunas etiquetas midiendo los gaps.
- Desde el driver: botón **Calibrar** en Configuración avanzada.
- Recalibrar siempre que se cambie el rollo, el driver o el desplazamiento.
- Si al calibrar avanza mucho papel y queda en rojo, el sensor no detecta los gaps. Revisar que el papel pase bajo las guías y el sensor, y que el sensor no quede bajo la franja central entre columnas.

## 7. Problemas encontrados y su causa

| Síntoma | Causa | Solución |
|---|---|---|
| Vista previa en tamaño carta con 2 etiquetas chicas | Tamaño de papel no aplicado en Acrobat | Configurar en Preferencias de impresión de Windows y reabrir |
| Contenido montado entre dos etiquetas | Sin calibrar o altura incluía el gap (30 en vez de 25) | Altura 25, gap 3, calibrar |
| Etiquetas muy pequeñas | Plantilla Avery (hoja carta) o modo Múltiple escalando | Plantilla rollo 51×25 y Tamaño real |
| Número bajo el código cae en el gap | Desfase vertical de ~2–3 mm | Desplazamiento superior (probar 1–3 mm o negativo) |
| **Imprime una fila y la luz queda roja** | **Pendiente**. Lo más probable: modo Transferencia térmica sin ribbon. También puede ser tapa mal cerrada o sensor sin detectar gaps. | Verificar ribbon y, si no hay, cambiar a Térmico directo. Abrir y cerrar la tapa, Feed, recalibrar |

## 8. Etiquetas de precio (herramienta anterior)

Existía un generador HTML (`etiquetas-precios.html`) que:
- Recibe una lista de precio + cantidad.
- Formatea en CLP (`12990` → `$12.990`), con signo $ y prefijo opcionales ("Oferta").
- Genera un PDF con **jsPDF** de páginas **100 × 25 mm**, con 2 etiquetas por página centradas en x = 25 mm y x = 75 mm.
- Usa Helvetica Bold con ajuste automático de tamaño (máximo 40 pt y ~42 mm de ancho de texto).
- Se imprime con **Tamaño real** en Acrobat.

Esta app incorpora esa función como el tipo de etiqueta **"Solo precio"** y la **"Lista rápida de precios"**.

## 9. Decisión actual: solo PDF de precios

Se probó enviar EPL2 en crudo (RAW) directo a la impresora, pero la app quedó demasiado compleja. La app actual **solo genera el PDF de precios** (100 × 25 mm por página, 2 etiquetas) y se imprime con Acrobat en **Tamaño real**, como en la sección 5. Los productos y precios se pueden buscar en **Bsale** por API.

## 10. Pendientes por confirmar en la impresora

- [ ] Si hay **ribbon** instalado (define térmico directo o transferencia).
- [ ] Causa definitiva de la **luz roja** después de imprimir.
- [ ] Valor final del **desplazamiento superior** del driver (o el ajuste fino de la app).
- [ ] Medidas exactas del rollo con regla: ancho de etiqueta, separación entre columnas y ancho total.
- [ ] Si la GK888t acepta **ZPL** además de EPL.
