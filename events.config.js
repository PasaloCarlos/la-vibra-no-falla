// events.config.js — loaded as a classic <script>; assigns to window.vibraConfig.
// This is the only file you need to touch to add, edit or retire a salida.
// GitHub Pages redeploys on its own once the commit lands on main.

window.vibraConfig = {
  grupo: {
    nombre: "Vibra Extrema",
    lema: "La vibra nunca falla",
    logo: "assets/logo.jpg",
    // Opcional: el enlace de invitación del grupo de WhatsApp. Si lo dejas en
    // null, el botón de WhatsApp no aparece.
    whatsapp: null,
  },

  rsvp: {
    // Pega aquí la URL del web app de Apps Script (termina en /exec).
    // Mientras esté vacía, la página funciona igual pero sin lista de asistencia:
    // cada salida muestra "Confirmaciones por WhatsApp" en vez del botón Voy.
    url: "",
    // Cuántos acompañantes puede traer una persona (0 desactiva el campo).
    maxAcompanantes: 3,
  },

  // ---------------------------------------------------------------------------
  // SALIDAS. Campos:
  //
  //   id          texto corto y único; NO lo cambies después de publicar,
  //               porque es lo que amarra las confirmaciones en el Sheet
  //   titulo      cómo se llama la salida
  //   inicio      "YYYY-MM-DDTHH:MM" con hora, o "YYYY-MM-DD" si todavía no se
  //               sabe (la página escribe "Hora por confirmar")
  //   fin         último día, sólo para salidas de varios días; si no, omítelo
  //   lugar       nombre del sitio
  //   mapa        pin de Google Maps (o null)
  //   punto       dónde y a qué hora se encuentran (o null)
  //   descripcion una o dos líneas de qué es la vuelta
  //   llevar      lista de cosas; [] si no hay nada que traer
  //   costo       número (25 → "$25", 0 → "Gratis") o texto ("$25 por noche")
  //   dificultad  "suave" | "media" | "fuerte"  (o null para no mostrarla)
  //   cupo        número máximo de personas, o null si no hay límite
  //
  // Las salidas que ya pasaron NO se borran: la página las mueve sola a
  // "Ya vibramos" cuando pasa su último día.
  // ---------------------------------------------------------------------------
  salidas: [
    {
      id: "tito-rojas-2026-10-11",
      titulo: "Festival de Tito Rojas",
      inicio: "2026-10-11",
      lugar: null,                           // ← pon el sitio
      mapa: null,                            // ← pon el pin
      punto: null,                           // ← dónde y a qué hora se encuentran
      descripcion: "",
      llevar: [],
      costo: null,                           // ← ponlo cuando se sepa
      dificultad: null,
      cupo: null,
    },
    {
      id: "camping-villalba-2026-10",
      titulo: "Camping en El Yerta",
      inicio: "2026-10-23",
      fin: "2026-10-25",
      lugar: "El Yerta, Villalba",
      mapa: null,                            // ← pon el pin
      punto: null,                           // ← dónde y a qué hora se encuentran
      descripcion:
        "Se paga el mismo día. Cerca de la fecha se hace una compra para dividirla entre todos.",
      llevar: [],
      costo: "$25 por noche",
      dificultad: null,
      cupo: null,
    },
  ],
};
