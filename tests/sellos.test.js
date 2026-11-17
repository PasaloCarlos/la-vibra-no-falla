// Cada CSS y JS que pide una página lleva «?v=<sello>» para que el navegador
// no se quede con la copia vieja (ver tools/sellos.js). Si alguien toca un
// .css o un .js y no vuelve a sellar, la página nueva seguiría pidiendo la
// dirección de antes: esta prueba lo atrapa antes de subirlo.

"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { PAGINAS, RAIZ, sellar } = require("../tools/sellos.js");

test("los sellos de CSS y JS están al día", () => {
  for (const pagina of PAGINAS) {
    assert.strictEqual(fs.readFileSync(path.join(RAIZ, pagina), "utf8"), sellar(pagina),
      pagina + " tiene un sello viejo — corre: node tools/sellos.js");
  }
});

test("ninguna página pide un CSS o un JS local sin sello", () => {
  for (const pagina of PAGINAS) {
    const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
    const sinSello = html.match(/\b(?:href|src)="(?!https?:|\/\/)[^"?#]+\.(?:css|js)"/g) || [];
    assert.deepStrictEqual(sinSello, [], pagina + " — corre: node tools/sellos.js");
    assert.match(html, /\.(?:css|js)\?v=[0-9a-f]{8}"/, pagina + " no tiene ningún sello");
  }
});
