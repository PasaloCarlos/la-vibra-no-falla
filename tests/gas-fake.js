'use strict';
// Dobles en memoria de los servicios de Google que usa apps-script/Code.gs.
// Carga Code.gs en un contexto vm, igual que Apps Script: todo global, sin module.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Como Sheets al escribir un valor: "'" al inicio fuerza texto (y no se guarda);
// = + - @ al inicio se toma como fórmula.
function comoSheets(v) {
  if (typeof v !== 'string' || v === '') return v;
  if (v[0] === "'") return v.slice(1);
  if (/^[=+\-@]/.test(v)) return '#ERROR!';
  return v;
}

function crearHoja() {
  const filas = [];
  return {
    filas,
    appendRow: fila => { filas.push(Array.from(fila, comoSheets)); },   // Array.from: arreglo de este reino, no del vm
    getDataRange: () => ({ getValues: () => filas.map(f => f.slice()) }),
    getRange: (fila, columna) => ({ setValue: v => { filas[fila - 1][columna - 1] = comoSheets(v); } }),
    deleteRow: n => { filas.splice(n - 1, 1); },
    setFrozenRows: () => {}
  };
}

function crearEntorno() {
  const hojas = {};
  let uuid = 0;
  const ctx = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => hojas[n] || null,
        insertSheet: n => (hojas[n] = crearHoja())
      })
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: texto => ({ setMimeType() { return this; }, getContent: () => texto })
    },
    Utilities: { getUuid: () => `uuid-${++uuid}` }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);

  const leer = salida => JSON.parse(JSON.stringify(JSON.parse(salida.getContent())));
  return {
    hoja: n => hojas[n],
    get: () => leer(ctx.doGet()),
    post: cuerpo => leer(ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } }))
  };
}

module.exports = { crearEntorno };
