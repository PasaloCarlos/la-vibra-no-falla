// tools/paginas-salidas.js — una página por salida para la vista previa de WhatsApp.
//
// WhatsApp arma la tarjeta del enlace leyendo las etiquetas og: del HTML y no
// corre JavaScript, así que "index.html#<id>" siempre enseña el logo y el
// título general. Por eso cada salida tiene su propia página en s/<id>.html,
// con su título, su fecha y su flyer en las og:, que al abrirla en el
// navegador lleva enseguida a la tarjeta en la página principal.
//
// La redirección es SÓLO con JavaScript, a propósito: sin canonical y sin
// <meta refresh>, porque algunos lectores de vistas previas los siguen y
// terminarían leyendo las og: de la página principal.
//
// Uso, después de añadir o cambiar una salida en events.config.js:
//     node tools/paginas-salidas.js
// Escribe s/<id>.html por cada salida y borra las de salidas que ya no están.
// tests/paginas-salidas.test.js falla si alguien se olvida de correrlo.

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.resolve(__dirname, "..");
const CARPETA = path.join(RAIZ, "s");
const PAGINA = "https://pasalocarlos.github.io/la-vibra-no-falla/";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function leerConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "events.config.js"), "utf8"), ctx);
  return ctx.window.vibraConfig;
}

// Las mismas reglas que parseFecha en script.js.
function parseFecha(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(texto || "").trim());
  if (!m) return null;
  return { d: new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0)), conHora: !!m[4] };
}

function hora12(d) {
  const h = d.getHours() % 12 || 12;
  const min = d.getMinutes() ? ":" + String(d.getMinutes()).padStart(2, "0") : "";
  return h + min + (d.getHours() < 12 ? " AM" : " PM");
}

function cuando(s) {
  const ini = parseFecha(s.inicio);
  if (!ini) return "";
  const d = ini.d;
  const fin = s.fin ? (parseFecha(s.fin) || {}).d : null;
  let t = DIAS[d.getDay()] + " " + d.getDate() + " " + MESES[d.getMonth()];
  if (fin) t += " → " + DIAS[fin.getDay()] + " " + fin.getDate() + " " + MESES[fin.getMonth()];
  else if (ini.conHora) t += ", " + hora12(d);
  return t;
}

// La imagen de la vista previa: el flyer, si no la primera foto, si no la
// portada del primer video, y si no hay nada, el logo del grupo.
function imagen(s, cfg) {
  const primero = (l) => (l || []).filter(Boolean)[0];
  const video = primero(s.videos);
  const portada = video && (typeof video === "string" ? video.replace(/\.mp4$/i, ".jpg") : video.poster);
  return s.foto || primero(s.fotos) || portada || (cfg.grupo && cfg.grupo.logo) || "assets/logo-vibra.jpg";
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(s, cfg) {
  const grupo = (cfg.grupo && cfg.grupo.nombre) || "Vibra Extrema";
  const titulo = s.titulo || "Salida";
  const descripcion = [cuando(s), s.lugar].filter(Boolean).join(" · ") || grupo;
  const destino = "../#" + s.id;
  const img = PAGINA + imagen(s, cfg);
  const grande = !!(s.foto || (s.fotos || []).length || (s.videos || []).length);
  return `<!doctype html>
<!-- Generado por tools/paginas-salidas.js desde events.config.js. No lo edites a mano. -->
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} — ${esc(grupo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${PAGINA}s/${esc(s.id)}.html">
<meta property="og:site_name" content="${esc(grupo)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_PR">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:alt" content="${esc(titulo)}">
<meta name="twitter:card" content="${grande ? "summary_large_image" : "summary"}">
<script>location.replace(${JSON.stringify(destino)});</script>
</head>
<body style="background:#14331c;color:#f0f6ee;font-family:system-ui,sans-serif;padding:24px">
<p><a href="${esc(destino)}" style="color:#8ccbf7">${esc(titulo)}</a></p>
</body>
</html>
`;
}

function paginas(cfg) {
  const out = {};
  (cfg.salidas || []).forEach((s) => {
    if (s && s.id) out[s.id + ".html"] = render(s, cfg);
  });
  return out;
}

function escribir() {
  const cfg = leerConfig();
  const nuevas = paginas(cfg);
  fs.mkdirSync(CARPETA, { recursive: true });
  for (const f of fs.readdirSync(CARPETA)) {
    if (f.endsWith(".html") && !(f in nuevas)) {
      fs.unlinkSync(path.join(CARPETA, f));
      console.log("borrada  s/" + f);
    }
  }
  for (const [f, html] of Object.entries(nuevas)) {
    const ruta = path.join(CARPETA, f);
    // git en Windows puede dejarlas con CRLF: eso no cuenta como cambio.
    const antes = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n") : null;
    if (antes !== html) {
      fs.writeFileSync(ruta, html);
      console.log((antes === null ? "nueva    " : "cambiada ") + "s/" + f);
    }
  }
}

module.exports = { leerConfig, paginas, CARPETA };
if (require.main === module) escribir();
