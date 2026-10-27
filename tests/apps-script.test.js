'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./gas-fake');

const pedido = (extra = {}) => ({ accion: 'ordenar', nombre: 'Ana', color: 'Azul hielo', talla: 'M', pago: 'completo', ...extra });

test('las confirmaciones siguen funcionando igual', () => {
  const e = crearEntorno();
  const r = e.post({ accion: 'voy', salida: 'carite', nombre: 'Luis', acompanantes: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rsvps, { carite: [{ nombre: 'Luis', acompanantes: 2 }] });
});

test('GET devuelve las órdenes junto a las confirmaciones, aunque no haya ninguna', () => {
  const r = crearEntorno().get();
  assert.deepEqual(r, { ok: true, rsvps: {}, ordenes: [] });
});

test('ordenar guarda una fila en la pestaña Ordenes y la devuelve con su id', () => {
  const e = crearEntorno();
  const r = e.post(pedido());
  assert.equal(r.ok, true);
  assert.equal(r.id, 'uuid-1');
  assert.deepEqual(r.ordenes, [{ id: 'uuid-1', nombre: 'Ana', color: 'Azul hielo', talla: 'M', pago: 'completo' }]);
  const filas = e.hoja('Ordenes').filas;
  assert.deepEqual(filas[0], ['Fecha', 'Id', 'Nombre', 'Color', 'Talla', 'Pago', 'Pagado']);
  assert.deepEqual(filas[1].slice(1), ['uuid-1', 'Ana', 'Azul hielo', 'M', 'completo', '']);
});

test('la misma persona puede pedir más de un combo', () => {
  const e = crearEntorno();
  e.post(pedido());
  const r = e.post(pedido({ color: 'Negro', talla: 'XL' }));
  assert.equal(r.ordenes.length, 2);
});

test('la columna Pagado nunca sale hacia la página', () => {
  const e = crearEntorno();
  e.post(pedido());
  e.hoja('Ordenes').filas[1][6] = 'sí';
  assert.equal('pagado' in e.get().ordenes[0], false);
});

test('falta nombre, color o talla: no guarda nada', () => {
  const e = crearEntorno();
  assert.deepEqual(e.post(pedido({ nombre: '  ' })), { ok: false, error: 'falta el nombre' });
  assert.deepEqual(e.post(pedido({ color: '' })), { ok: false, error: 'falta el color' });
  assert.deepEqual(e.post(pedido({ talla: '' })), { ok: false, error: 'falta la talla' });
  assert.deepEqual(e.get().ordenes, []);
});

test('un pago raro se guarda como completo', () => {
  const r = crearEntorno().post(pedido({ pago: 'en bitcoins' }));
  assert.equal(r.ordenes[0].pago, 'completo');
  const dos = crearEntorno().post(pedido({ pago: 'dos-pagos' }));
  assert.equal(dos.ordenes[0].pago, 'dos-pagos');
});

test('un nombre que empieza con = o - se guarda como texto, no como fórmula', () => {
  const e = crearEntorno();
  const r = e.post(pedido({ nombre: '=HYPERLINK("x")' }));
  assert.equal(r.ordenes[0].nombre, '=HYPERLINK("x")');
  assert.equal(e.post(pedido({ nombre: '- Ana' })).ordenes[1].nombre, '- Ana');
});

test('los textos se recortan: nombre a 40, color y talla a 30', () => {
  const r = crearEntorno().post(pedido({ nombre: 'n'.repeat(80), color: 'c'.repeat(80), talla: 't\n'.repeat(40) }));
  assert.equal(r.ordenes[0].nombre.length, 40);
  assert.equal(r.ordenes[0].color.length, 30);
  assert.equal(r.ordenes[0].talla.includes('\n'), false);
});

test('quitar-orden borra solo ese pedido', () => {
  const e = crearEntorno();
  e.post(pedido());
  e.post(pedido({ nombre: 'Luis' }));
  const r = e.post({ accion: 'quitar-orden', id: 'uuid-1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ordenes.map(o => o.nombre), ['Luis']);
});

test('quitar-orden con un id que no existe no rompe nada', () => {
  const e = crearEntorno();
  e.post(pedido());
  const r = e.post({ accion: 'quitar-orden', id: 'no-existe' });
  assert.equal(r.ok, true);
  assert.equal(r.ordenes.length, 1);
});

test('una orden no confunde a las confirmaciones (no exige salida)', () => {
  const e = crearEntorno();
  e.post(pedido());
  assert.deepEqual(e.get().rsvps, {});
});
