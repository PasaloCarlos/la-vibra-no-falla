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

  function enlaceWhatsAppOrden() {
    var lineas = [ORDEN.titulo || "Orden de camisas"];
    if (ORDEN.precio) lineas.push(ORDEN.precio + (ORDEN.pagos ? " " + ORDEN.pagos : ""));
    (ORDEN.incluye || []).forEach(function (x) { lineas.push("• " + x); });
    lineas.push(textoCierre());
    lineas.push(enlacePagina("orden"));
    return "https://wa.me/?text=" + encodeURIComponent(lineas.join("\n"));
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

  function montarOrden() {
    var sec = $("orden");
    if (!ORDEN) { sec.hidden = true; return; }

    if (ORDEN.titulo) $("orden-title").textContent = ORDEN.titulo;
    if (ORDEN.flyer) { $("orden-flyer").src = ORDEN.flyer; $("orden-flyer-link").href = ORDEN.flyer; }
    $("orden-precio").textContent = ORDEN.precio || "";
    $("orden-pagos").textContent = ORDEN.pagos || "";
    var incluye = $("orden-incluye");
    (ORDEN.incluye || []).forEach(function (x) {
      var li = document.createElement("li");
      li.textContent = x;
      incluye.appendChild(li);
    });

    var form = $("orden-form");
    var selColor = form.querySelector('select[name="color"]');
    var selTalla = form.querySelector('select[name="talla"]');
    opciones(selColor, ORDEN.colores || [], "Escoge un color");
    opciones(selTalla, ORDEN.tallas || [], "Escoge tu talla");

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

    // Las dos opciones de pago repiten lo que dice el config: "Completo ($32)" y "2 pagos de $16".
    if (ORDEN.precio) $("orden-pago-completo").textContent = "Completo (" + ORDEN.precio.replace(/ el combo$/i, "") + ")";
    if (ORDEN.pagos) $("orden-pago-dos").textContent = ORDEN.pagos.replace(/^o /i, "").replace(/^./, function (c) { return c.toUpperCase(); });

    var compartir = $("orden-share");
    compartir.href = enlaceWhatsAppOrden();
    compartir.hidden = false;

    $("orden-cierre").textContent = textoCierre();
    setInterval(function () {
      $("orden-cierre").textContent = textoCierre();
      compartir.href = enlaceWhatsAppOrden();
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
      (inputNombre.value ? selColor : inputNombre).focus();
    });

    $("orden-cancelar").addEventListener("click", function () {
      form.hidden = true;
      msg.textContent = "";
      msg.classList.remove("error");
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var nombre = inputNombre.value.trim();
      if (!nombre || !selColor.value || !selTalla.value) return;
      if (ordenCerrada()) { refrescarOrden(); return; }
      var pago = (form.querySelector('input[name="pago"]:checked') || {}).value || "completo";

      msg.classList.remove("error");
      msg.textContent = "Mandando…";
      $("orden-enviar").disabled = true;

      enviar({ accion: "ordenar", nombre: nombre, color: selColor.value, talla: selTalla.value, pago: pago })
        .then(function (data) {
          ordenes = data.ordenes || [];
          guardarNombre(nombre);
          guardarMisOrdenes(misOrdenes().concat([data.id]));
          // El nombre se queda: quien pide otro combo para la pareja sólo cambia color y talla.
          selColor.value = "";
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
    pedir.textContent = yaPedi ? "Pedir otro" : "Pedir el mío";
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
  montarOrden();
  irAlAncla();

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
