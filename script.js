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

  var tpl = document.getElementById("tpl-salida");
  var estado = {};   // salidaId -> [{nombre, acompanantes}]

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

  function cargarRsvps() {
    if (!RSVP_URL) return Promise.resolve({});
    return fetch(RSVP_URL + (RSVP_URL.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(), {
      method: "GET",
      redirect: "follow",
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && data.rsvps) || {}; });
  }

  function enviarRsvp(cuerpo) {
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
        return (data.rsvps) || {};
      });
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
      var li = document.createElement("li");
      var fecha = document.createElement("span");
      fecha.className = "fecha";
      fecha.textContent = x.f.getDate() + " " + MESES[x.f.getMonth()] + " " + x.f.getFullYear();
      var que = document.createElement("span");
      que.className = "que";
      que.textContent = x.s.titulo || "Salida";
      li.appendChild(fecha);
      li.appendChild(que);
      slotPast.appendChild(li);
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
  irAlAncla();

  /** Un enlace compartido termina en #<id>: lleva a esa tarjeta y la señala. */
  function irAlAncla() {
    var id = (location.hash || "").slice(1);
    if (!id) return;
    var tarjeta = document.getElementById(id);
    if (!tarjeta) return;
    tarjeta.scrollIntoView({ block: "center" });
    tarjeta.classList.add("senalada");
  }

  // Las confirmaciones llegan después: la página ya se ve completa sin ellas.
  cargarRsvps()
    .then(function (rsvps) { estado = rsvps; pintarTodo(false); })
    .catch(function () { /* sin lista; los botones siguen sirviendo */ });

  }   // fin de arrancar()
})();
