/* «¿Quién va?»: reordena los hoteles para ese grupo y sella el primero
   («Recomendado para ustedes») y el segundo («Plan B»). El orden de cada
   hotel vive en el HTML (data-panas, data-parejas, data-familia); aquí sólo
   se aplica. data-familia="no" = no acepta menores: va al final, apagado.
   La elección queda en el enlace (#familia) para poder compartirla. */
(function () {
  "use strict";

  var POR_QUE = {
    panas: "Sólo adultos y ambiente de fiesta: el Chic es el que más pega.",
    parejas: "Sólo adultos y en la playa. Si quieren más calma, el Riu Palace.",
    familia: "Muy buenas notas, parque acuático y club para nenes. El Chic no acepta menores."
  };
  var SELLO = { 1: "Recomendado para ustedes", 2: "Plan B" };

  var botones = document.querySelectorAll(".quien-btn");
  var hoteles = document.querySelectorAll(".hotel");
  var porQue = document.getElementById("por-que");

  function aplicar(quien, mover) {
    if (!POR_QUE[quien]) quien = "panas";
    botones.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.quien === quien));
    });
    porQue.textContent = POR_QUE[quien];

    var lista = Array.prototype.slice.call(hoteles).map(function (h) {
      var lugar = h.dataset[quien];
      return { h: h, n: lugar === "no" ? 99 : Number(lugar) };
    });
    lista.sort(function (a, b) { return a.n - b.n; });

    var caja = document.getElementById("hoteles");
    lista.forEach(function (x) {
      caja.appendChild(x.h);          // el orden del DOM = el orden de lectura
      var sello = x.h.querySelector(".hotel-sello");
      var texto = SELLO[x.n];
      sello.hidden = !texto;
      sello.textContent = texto || "";
      x.h.classList.toggle("es-reco", x.n === 1);
      x.h.classList.toggle("es-b", x.n === 2);
      x.h.classList.toggle("no-aplica", x.n === 99);
    });

    if (mover) {
      try { history.replaceState(null, "", "#" + quien); } catch (e) { /* file:// y similares */ }
    }
  }

  botones.forEach(function (b) {
    b.addEventListener("click", function () { aplicar(b.dataset.quien, true); });
  });

  // Fotos: flechas ‹ › y contador «1 / 2». Deslizar con el dedo sigue igual.
  document.querySelectorAll(".hotel-fotos").forEach(function (tira) {
    var fotos = tira.querySelectorAll("img");
    if (fotos.length < 2) return;
    var caja = document.createElement("div");
    caja.className = "hotel-media";
    tira.parentNode.insertBefore(caja, tira);
    caja.appendChild(tira);

    function boton(clase, signo, etiqueta) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "foto-btn " + clase;
      b.textContent = signo;
      b.setAttribute("aria-label", etiqueta);
      caja.appendChild(b);
      return b;
    }
    var ant = boton("ant", "‹", "Foto anterior");
    var sig = boton("sig", "›", "Foto siguiente");
    var n = document.createElement("p");
    n.className = "foto-n";
    n.setAttribute("aria-hidden", "true");
    caja.appendChild(n);

    function actual() { return Math.round(tira.scrollLeft / tira.clientWidth); }
    function pintar() {
      var i = actual();
      n.textContent = (i + 1) + " / " + fotos.length;
      ant.hidden = i === 0;
      sig.hidden = i >= fotos.length - 1;
    }
    function ir(d) {
      var i = Math.max(0, Math.min(fotos.length - 1, actual() + d));
      fotos[i].loading = "eager";   // la siguiente puede estar sin cargar
      tira.scrollTo({ left: i * tira.clientWidth });
    }
    ant.addEventListener("click", function () { ir(-1); });
    sig.addEventListener("click", function () { ir(1); });
    tira.addEventListener("scroll", pintar, { passive: true });
    pintar();
  });
  aplicar(location.hash.slice(1), false);
})();
