// El botón "Compartir por WhatsApp" enlaza a s/<id>.html. Si alguien añade
// una salida y no corre tools/paginas-salidas.js, ese enlace da 404: esta
// prueba lo atrapa antes de subirlo.

"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { leerConfig, paginas, CARPETA } = require("../tools/paginas-salidas.js");

test("cada salida tiene su página de vista previa al día", () => {
  const esperadas = paginas(leerConfig());
  for (const [f, html] of Object.entries(esperadas)) {
    const ruta = path.join(CARPETA, f);
    assert.ok(fs.existsSync(ruta), "falta s/" + f + " — corre: node tools/paginas-salidas.js");
    assert.strictEqual(fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n"), html,
      "s/" + f + " está viejo — corre: node tools/paginas-salidas.js");
  }
});

test("no quedan páginas de salidas que ya no existen", () => {
  const esperadas = paginas(leerConfig());
  const sobran = fs.readdirSync(CARPETA).filter((f) => f.endsWith(".html") && !(f in esperadas));
  assert.deepStrictEqual(sobran, [], "corre: node tools/paginas-salidas.js");
});

test("la vista previa usa el flyer, la fecha y el lugar", () => {
  const html = paginas(leerConfig())["navidad-criolla-caguas-2026-11-27.html"];
  assert.match(html, /og:title" content="Encendido de la Navidad Criolla en Caguas"/);
  assert.match(html, /og:description" content="vie 27 nov, 5 PM · Caguas"/);
  assert.match(html, /og:image" content="https:\/\/pasalocarlos\.github\.io\/la-vibra-no-falla\/assets\/salidas\/navidad-criolla-caguas-2026\.jpg"/);
  assert.match(html, /location\.replace\("\.\.\/#navidad-criolla-caguas-2026-11-27"\)/);
});
