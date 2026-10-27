/**
 * Vibra Extrema — confirmaciones de salidas y la orden de camisas.
 *
 * Este archivo vive DENTRO del Google Sheet del grupo (Extensiones → Apps
 * Script), no en GitHub Pages. La página lo llama para leer y guardar quién va.
 *
 * Instalación completa en el README del repo. En corto:
 *   1. Pega este archivo en el editor de Apps Script del Sheet.
 *   2. Implementar → Nueva implementación → Aplicación web.
 *      Ejecutar como: Yo.   Quién tiene acceso: Cualquier usuario.
 *   3. Copia la URL (termina en /exec) y pégala en events.config.js.
 *
 * Cada confirmación es una fila en la pestaña RSVPs:
 *   Fecha | Salida | Nombre | Acompañantes.
 * Cada combo pedido es una fila en la pestaña Ordenes:
 *   Fecha | Id | Nombre | Color | Talla | Pago | Pagado.
 * "Pagado" es para llevar las cuentas a mano: la página nunca lo enseña.
 * Borrar una fila a mano en el Sheet la quita de la página. No hay contraseña:
 * cualquiera con la URL puede escribir, que es el trato que aceptamos para no
 * pedirle cuenta a nadie. Por eso se validan los campos y se limita el tamaño.
 */

var HOJA = 'RSVPs';
var HOJA_ORDENES = 'Ordenes';
var MAX_TEXTO_ORDEN = 30;   // color y talla
var PAGOS = ['completo', 'dos-pagos'];
var MAX_NOMBRE = 40;
var MAX_ACOMPANANTES = 5;
var MAX_FILAS = 5000;   // tope duro: si alguien abusa, deja de aceptar

function doGet() {
  return responder({ ok: true, rsvps: leerTodo(), ordenes: leerOrdenes() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return responder({ ok: false, error: 'el sistema está ocupado, intenta otra vez' });
  }

  try {
    var cuerpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (cuerpo.accion === 'ordenar') return responder(ordenar(cuerpo));
    if (cuerpo.accion === 'quitar-orden') return responder(quitarOrden(cuerpo));

    var salida = limpiar(cuerpo.salida, 60);
    var nombre = limpiar(cuerpo.nombre, MAX_NOMBRE);
    var accion = String(cuerpo.accion || 'voy');

    if (!salida) return responder({ ok: false, error: 'falta la salida' });
    if (!nombre) return responder({ ok: false, error: 'falta el nombre' });

    var hoja = obtenerHoja();
    var filas = hoja.getDataRange().getValues();   // [0] = encabezados
    var fila = buscarFila(filas, salida, nombre);

    if (accion === 'novoy') {
      if (fila > 0) hoja.deleteRow(fila + 1);
    } else {
      var acompanantes = Math.max(0, Math.min(MAX_ACOMPANANTES, parseInt(cuerpo.acompanantes, 10) || 0));
      if (fila > 0) {
        hoja.getRange(fila + 1, 4).setValue(acompanantes);
      } else {
        if (filas.length > MAX_FILAS) return responder({ ok: false, error: 'la hoja está llena' });
        hoja.appendRow([new Date(), salida, nombre, acompanantes]);
      }
    }

    return responder({ ok: true, rsvps: leerTodo() });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// --- la orden de camisas ---------------------------------------------------

/** Un combo por fila. La misma persona puede pedir varios: cada uno es su color y su talla. */
function ordenar(cuerpo) {
  var nombre = limpiar(cuerpo.nombre, MAX_NOMBRE);
  var color = limpiar(cuerpo.color, MAX_TEXTO_ORDEN);
  var talla = limpiar(cuerpo.talla, MAX_TEXTO_ORDEN);
  var pago = PAGOS.indexOf(cuerpo.pago) === -1 ? 'completo' : cuerpo.pago;

  if (!nombre) return { ok: false, error: 'falta el nombre' };
  if (!color) return { ok: false, error: 'falta el color' };
  if (!talla) return { ok: false, error: 'falta la talla' };

  var hoja = obtenerHojaOrdenes();
  if (hoja.getDataRange().getValues().length > MAX_FILAS) return { ok: false, error: 'la hoja está llena' };

  var id = Utilities.getUuid();
  // El apóstrofo hace que Sheets lo guarde como texto: un nombre que empiece
  // con = o - sería una fórmula. Sheets no guarda el apóstrofo.
  hoja.appendRow([new Date(), id, comoTexto(nombre), comoTexto(color), comoTexto(talla), pago, '']);
  return { ok: true, id: id, ordenes: leerOrdenes() };
}

/** Quita un combo por su id. Quien lo pidió guarda el id en su teléfono. */
function quitarOrden(cuerpo) {
  var id = limpiar(cuerpo.id, 60);
  var hoja = obtenerHojaOrdenes();
  var filas = hoja.getDataRange().getValues();
  for (var i = filas.length - 1; i >= 1; i--) {
    if (id && String(filas[i][1]) === id) hoja.deleteRow(i + 1);
  }
  return { ok: true, ordenes: leerOrdenes() };
}

/** Los pedidos en el orden en que llegaron, sin la columna Pagado. */
function leerOrdenes() {
  var filas = obtenerHojaOrdenes().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < filas.length; i++) {
    var nombre = String(filas[i][2] || '').trim();
    if (!nombre) continue;
    out.push({
      id: String(filas[i][1] || ''),
      nombre: nombre,
      color: String(filas[i][3] || '').trim(),
      talla: String(filas[i][4] || '').trim(),
      pago: String(filas[i][5] || '') === 'dos-pagos' ? 'dos-pagos' : 'completo'
    });
  }
  return out;
}

function obtenerHojaOrdenes() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA_ORDENES);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_ORDENES);
    hoja.appendRow(['Fecha', 'Id', 'Nombre', 'Color', 'Talla', 'Pago', 'Pagado']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function comoTexto(v) {
  return v === '' ? v : "'" + v;
}

// --- confirmaciones -----------------------------------------------------------

/** Todas las confirmaciones agrupadas por salida, como las espera la página. */
function leerTodo() {
  var filas = obtenerHoja().getDataRange().getValues();
  var out = {};
  for (var i = 1; i < filas.length; i++) {
    var salida = String(filas[i][1] || '').trim();
    var nombre = String(filas[i][2] || '').trim();
    if (!salida || !nombre) continue;
    if (!out[salida]) out[salida] = [];
    out[salida].push({ nombre: nombre, acompanantes: Number(filas[i][3]) || 0 });
  }
  return out;
}

/** Índice (base 0, contando el encabezado) de esa persona en esa salida, o -1. */
function buscarFila(filas, salida, nombre) {
  var s = salida.toLowerCase();
  var n = nombre.toLowerCase();
  for (var i = 1; i < filas.length; i++) {
    if (String(filas[i][1] || '').trim().toLowerCase() === s &&
        String(filas[i][2] || '').trim().toLowerCase() === n) {
      return i;
    }
  }
  return -1;
}

function obtenerHoja() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(['Fecha', 'Salida', 'Nombre', 'Acompañantes']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/** Texto recortado y sin saltos de línea; '' si no sirve. */
function limpiar(valor, max) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);
}

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
