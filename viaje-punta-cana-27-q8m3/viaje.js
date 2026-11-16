/* Fotos de cada hotel: flechas ‹ › y contador «1 / 2». Deslizar con el dedo sigue igual.
   El orden de los hoteles y los sellos «Recomendado» y «Plan B» van escritos en el HTML. */
(function () {
  "use strict";

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
})();
