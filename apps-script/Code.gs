/**
 * Vibra Extrema — confirmaciones de salidas.
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
 * Cada confirmación es una fila: Fecha | Salida | Nombre | Acompañantes.
 * Borrar una fila a mano en el Sheet la quita de la página. No hay contraseña:
 * cualquiera con la URL puede escribir, que es el trato que aceptamos para no
 * pedirle cuenta a nadie. Por eso se validan los campos y se limita el tamaño.
 */

var HOJA = 'RSVPs';
var MAX_NOMBRE = 40;
var MAX_ACOMPANANTES = 5;
var MAX_FILAS = 5000;   // tope duro: si alguien abusa, deja de aceptar

function doGet() {
  return responder({ ok: true, rsvps: leerTodo() });
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
