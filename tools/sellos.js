// tools/sellos.js — un sello de versión en cada CSS y JS que piden las páginas.
//
// GitHub Pages sirve todo con Cache-Control: max-age=600 y no deja cambiarlo.
// Sin sello, quien ya abrió la página hoy sigue diez minutos con el CSS o el
// JavaScript viejo aunque el HTML le llegue nuevo, y la página se ve a medias
// hasta que haga Ctrl+F5. Con «styles.css?v=<sello>» la dirección cambia cada
// vez que cambia el archivo, así que el navegador lo baja de nuevo.
//
// El sello son los primeros 8 caracteres del SHA-1 del CONTENIDO del archivo
// (con los saltos de línea normalizados): si el archivo no cambió, el sello
// tampoco, y nadie vuelve a bajar lo que ya tiene.
//
// Lo que NO arregla: el HTML mismo. Ese sigue en caché hasta diez minutos y
// en Pages no hay forma de evitarlo.
//
// Uso, después de tocar un .css o un .js:
//     node tools/sellos.js
// tests/sellos.test.js falla si alguien se olvida de correrlo.
//
// Las páginas de s/ no entran: no piden CSS ni JS. events.config.js tampoco:
// script.js lo carga con su propio sello de tiempo.

"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PAGINAS = ["index.html", "viaje-punta-cana-27-q8m3/index.html"];

// href="algo.css" o src="algo.js", locales (sin esquema ni //), con o sin sello viejo.
const REFERENCIA = /\b(href|src)="((?!https?:|\/\/)[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g;

function selloDe(ruta) {
  const texto = fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha1").update(texto).digest("hex").slice(0, 8);
}

/** El HTML de una página con sus sellos al día. No escribe nada. */
function sellar(pagina) {
  const ruta = path.join(RAIZ, pagina);
  const html = fs.readFileSync(ruta, "utf8");
  return html.replace(REFERENCIA, (todo, attr, ref) => {
    const archivo = path.join(path.dirname(ruta), ref);
    if (!fs.existsSync(archivo)) throw new Error(pagina + " pide " + ref + ", que no existe");
    return attr + '="' + ref + "?v=" + selloDe(archivo) + '"';
  });
}

if (require.main === module) {
  for (const pagina of PAGINAS) {
    const ruta = path.join(RAIZ, pagina);
    const nuevo = sellar(pagina);
    if (nuevo !== fs.readFileSync(ruta, "utf8")) {
      fs.writeFileSync(ruta, nuevo);
      console.log("sellado: " + pagina);
    } else {
      console.log("al día:  " + pagina);
    }
  }
}

module.exports = { PAGINAS, RAIZ, sellar };
