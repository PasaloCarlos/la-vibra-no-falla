// script.js — renders the salidas from window.vibraConfig and talks to the
// Apps Script web app that keeps the confirmations in the group's Sheet.
//
// Two rules worth keeping if you edit this file:
//   1. Names come back from a public endpoint, so they go into the page with
//      textContent, never innerHTML. A joke name should stay a joke, not script.
//   2. The page must work with the RSVP endpoint switched off or unreachable:
//      the salidas are the point, the headcount is a bonus.

(function () {
  "use strict";

  // GitHub Pages sirve todo con Cache-Control: max-age=600. Sin esto, una
  // salida nueva tarda hasta DIEZ MINUTOS en aparecerle a quien ya abrió la
  // página hoy — y el que la comparte cree que no se publicó. Por eso el
  // archivo de salidas se pide con un sello que cambia cada minuto, en vez de
  // ir como <script src> en el HTML.
  var cargador = document.createElement("script");
  cargador.src = "events.config.js?t=" + Math.floor(Date.now() / 60000);
  cargador.onload = arrancar;
  cargador.onerror = noCargo;
  document.head.appendChild(cargador);

  function noCargo() {
    var vacio = document.getElementById("empty");
    vacio.querySelector("h2").textContent = "No se pudieron cargar las salidas.";
    vacio.querySelector("p").textContent = "Revisa la conexión y recarga la página.";
    vacio.hidden = false;
  }

  function arrancar() {

  var cfg = window.vibraConfig;
  if (!cfg) { noCargo(); return; }

  var RSVP_URL = (cfg.rsvp && cfg.rsvp.url ? cfg.rsvp.url : "").trim();
  var MAX_PLUS = cfg.rsvp && typeof cfg.rsvp.maxAcompanantes === "number" ? cfg.rsvp.maxAcompanantes : 3;
  var NOMBRE_KEY = "vibra:nombre";
  var MIS_ORDENES_KEY = "vibra:mis-ordenes";

  var tpl = document.getElementById("tpl-salida");
  var estado = {};   // salidaId -> [{nombre, acompanantes}]
  var ordenes = [];  // [{id, nombre, color, talla, pago}] en el orden en que llegaron

  // --- fechas --------------------------------------------------------------

  var DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function parseFecha(texto) {
    // "2026-10-18T15:00" con hora, o "2026-10-18" cuando todavía no se sabe a
    // qué hora. Hora local: Puerto Rico no cambia la hora en todo el año.
    var t = String(texto || "").trim();
    var conHora = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
    if (conHora) {
      return { fecha: new Date(+conHora[1], +conHora[2] - 1, +conHora[3], +conHora[4], +conHora[5], 0, 0), conHora: true };
    }
    var soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (soloDia) {
      return { fecha: new Date(+soloDia[1], +soloDia[2] - 1, +soloDia[3], 9, 0, 0, 0), conHora: false };
    }
    return null;
  }

  function mismoDiaOdespues(fecha, hoy) {
    // Una salida sigue siendo "próxima" durante todo su propio día: la de las
    // 7 AM no debe desaparecer a las 8 AM mientras el grupo está allá.
    var a = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    var b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return a >= b;
  }

  function hora12(fecha) {
    var h = fecha.getHours();
    var min = fecha.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (min ? ":" + String(min).padStart(2, "0") : "") + " " + ampm;
  }

  function cuentaRegresiva(fecha, ahora) {
    var ms = fecha - ahora;
    if (ms <= 0) return "¡Hoy es!";
    var min = Math.floor(ms / 60000);
    if (min < 60) return "Faltan " + min + (min === 1 ? " minuto" : " minutos");
    var horas = Math.floor(min / 60);
    if (horas < 24) return "Faltan " + horas + (horas === 1 ? " hora" : " horas");
    var dias = Math.round(horas / 24);
    return "Faltan " + dias + (dias === 1 ? " día" : " días");
  }

  // --- compartir -----------------------------------------------------------

  /** "sáb 17 oct, 2 PM" o "vie 23 → dom 25 oct": la fecha como la diría uno. */
  function cuandoEnPalabras(fecha, fin, conHora) {
    var dia = DIAS[fecha.getDay()] + " " + fecha.getDate() + " " + MESES[fecha.getMonth()];
    if (fin) {
      return DIAS[fecha.getDay()] + " " + fecha.getDate() +
        (fin.getMonth() === fecha.getMonth() ? "" : " " + MESES[fecha.getMonth()]) +
        " → " + DIAS[fin.getDay()] + " " + fin.getDate() + " " + MESES[fin.getMonth()] +
        (conHora ? ", desde las " + hora12(fecha) : "");
    }
    return dia + (conHora ? ", " + hora12(fecha) : "");
  }

  /** Dónde vive esta página, para que el enlace sirva igual en local y en Pages. */
  function enlacePagina(salidaId) {
    return location.origin + location.pathname + "#" + salidaId;
  }

  /** El mensaje que WhatsApp abre escrito. wa.me sin número deja elegir el chat. */
  function enlaceWhatsApp(salida, fecha, fin, conHora) {
    var lineas = [salida.titulo, cuandoEnPalabras(fecha, fin, conHora)];
    if (salida.lugar) lineas.push(salida.lugar);
    var costo = typeof salida.costo === "number"
      ? (salida.costo > 0 ? "$" + salida.costo : "Gratis")
      : String(salida.costo || "").trim();
    if (costo) lineas.push(costo);
    if (salida.punto) lineas.push(salida.punto);
    if (salida.mapa) lineas.push("Mapa: " + salida.mapa);
    lineas.push(enlacePagina(salida.id));
    return "https://wa.me/?text=" + encodeURIComponent(lineas.join("\n"));
  }

  // --- confirmaciones ------------------------------------------------------

  function personas(lista) {
    return (lista || []).reduce(function (t, r) { return t + 1 + (r.acompanantes || 0); }, 0);
  }

  /** Confirmaciones y pedidos llegan juntos en el mismo GET. */
  function cargarDatos() {
    if (!RSVP_URL) return Promise.resolve({ rsvps: {}, ordenes: [] });
    return fetch(RSVP_URL + (RSVP_URL.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(), {
      method: "GET",
      redirect: "follow",
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return { rsvps: (data && data.rsvps) || {}, ordenes: (data && data.ordenes) || [] };
      });
  }

  function enviar(cuerpo) {
    // text/plain a propósito: así el navegador no manda un preflight que Apps
    // Script no contesta. El script lee e.postData.contents y lo parsea.
    return fetch(RSVP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo),
      redirect: "follow",
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || "respuesta inesperada");
        return data;
      });
  }

  function enviarRsvp(cuerpo) {
    return enviar(cuerpo).then(function (data) { return data.rsvps || {}; });
  }

  function nombreGuardado() {
    try { return localStorage.getItem(NOMBRE_KEY) || ""; } catch (e) { return ""; }
  }
  function guardarNombre(nombre) {
    try { localStorage.setItem(NOMBRE_KEY, nombre); } catch (e) { /* modo privado */ }
  }
  function igual(a, b) {
    return String(a || "").trim().toLocaleLowerCase("es") === String(b || "").trim().toLocaleLowerCase("es");
  }

  // Videos de una salida: cada uno es la ruta del .mp4 o { src, poster }.
  // preload="none" para que nada se baje hasta que alguien le dé play, y
  // playsinline para que en iPhone no salte a pantalla completa.
  function pintarVideos(salida) {
    var lista = (salida.videos || []).filter(Boolean);
    if (!lista.length) return null;
    var caja = document.createElement("div");
    caja.className = "videos";
    lista.forEach(function (v) {
      if (typeof v === "string") v = { src: v };
      var video = document.createElement("video");
      video.controls = true;
      video.preload = "none";
      video.setAttribute("playsinline", "");
      // Sin poster explícito, se busca el .jpg con el mismo nombre del video.
      video.poster = v.poster || v.src.replace(/\.mp4$/i, ".jpg");
      video.src = v.src;
      video.setAttribute("aria-label", "Video: " + (salida.titulo || "salida"));
      caja.appendChild(video);
    });
    return caja;
  }

  // Fotos de una salida: miniaturas que abren la galería. La miniatura es el
  // mismo archivo con "-mini" antes del .jpg; la grande sólo se baja al abrirla.
  var MAX_MINIS = 8;
  function mini(src) { return src.replace(/(\.\w+)$/, "-mini$1"); }

  function pintarFotos(salida) {
    var lista = (salida.fotos || []).filter(Boolean);
    if (!lista.length) return null;
    var caja = document.createElement("div");
    caja.className = "fotos";
    lista.slice(0, MAX_MINIS).forEach(function (src, i) {
      var a = document.createElement("a");
      a.href = src;
      a.className = "mini";
      var img = document.createElement("img");
      img.src = mini(src);
      img.alt = "Foto " + (i + 1) + " de " + (salida.titulo || "la salida");
      img.loading = "lazy";
      a.appendChild(img);
      // La última miniatura visible cuenta las que quedan escondidas.
      var resto = lista.length - MAX_MINIS;
      if (i === MAX_MINIS - 1 && resto > 0) {
        var mas = document.createElement("span");
        mas.className = "mas";
        mas.textContent = "+" + resto;
        a.appendChild(mas);
      }
      a.addEventListener("click", function (e) {
        e.preventDefault();
        abrirGaleria(lista, i, salida.titulo);
      });
      caja.appendChild(a);
    });
    return caja;
  }

  // Una sola galería para toda la página, creada la primera vez que se usa.
  var galeria = null;
  function abrirGaleria(lista, inicio, titulo) {
    if (!galeria) galeria = crearGaleria();
    galeria.lista = lista;
    galeria.titulo = titulo || "";
    galeria.mostrar(inicio);
    if (galeria.dlg.showModal) galeria.dlg.showModal(); else galeria.dlg.setAttribute("open", "");
  }

  function crearGaleria() {
    var dlg = document.createElement("dialog");
    dlg.className = "galeria";
    dlg.innerHTML =
      '<img alt="">' +
      '<button type="button" class="g-cerrar" aria-label="Cerrar">✕</button>' +
      '<button type="button" class="g-ant" aria-label="Foto anterior">‹</button>' +
      '<button type="button" class="g-sig" aria-label="Foto siguiente">›</button>' +
      '<p class="g-cuenta"></p>';
    document.body.appendChild(dlg);
    var img = dlg.querySelector("img");
    var g = { dlg: dlg, lista: [], i: 0, titulo: "" };

    g.mostrar = function (i) {
      var n = g.lista.length;
      g.i = (i + n) % n;
      img.src = g.lista[g.i];
      img.alt = "Foto " + (g.i + 1) + " de " + g.titulo;
      dlg.querySelector(".g-cuenta").textContent = (g.i + 1) + " / " + n;
      dlg.querySelector(".g-ant").hidden = dlg.querySelector(".g-sig").hidden = n < 2;
    };
    function cerrar() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }

    dlg.querySelector(".g-cerrar").addEventListener("click", cerrar);
    dlg.querySelector(".g-ant").addEventListener("click", function () { g.mostrar(g.i - 1); });
    dlg.querySelector(".g-sig").addEventListener("click", function () { g.mostrar(g.i + 1); });
    // Tocar fuera de la foto cierra (el clic cae en el propio <dialog>).
    dlg.addEventListener("click", function (e) { if (e.target === dlg) cerrar(); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") g.mostrar(g.i - 1);
      if (e.key === "ArrowRight") g.mostrar(g.i + 1);
    });
    // Deslizar con el dedo pasa de foto.
    var x0 = null;
    dlg.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) g.mostrar(g.i + (dx < 0 ? 1 : -1));
    });
    return g;
  }

  // Videos primero y fotos debajo: lo que una salida trae de recuerdo.
  function pintarRecuerdos(salida) {
    var partes = [pintarVideos(salida), pintarFotos(salida)].filter(Boolean);
    if (!partes.length) return null;
    var caja = document.createElement("div");
    caja.className = "recuerdos";
    partes.forEach(function (p) { caja.appendChild(p); });
    return caja;
  }

  // --- calendario, cómo llegar y clima ---------------------------------------

  var PAGINA = "https://pasalocarlos.github.io/la-vibra-no-falla/";
  var HORAS_POR_DEFECTO = 3;   // la config no dice cuándo termina una salida

  function dos(n) { return (n < 10 ? "0" : "") + n; }
  function diaCompacto(d) { return d.getFullYear() + dos(d.getMonth() + 1) + dos(d.getDate()); }
  function horaCompacta(d) { return diaCompacto(d) + "T" + dos(d.getHours()) + dos(d.getMinutes()) + "00"; }
  function masDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }
  function masHoras(d, n) { return new Date(d.getTime() + n * 3600000); }

  // La config está en hora de Puerto Rico (UTC−4 todo el año, sin cambio de
  // hora). Para el .ics se pasa a UTC a mano, para que sea correcto aunque
  // quien lo baje tenga el teléfono en otra zona.
  function utcCompacta(d) {
    var u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 4, d.getMinutes()));
    return u.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function lugarConPais(salida) {
    var lugar = String(salida.lugar || "").trim();
    return lugar ? lugar + ", Puerto Rico" : "";
  }

  // Todo el día si no hay hora o si dura varios días; si no, 3 horas.
  function rangoSalida(fecha, fin, conHora) {
    if (fin || !conHora) return { todoElDia: true, desde: fecha, hasta: masDias(fin || fecha, 1) };
    return { todoElDia: false, desde: fecha, hasta: masHoras(fecha, HORAS_POR_DEFECTO) };
  }

  function textoDetalles(salida) {
    return [salida.descripcion, salida.punto, PAGINA + "#" + salida.id].filter(Boolean).join("\n\n");
  }

  // iPhone, iPad y Mac abren el .ics en su Calendario; los demás (Android,
  // Windows) casi siempre usan Google Calendar.
  var ES_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

  function botonCalendario(salida, fecha, fin, conHora) {
    var r = rangoSalida(fecha, fin, conHora);
    var a = document.createElement("a");
    a.className = "share";
    a.textContent = "Añadir al calendario";
    if (ES_APPLE) {
      a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics(salida, r));
      a.download = salida.id + ".ics";
    } else {
      var fechas = r.todoElDia
        ? diaCompacto(r.desde) + "/" + diaCompacto(r.hasta)
        : horaCompacta(r.desde) + "/" + horaCompacta(r.hasta);
      a.href = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
        "&text=" + encodeURIComponent(salida.titulo || "Salida") +
        "&dates=" + fechas +
        "&ctz=America/Puerto_Rico" +
        "&details=" + encodeURIComponent(textoDetalles(salida)) +
        "&location=" + encodeURIComponent(lugarConPais(salida));
      a.rel = "noopener";
    }
    return a;
  }

  function escIcs(t) {
    return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  // Las líneas de un .ics no deben pasar de 75 bytes: se doblan con un espacio.
  function doblar(linea) {
    var out = [];
    while (linea.length > 60) { out.push(linea.slice(0, 60)); linea = " " + linea.slice(60); }
    out.push(linea);
    return out.join("\r\n");
  }

  function ics(salida, r) {
    var cuando = r.todoElDia
      ? ["DTSTART;VALUE=DATE:" + diaCompacto(r.desde), "DTEND;VALUE=DATE:" + diaCompacto(r.hasta)]
      : ["DTSTART:" + utcCompacta(r.desde), "DTEND:" + utcCompacta(r.hasta)];
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vibra Extrema//La vibra no falla//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + salida.id + "@pasalocarlos.github.io",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    ].concat(cuando, [
      "SUMMARY:" + escIcs(salida.titulo || "Salida"),
      "LOCATION:" + escIcs(lugarConPais(salida)),
      "DESCRIPTION:" + escIcs(textoDetalles(salida)),
      "URL:" + PAGINA + "#" + salida.id,
      // Un recordatorio el día antes, que es cuando se cuadra quién lleva qué.
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + escIcs("Mañana: " + (salida.titulo || "salida")),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]).map(doblar).join("\r\n");
  }

  // Google Maps: el pin de la salida (mapa) si lo tiene; si no, busca el lugar
  // por nombre. Sin pin ni lugar, no hay botón.
  function botonesMapa(salida) {
    var q = lugarConPais(salida);
    if (!q && !salida.mapa) return [];
    var maps = document.createElement("a");
    maps.className = "share";
    maps.textContent = "Google Maps";
    maps.href = salida.mapa || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
    maps.rel = "noopener";
    return [maps];
  }

  // El clima sale cuando falta una semana o menos (antes, el pronóstico no
  // sirve de mucho). Open-Meteo es gratis y no pide cuenta. Si una salida no
  // trae coords: [lat, lon], se busca el sitio por nombre, de lo más
  // específico a lo menos ("El Yerta, Villalba" → "El Yerta", luego "Villalba").
  var DIAS_CLIMA = 7;
  var climaCache = {};   // salidaId → promesa; pintarTodo corre dos veces

  var CIELO = [
    [[0], "Despejado"], [[1, 2], "Parcialmente nublado"], [[3], "Nublado"],
    [[45, 48], "Neblina"], [[51, 53, 55, 56, 57], "Llovizna"],
    [[61, 63, 65, 66, 67], "Lluvia"], [[80, 81, 82], "Aguaceros"], [[95, 96, 99], "Tormenta"],
  ];
  function cielo(codigo) {
    for (var i = 0; i < CIELO.length; i++) if (CIELO[i][0].indexOf(codigo) !== -1) return CIELO[i][1];
    return "";
  }

  function buscarCoords(salida) {
    if (salida.coords && salida.coords.length === 2) return Promise.resolve(salida.coords);
    var partes = String(salida.lugar || "").split(",").map(function (p) { return p.trim(); }).filter(Boolean);
    function probar(i) {
      if (i >= partes.length) return Promise.reject(new Error("sin coords"));
      return fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&countryCode=PR&name=" +
          encodeURIComponent(partes[i]))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var p = d.results && d.results[0];
          return p ? [p.latitude, p.longitude] : probar(i + 1);
        });
    }
    return probar(0);
  }

  function pedirClima(salida, fecha, fin) {
    var hasta = fin || fecha;
    return buscarCoords(salida).then(function (c) {
      return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + c[0] + "&longitude=" + c[1] +
          "&daily=weather_code,temperature_2m_max,precipitation_probability_max" +
          "&temperature_unit=fahrenheit&timezone=America%2FPuerto_Rico" +
          "&start_date=" + isoDia(fecha) + "&end_date=" + isoDia(hasta))
        .then(function (r) { return r.json(); });
    });
  }
  function isoDia(d) { return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()); }

  function montarClima(nodo, salida, fecha, fin) {
    var hoy = new Date();
    var dias = (new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) -
      new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000;
    if (dias > DIAS_CLIMA) return;
    if (!salida.coords && !salida.lugar) return;

    var p = document.createElement("p");
    p.className = "clima";
    p.hidden = true;
    campo(nodo, "countdown").after(p);

    if (!climaCache[salida.id]) climaCache[salida.id] = pedirClima(salida, fecha, fin);
    climaCache[salida.id].then(function (d) {
      var t = d.daily;
      if (!t || !t.time || !t.time.length) return;
      // Un día: "31° · 40% lluvia · Aguaceros". Varios: una línea por día.
      var lineas = t.time.slice(0, 4).map(function (dia, i) {
        var f = parseFecha(dia).fecha;
        var partes = [];
        if (t.temperature_2m_max[i] != null) partes.push(Math.round(t.temperature_2m_max[i]) + "°F");
        if (t.precipitation_probability_max[i] != null) partes.push(t.precipitation_probability_max[i] + "% lluvia");
        var c = cielo(t.weather_code[i]);
        if (c) partes.push(c);
        return (t.time.length > 1 ? DIAS[f.getDay()] + " " + f.getDate() + ": " : "") + partes.join(" · ");
      });
      p.textContent = "";
      var titulo = document.createElement("strong");
      titulo.textContent = "Clima";
      p.appendChild(titulo);
      lineas.forEach(function (l) {
        var s = document.createElement("span");
        s.textContent = l;
        p.appendChild(s);
      });
      p.hidden = false;
    }).catch(function () { /* sin clima: la tarjeta sirve igual */ });
  }

  // --- ya vibramos ---------------------------------------------------------

  // Una salida pasada sin videos ni fotos: una línea, fecha y nombre.
  function pintarPasada(x) {
    var li = document.createElement("li");
    var fecha = document.createElement("span");
    fecha.className = "fecha";
    fecha.textContent = x.f.getDate() + " " + MESES[x.f.getMonth()] + " " + x.f.getFullYear();
    var que = document.createElement("span");
    que.className = "que";
    que.textContent = x.s.titulo || "Salida";
    li.appendChild(fecha);
    li.appendChild(que);
    return li;
  }

  // Una salida pasada con recuerdos: tarjeta. El bloque de fecha repite el de
  // las próximas salidas, pero en línea y sin relleno: lo que viene va lleno,
  // lo que ya pasó, delineado.
  function pintarRecuerdo(x, recuerdos) {
    var s = x.s;
    var li = document.createElement("li");
    li.className = "recuerdo";

    var cabeza = document.createElement("div");
    cabeza.className = "recuerdo-cabeza";

    var sello = document.createElement("p");
    sello.className = "sello";
    var fin = s.fin ? (parseFecha(s.fin) || {}).fecha : null;
    var mismoMes = fin && fin.getMonth() === x.f.getMonth() && fin.getDate() !== x.f.getDate();
    var dia = document.createElement("span");
    dia.className = "sello-dia" + (mismoMes ? " rango" : "");
    dia.textContent = mismoMes ? x.f.getDate() + "–" + fin.getDate() : x.f.getDate();
    var mes = document.createElement("span");
    mes.className = "sello-mes";
    mes.textContent = MESES[x.f.getMonth()];
    dia.setAttribute("aria-hidden", "true");
    mes.setAttribute("aria-hidden", "true");
    // El sello se ve; el lector de pantalla lee la fecha completa.
    var leida = document.createElement("span");
    leida.className = "solo-lector";
    leida.textContent = x.f.getDate() + (mismoMes ? " al " + fin.getDate() : "") +
      " de " + MESES[x.f.getMonth()] + " de " + x.f.getFullYear();
    sello.appendChild(dia);
    sello.appendChild(mes);
    sello.appendChild(leida);

    var texto = document.createElement("div");
    texto.className = "recuerdo-texto";
    var h3 = document.createElement("h3");
    h3.textContent = s.titulo || "Salida";
    var cuantos = document.createElement("p");
    cuantos.className = "cuantos";
    cuantos.textContent = contar((s.videos || []).filter(Boolean).length, "video", "videos")
      .concat(contar((s.fotos || []).filter(Boolean).length, "foto", "fotos"))
      .join(" · ");
    texto.appendChild(h3);
    texto.appendChild(cuantos);

    cabeza.appendChild(sello);
    cabeza.appendChild(texto);
    li.appendChild(cabeza);
    li.appendChild(recuerdos);
    return li;
  }

  function contar(n, uno, varios) { return n ? [n + " " + (n === 1 ? uno : varios)] : []; }

  // --- pintar una salida ---------------------------------------------------

  function campo(nodo, nombre) { return nodo.querySelector('[data-f="' + nombre + '"]'); }

  function pintarSalida(salida, fecha, opciones) {
    var nodo = tpl.content.firstElementChild.cloneNode(true);
    var esProxima = !!(opciones && opciones.proxima);
    var conHora = !(opciones && opciones.sinHora);
    var fin = salida.fin ? (parseFecha(salida.fin) || {}).fecha : null;

    campo(nodo, "dow").textContent = DIAS[fecha.getDay()];
    // Una acampada de varios días enseña el rango en el bloque de la fecha:
    // "23–25". Si cruza de mes, el rango completo va en la línea de abajo.
    var esRango = !!(fin && fin.getMonth() === fecha.getMonth() && fin.getDate() !== fecha.getDate());
    var elDia = campo(nodo, "day");
    elDia.textContent = esRango ? fecha.getDate() + "–" + fin.getDate() : fecha.getDate();
    if (esRango) elDia.classList.add("rango");
    campo(nodo, "month").textContent = MESES[fecha.getMonth()];
    campo(nodo, "titulo").textContent = salida.titulo || "Salida";

    // Lo que no se sabe no se escribe: una línea que dice "por confirmar" dos
    // veces ocupa el mismo espacio que un dato y no dice nada.
    var textoHora = fin
      ? DIAS[fecha.getDay()] + " " + fecha.getDate() + " " + MESES[fecha.getMonth()] +
        " → " + DIAS[fin.getDay()] + " " + fin.getDate() + " " + MESES[fin.getMonth()] +
        (conHora ? ", desde las " + hora12(fecha) : "")
      : (conHora ? hora12(fecha) : "");
    var textoLugar = String(salida.lugar || "").trim();
    campo(nodo, "hora").textContent = textoHora;
    campo(nodo, "lugar").textContent = textoLugar;
    nodo.querySelector(".meta .dot").hidden = !(textoHora && textoLugar);
    if (!textoHora && !textoLugar) nodo.querySelector(".meta").remove();
    var desc = campo(nodo, "descripcion");
    if (salida.descripcion) { desc.textContent = salida.descripcion; } else { desc.remove(); }

    // El flyer de la salida, completo. Se crea aquí y no en el <template> para
    // que aparezca aunque el visitante tenga el HTML viejo en caché.
    if (salida.foto) {
      var foto = document.createElement("a");
      foto.className = "foto";
      foto.href = salida.foto;
      var img = document.createElement("img");
      img.src = salida.foto;
      img.alt = "Flyer: " + (salida.titulo || "salida");
      img.loading = "lazy";
      foto.appendChild(img);
      (desc.parentNode ? desc : nodo.querySelector(".meta") || campo(nodo, "titulo")).after(foto);
    }
    var recuerdos = pintarRecuerdos(salida);
    if (recuerdos) campo(nodo, "tags").before(recuerdos);

    if (salida.punto) {
      var punto = campo(nodo, "punto");
      punto.textContent = salida.punto;
      punto.hidden = false;
    }

    if (esProxima) {
      var cd = campo(nodo, "countdown");
      cd.hidden = false;
      cd.textContent = cuentaRegresiva(fecha, new Date());
      setInterval(function () { cd.textContent = cuentaRegresiva(fecha, new Date()); }, 60000);
    }

    // chips: dificultad, costo, cupo
    var tags = campo(nodo, "tags");
    if (salida.dificultad) {
      var li = document.createElement("li");
      li.className = "t-" + salida.dificultad;
      li.textContent = salida.dificultad;
      tags.appendChild(li);
    }
    // costo: número ($25) o texto libre ("$25 por noche"), porque no todas las
    // vueltas se cobran igual.
    // null/"" = todavía no se sabe, y entonces no hay chip. 0 sí es un dato: gratis.
    var textoCosto = typeof salida.costo === "number"
      ? (salida.costo > 0 ? "$" + salida.costo : "Gratis")
      : String(salida.costo || "").trim();
    if (textoCosto) {
      var costo = document.createElement("li");
      costo.textContent = textoCosto;
      tags.appendChild(costo);
    }
    if (salida.cupo) {
      var cupo = document.createElement("li");
      cupo.textContent = "Cupo " + salida.cupo;
      tags.appendChild(cupo);
    }

    if (salida.llevar && salida.llevar.length) {
      var ul = campo(nodo, "llevar");
      salida.llevar.forEach(function (cosa) {
        var item = document.createElement("li");
        item.textContent = cosa;
        ul.appendChild(item);
      });
      ul.hidden = false;
    }

    nodo.id = salida.id;   // para que el enlace compartido caiga en esta tarjeta
    // El botón se crea aquí si el HTML en caché del visitante todavía no lo
    // trae, así que el JS nuevo basta para que aparezca: no hay combinación de
    // versiones que deje un enlace sin destino.
    var compartir = campo(nodo, "share");
    if (!compartir) {
      compartir = document.createElement("a");
      compartir.className = "share";
      compartir.rel = "noopener";
      compartir.textContent = "Compartir por WhatsApp";
      nodo.querySelector(".links").appendChild(compartir);
    }
    compartir.href = enlaceWhatsApp(salida, fecha, fin, conHora);
    compartir.hidden = false;

    // Calendario y cómo llegar van antes de compartir: son para uno mismo.
    var antes = [botonCalendario(salida, fecha, fin, conHora)].concat(botonesMapa(salida));
    antes.forEach(function (a) { compartir.before(a); });

    montarClima(nodo, salida, fecha, fin);

    if (RSVP_URL) {
      montarRsvp(nodo, salida);
    } else {
      var off = campo(nodo, "rsvpoff");
      off.hidden = false;
      if (cfg.grupo && cfg.grupo.whatsapp) {
        off.textContent = "";
        var a = document.createElement("a");
        a.href = cfg.grupo.whatsapp;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Avisa en el grupo que vas";
        off.appendChild(a);
      }
    }

    return nodo;
  }

  // --- el bloque de confirmar ----------------------------------------------

  function montarRsvp(nodo, salida) {
    var caja = campo(nodo, "rsvp");
    var form = campo(nodo, "form");
    var btnVoy = campo(nodo, "voy");
    var btnNo = campo(nodo, "novoy");
    var btnCancel = campo(nodo, "cancel");
    var msg = campo(nodo, "msg");
    var inputNombre = form.querySelector('input[name="nombre"]');
    var inputPlus = form.querySelector('input[name="acompanantes"]');
    var plusLabel = campo(nodo, "plus-label");

    caja.hidden = false;
    if (MAX_PLUS <= 0) { plusLabel.hidden = true; } else { inputPlus.max = MAX_PLUS; }

    function refrescar() {
      var lista = estado[salida.id] || [];
      var total = personas(lista);
      var cupoLleno = salida.cupo && total >= salida.cupo;

      campo(nodo, "count").textContent =
        total === 0 ? "Nadie confirmado todavía"
        : total === 1 ? "1 confirmado"
        : total + " confirmados" + (salida.cupo ? " de " + salida.cupo : "");

      var who = campo(nodo, "who");
      who.textContent = "";
      lista.forEach(function (r) {
        var li = document.createElement("li");
        li.textContent = r.nombre;                       // nunca innerHTML
        if (r.acompanantes > 0) {
          li.className = "mas";
          li.setAttribute("data-mas", "+" + r.acompanantes);
        }
        who.appendChild(li);
      });

      var yo = nombreGuardado();
      var apuntado = yo && lista.some(function (r) { return igual(r.nombre, yo); });
      btnNo.hidden = !apuntado;
      btnVoy.hidden = !!apuntado;
      btnVoy.disabled = !!cupoLleno;
      btnVoy.textContent = cupoLleno ? "Cupo lleno" : "Voy";
    }

    btnVoy.addEventListener("click", function () {
      form.hidden = false;
      inputNombre.value = nombreGuardado();
      inputNombre.focus();
    });

    btnCancel.addEventListener("click", function () {
      form.hidden = true;
      msg.textContent = "";
      msg.classList.remove("error");
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var nombre = inputNombre.value.trim();
      if (!nombre) return;
      var acompanantes = MAX_PLUS > 0 ? Math.max(0, Math.min(MAX_PLUS, parseInt(inputPlus.value, 10) || 0)) : 0;

      msg.classList.remove("error");
      msg.textContent = "Mandando…";
      campo(nodo, "submit").disabled = true;

      enviarRsvp({ accion: "voy", salida: salida.id, nombre: nombre, acompanantes: acompanantes })
        .then(function (rsvps) {
          estado = rsvps;
          guardarNombre(nombre);
          form.hidden = true;
          msg.textContent = "";
          pintarTodo(false);
        })
        .catch(function (err) {
          msg.classList.add("error");
          msg.textContent = "No se pudo guardar: " + err.message + ". Intenta otra vez.";
        })
        .then(function () { campo(nodo, "submit").disabled = false; });
    });

    btnNo.addEventListener("click", function () {
      var yo = nombreGuardado();
      if (!yo) return;
      btnNo.disabled = true;
      enviarRsvp({ accion: "novoy", salida: salida.id, nombre: yo })
        .then(function (rsvps) { estado = rsvps; pintarTodo(false); })
        .catch(function (err) {
          msg.classList.add("error");
          msg.textContent = "No se pudo quitar: " + err.message;
        })
        .then(function () { btnNo.disabled = false; });
    });

    refrescar();
  }

  // --- la orden de camisas -------------------------------------------------

  var ORDEN = cfg.orden && cfg.orden.activa ? cfg.orden : null;
  function $(id) { return document.getElementById(id); }

  /** Los ids de los combos que pidió este teléfono: sólo esos se pueden quitar desde aquí. */
  function misOrdenes() {
    try { return JSON.parse(localStorage.getItem(MIS_ORDENES_KEY) || "[]"); } catch (e) { return []; }
  }
  function guardarMisOrdenes(ids) {
    try { localStorage.setItem(MIS_ORDENES_KEY, JSON.stringify(ids)); } catch (e) { /* modo privado */ }
  }

  /** null = sin fecha todavía (se sigue aceptando). */
  function cierreOrden() {
    var p = ORDEN && ORDEN.cierre ? parseFecha(ORDEN.cierre) : null;
    return p ? p.fecha : null;
  }
  function ordenCerrada() {
    var c = cierreOrden();
    return !!(c && new Date() >= c);
  }

  function textoCierre() {
    var c = cierreOrden();
    if (!c) return "Pronto se decidirá la fecha de cierre.";
    if (ordenCerrada()) return "La orden cerró el " + cuandoEnPalabras(c, null, true) + ".";
    return "Cierra el " + cuandoEnPalabras(c, null, true) + " · " + cuentaRegresiva(c, new Date()).toLowerCase();
  }


  function opciones(sel, lista, vacio) {
    var o = document.createElement("option");
    o.value = "";
    o.textContent = vacio;
    sel.appendChild(o);
    lista.forEach(function (x) {
      var op = document.createElement("option");
      op.value = x;
      op.textContent = x;
      sel.appendChild(op);
    });
  }

  /** "Rosa melocotón" → "rosa-melocoton": el nombre del archivo de su foto. */
  function slug(texto) {
    return String(texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /** Un radio por color, cada uno con la foto de la camisa en ese color. */
  function montarColores() {
    var grid = $("orden-colores");
    var carpeta = ORDEN.fotosColores || "";
    (ORDEN.colores || []).forEach(function (nombre) {
      var label = document.createElement("label");
      label.className = "color";
      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "color";
      // Sin required: el globo del navegador saldría sobre un radio escondido.
      // El submit avisa en palabras si falta el color.
      radio.value = nombre;
      radio.addEventListener("change", function () {
        $("orden-color-elegido").textContent = nombre;
        var m = $("orden-msg");
        if (m.classList.contains("error")) { m.textContent = ""; m.classList.remove("error"); }
      });
      label.appendChild(radio);
      if (carpeta) {
        var img = document.createElement("img");
        img.src = carpeta + slug(nombre) + ".jpg";
        img.alt = "";
        img.loading = "lazy";
        img.width = 160;
        img.height = 240;
        label.appendChild(img);
      }
      var texto = document.createElement("span");
      texto.textContent = nombre;
      label.appendChild(texto);
      grid.appendChild(label);
    });
  }
  function colorElegido() {
    var r = $("orden-form").querySelector('input[name="color"]:checked');
    return r ? r.value : "";
  }
  function limpiarColor() {
    var r = $("orden-form").querySelector('input[name="color"]:checked');
    if (r) r.checked = false;
    $("orden-color-elegido").textContent = "toca uno";
  }

  function montarOrden() {
    var sec = $("orden");
    if (!ORDEN) { sec.hidden = true; return; }

    if (ORDEN.titulo) $("orden-title").textContent = ORDEN.titulo;
    if (ORDEN.flyer) { $("orden-flyer").src = ORDEN.flyer; $("orden-flyer-link").href = ORDEN.flyer; }
    $("orden-precio").textContent = ORDEN.precio || "";
    $("orden-pagos").textContent = ORDEN.pagos || "";
    if (ORDEN.notaPrecio) { $("orden-nota").textContent = ORDEN.notaPrecio; $("orden-nota").hidden = false; }
    var incluye = $("orden-incluye");
    (ORDEN.incluye || []).forEach(function (x) {
      var li = document.createElement("li");
      li.textContent = x;
      incluye.appendChild(li);
    });

    var form = $("orden-form");
    var selTalla = form.querySelector('select[name="talla"]');
    montarColores();
    opciones(selTalla, ORDEN.tallas || [], "Escoge tu size");

    var guia = $("orden-guia");
    (ORDEN.guiaTallas || []).forEach(function (g) {
      var tr = document.createElement("tr");
      [g.talla, g.pecho, g.cintura, g.estatura].forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      guia.appendChild(tr);
    });
    if (!guia.children.length) form.querySelector(".guia").hidden = true;

    // Las dos opciones de pago repiten lo que dice el config: "Completo ($42 estimado)" y
    // "2 pagos de $21 estimado". El "estimado" sale mientras haya notaPrecio en el config:
    // al dar el precio final se borra notaPrecio y la palabra se va sola.
    var est = ORDEN.notaPrecio ? " estimado" : "";
    if (ORDEN.precio) $("orden-pago-completo").textContent = "Completo (" + ORDEN.precio.replace(/ el combo$/i, "") + est + ")";
    if (ORDEN.pagos) $("orden-pago-dos").textContent = ORDEN.pagos.replace(/^o /i, "").replace(/^./, function (c) { return c.toUpperCase(); }) + est;

    $("orden-cierre").textContent = textoCierre();
    setInterval(function () {
      $("orden-cierre").textContent = textoCierre();
      refrescarOrden();
    }, 60000);

    sec.hidden = false;

    if (!RSVP_URL) {
      var off = $("orden-off");
      off.hidden = false;
      if (cfg.grupo && cfg.grupo.whatsapp) {
        off.textContent = "";
        var a = document.createElement("a");
        a.href = cfg.grupo.whatsapp;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Reserva el tuyo en el grupo";
        off.appendChild(a);
      }
      return;
    }

    $("orden-rsvp").hidden = false;
    var msg = $("orden-msg");
    var inputNombre = form.querySelector('input[name="nombre"]');

    $("orden-pedir").addEventListener("click", function () {
      form.hidden = false;
      avisar("");
      if (!inputNombre.value) inputNombre.value = nombreGuardado();
      // Con el nombre ya puesto no se enfoca nada: un color enfocado parece escogido.
      if (!inputNombre.value) inputNombre.focus();
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var nombre = inputNombre.value.trim();
      var color = colorElegido();
      if (!nombre || !selTalla.value) return;
      if (!color) {
        msg.classList.add("error");
        msg.textContent = "Escoge el color de la camisa.";
        $("orden-colores").scrollIntoView({ block: "center" });
        return;
      }
      if (ordenCerrada()) { refrescarOrden(); return; }
      var pago = (form.querySelector('input[name="pago"]:checked') || {}).value || "completo";

      msg.classList.remove("error");
      msg.textContent = "Mandando…";
      $("orden-enviar").disabled = true;

      enviar({ accion: "ordenar", nombre: nombre, color: color, talla: selTalla.value, pago: pago })
        .then(function (data) {
          ordenes = data.ordenes || [];
          guardarNombre(nombre);
          guardarMisOrdenes(misOrdenes().concat([data.id]));
          // El nombre se queda: quien pide otro combo para la pareja sólo cambia color y talla.
          limpiarColor();
          selTalla.value = "";
          form.hidden = true;
          msg.textContent = "";
          refrescarOrden();
          avisar("¡Pedido! Si quieres otro combo, toca «Pedir otro».");
        })
        .catch(function (err) {
          msg.classList.add("error");
          msg.textContent = "No se pudo guardar: " + err.message + ". Intenta otra vez.";
        })
        .then(function () { $("orden-enviar").disabled = false; });
    });
  }

  /** Un aviso fuera del formulario, que ya se cerró. "" lo borra. */
  function avisar(texto, esError) {
    var a = $("orden-aviso");
    if (!a) {
      a = document.createElement("p");
      a.id = "orden-aviso";
      a.className = "rsvp-msg";
      a.setAttribute("role", "status");
      $("orden-lista").before(a);
    }
    a.classList.toggle("error", !!esError);
    a.textContent = texto;
  }

  function refrescarOrden() {
    if (!ORDEN || !RSVP_URL) return;
    var mios = misOrdenes();
    var total = ordenes.length;
    $("orden-count").textContent =
      total === 0 ? "Nadie ha pedido todavía"
      : total === 1 ? "1 combo pedido"
      : total + " combos pedidos";

    var cerrada = ordenCerrada();
    var pedir = $("orden-pedir");
    var yaPedi = ordenes.some(function (o) { return mios.indexOf(o.id) !== -1; });
    pedir.hidden = cerrada;
    pedir.textContent = yaPedi ? "Pedir otro" : "Pedir";
    if (cerrada) $("orden-form").hidden = true;

    var lista = $("orden-lista");
    lista.textContent = "";
    ordenes.forEach(function (o) {
      var li = document.createElement("li");
      var quien = document.createElement("span");
      quien.className = "quien";
      quien.textContent = o.nombre;                       // nunca innerHTML
      var que = document.createElement("span");
      que.className = "que";
      que.textContent = o.color + " · " + o.talla;
      li.appendChild(quien);
      li.appendChild(que);
      if (!cerrada && mios.indexOf(o.id) !== -1) li.appendChild(botonQuitar(o));
      lista.appendChild(li);
    });
  }

  function botonQuitar(o) {
    var quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "quitar";
    quitar.textContent = "Quitar";
    quitar.setAttribute("aria-label", "Quitar mi pedido: " + o.color + ", " + o.talla);
    quitar.addEventListener("click", function () {
      quitar.disabled = true;
      enviar({ accion: "quitar-orden", id: o.id })
        .then(function (data) {
          ordenes = data.ordenes || [];
          guardarMisOrdenes(misOrdenes().filter(function (x) { return x !== o.id; }));
          refrescarOrden();
          avisar("Pedido quitado.");
        })
        .catch(function (err) {
          quitar.disabled = false;
          avisar("No se pudo quitar: " + err.message, true);
        });
    });
    return quitar;
  }

  // --- pintar la página ----------------------------------------------------

  function pintarTodo(primeraVez) {
    var ahora = new Date();
    var salidas = (cfg.salidas || [])
      .map(function (s) {
        var p = parseFecha(s.inicio);
        if (!p) return null;
        var fin = s.fin ? parseFecha(s.fin) : null;
        // Una acampada de tres días sigue siendo "próxima" hasta el último día.
        return { s: s, f: p.fecha, conHora: p.conHora, ultimo: fin ? fin.fecha : p.fecha };
      })
      .filter(function (x) { return x !== null; });

    var proximas = salidas
      .filter(function (x) { return mismoDiaOdespues(x.ultimo, ahora); })
      .sort(function (a, b) { return a.f - b.f; });
    var pasadas = salidas
      .filter(function (x) { return !mismoDiaOdespues(x.ultimo, ahora); })
      .sort(function (a, b) { return b.f - a.f; });

    var secNext = document.getElementById("next");
    var slotNext = document.getElementById("next-slot");
    var secVacio = document.getElementById("empty");
    var secUp = document.getElementById("upcoming");
    var slotUp = document.getElementById("upcoming-slot");
    var secPast = document.getElementById("past");
    var slotPast = document.getElementById("past-slot");

    slotNext.textContent = "";
    slotUp.textContent = "";
    slotPast.textContent = "";

    if (proximas.length) {
      slotNext.appendChild(pintarSalida(proximas[0].s, proximas[0].f, { proxima: true, sinHora: !proximas[0].conHora }));
      secNext.hidden = false;
      secVacio.hidden = true;
    } else {
      secNext.hidden = true;
      secVacio.hidden = false;
    }

    proximas.slice(1).forEach(function (x) {
      slotUp.appendChild(pintarSalida(x.s, x.f, { sinHora: !x.conHora }));
    });
    secUp.hidden = proximas.length < 2;

    pasadas.forEach(function (x) {
      var recuerdos = pintarRecuerdos(x.s);
      slotPast.appendChild(recuerdos ? pintarRecuerdo(x, recuerdos) : pintarPasada(x));
    });
    secPast.hidden = pasadas.length === 0;

    if (primeraVez) {
      var grupo = cfg.grupo || {};
      if (grupo.nombre) document.getElementById("grupo-nombre").textContent = grupo.nombre;
      if (grupo.lema) document.getElementById("grupo-lema").textContent = grupo.lema;
      if (grupo.logo) document.getElementById("logo").src = grupo.logo;
    }
  }

  pintarTodo(true);
  montarOrden();
  montarAtajos();
  irAlAncla();

  /** La barra de atajos: un botón por sección que se está enseñando. Se crea
   *  aquí y no en el HTML para que sólo salgan las secciones que existen hoy
   *  (sin orden activa no hay "Camisas") y para que el HTML viejo en caché no
   *  enseñe una barra sin código detrás. */
  function montarAtajos() {
    var secciones = [
      ["next", "Próxima"],
      ["orden", "Camisas"],
      ["upcoming", "Lo que viene"],
      ["past", "Recuerdos"],
    ].filter(function (x) {
      var el = document.getElementById(x[0]);
      return el && !el.hidden;
    });
    if (secciones.length < 2) return;   // una sola sección no necesita atajos

    var nav = document.createElement("nav");
    nav.className = "atajos";
    nav.setAttribute("aria-label", "Secciones de la página");
    var fila = document.createElement("div");
    fila.className = "atajos-fila";
    nav.appendChild(fila);

    var suave = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var enlaces = {};
    secciones.forEach(function (x) {
      var a = document.createElement("a");
      a.href = "#" + x[0];
      a.textContent = x[1];
      // Sin cambiar el #: si no, al recargar irAlAncla señalaría la sección.
      a.addEventListener("click", function (e) {
        e.preventDefault();
        document.getElementById(x[0]).scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
      });
      enlaces[x[0]] = a;
      fila.appendChild(a);
    });
    document.querySelector("main").before(nav);

    // Marca la sección que ocupa el centro de la pantalla.
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(enlaces).forEach(function (id) {
          if (id === en.target.id) enlaces[id].setAttribute("aria-current", "true");
          else enlaces[id].removeAttribute("aria-current");
        });
        // En el celular la fila se desliza: que el atajo marcado quede a la vista.
        var a = enlaces[en.target.id];
        fila.scrollTo({ left: a.offsetLeft - (fila.clientWidth - a.offsetWidth) / 2, behavior: suave ? "smooth" : "auto" });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    secciones.forEach(function (x) { obs.observe(document.getElementById(x[0])); });
  }

  /** Un enlace compartido termina en #<id>: lleva a esa tarjeta y la señala. */
  function irAlAncla() {
    var id = (location.hash || "").slice(1);
    if (!id) return;
    var tarjeta = document.getElementById(id);
    if (!tarjeta) return;
    if (id === "orden") tarjeta = tarjeta.querySelector(".orden-card");
    tarjeta.scrollIntoView({ block: "center" });
    tarjeta.classList.add("senalada");
  }

  // Las confirmaciones llegan después: la página ya se ve completa sin ellas.
  cargarDatos()
    .then(function (datos) {
      estado = datos.rsvps;
      ordenes = datos.ordenes;
      pintarTodo(false);
      refrescarOrden();
    })
    .catch(function () { /* sin lista; los botones siguen sirviendo */ refrescarOrden(); });

  }   // fin de arrancar()
})();
