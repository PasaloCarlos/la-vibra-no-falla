// events.config.js — loaded as a classic <script>; assigns to window.vibraConfig.
// This is the only file you need to touch to add, edit or retire a salida.
// GitHub Pages redeploys on its own once the commit lands on main.

window.vibraConfig = {
  grupo: {
    nombre: "Vibra Extrema",
    lema: "La vibra nunca falla",
    logo: "assets/logo-vibra.jpg",
    // Opcional: el enlace de invitación del grupo de WhatsApp. Si lo dejas en
    // null, el botón de WhatsApp no aparece.
    whatsapp: null,
  },

  rsvp: {
    // Pega aquí la URL del web app de Apps Script (termina en /exec).
    // Mientras esté vacía, la página funciona igual pero sin lista de asistencia:
    // cada salida muestra "Confirmaciones por WhatsApp" en vez del botón Voy.
    url: "https://script.google.com/macros/s/AKfycbyI4Qzmrg05sICqaHjl0kdhGbwfwaVm3elssnqkhF3KAcl1em2lN_Wdy-cpV3WTf_gyQw/exec",
    // Cuántos acompañantes puede traer una persona (0 desactiva el campo).
    maxAcompanantes: 0,
  },

  // ---------------------------------------------------------------------------
  // ORDEN DE CAMISAS. Los pedidos van a la pestaña "Ordenes" del mismo Sheet
  // (usa la misma URL de rsvp). Para quitar la sección: activa: false.
  //
  //   cierre   "YYYY-MM-DDTHH:MM" → la página cuenta hasta ahí y a esa hora
  //            deja de aceptar pedidos. null → "Pronto se decidirá la fecha
  //            de cierre" y se sigue aceptando.
  //   colores  y tallas son lo que sale en el formulario. Si un color se agota,
  //            bórralo de la lista: los pedidos que ya lo tenían no cambian.
  // ---------------------------------------------------------------------------
  orden: {
    activa: true,
    titulo: "Orden de camisas y más",
    flyer: "assets/orden-camisas-estimado.jpg",
    // Precio ESTIMADO: la suma en Temu del 27 oct (camisa $14.81 + vaso $18.36
    // + taza $9.00, envío gratis = $42.17). El final se da al cerrar las reservas.
    precio: "$42 el combo",
    pagos: "o 2 pagos de $21",
    notaPrecio: "Precio estimado según Temu hoy, con envío. El precio final se da cuando cierren las reservas, antes de pagar.",
    incluye: [
      "Camisa dry fit para el sol, con capucha y máscara",
      "Logo al frente (pecho izquierdo) y completo en la espalda",
      "Vaso de 20 onzas con el logo",
      "Taza de acero con mosquetón y el logo",
    ],
    cierre: null,
    tallas: ["S", "M", "L", "XL", "XXL"],
    // Tallas de EE.UU., unisex, según el suplidor (pulgadas y pies).
    guiaTallas: [
      { talla: "S", pecho: "36–38", cintura: "31–32", estatura: "5'7\"–5'9\"" },
      { talla: "M", pecho: "38–39", cintura: "32–34", estatura: "5'9\"–5'11\"" },
      { talla: "L", pecho: "39–41", cintura: "34–36", estatura: "5'11\"–6'1\"" },
      { talla: "XL", pecho: "41–43", cintura: "36–38", estatura: "6'1\"–6'3\"" },
      { talla: "XXL", pecho: "43–45", cintura: "38–40", estatura: "6'1\"–6'3\"" },
    ],
    // Cada color enseña su foto: assets/colores/<nombre en minúsculas, sin
    // acentos, con guiones>.jpg ("Rosa melocotón" → rosa-melocoton.jpg).
    // Un color nuevo necesita su foto ahí; sin foto sale sólo el nombre.
    fotosColores: "assets/colores/",
    colores: [
      "Azul hielo", "Azul lago", "Azul aciano", "Azul turquesa", "Azul marino",
      "Verde salvia", "Verde manzana claro", "Verde fluorescente", "Verde pasto",
      "Verde helecho", "Verde oscuro", "Amarillo brillante", "Amarillo mostaza suave",
      "Naranja brillante", "Albaricoque suave", "Rosa melocotón", "Rojo", "Borgoña",
      "Taro púrpura", "Uva morada", "Blanco", "Blanquecino", "Gris glaciar",
      "Gris oscuro", "Negro",
    ],
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
  //   mapa        pin de Google Maps (o null). Ya no se enseña en la página:
  //               sólo viaja dentro del mensaje de "Compartir por WhatsApp"
  //   punto       dónde y a qué hora se encuentran (o null)
  //   descripcion una o dos líneas de qué es la vuelta
  //   foto        opcional: el flyer, en assets/salidas/ (sale completo en la tarjeta)
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
      mapa: null,                            // ← pin, sólo para el mensaje de WhatsApp
      punto: null,                           // ← dónde y a qué hora se encuentran
      descripcion: "",
      llevar: [],
      costo: null,                           // ← ponlo cuando se sepa
      dificultad: null,
      cupo: null,
    },
    {
      id: "cumple-olga-2026-10-17",
      titulo: "Cumpleaños 80 de Olga",
      inicio: "2026-10-17T14:00",
      lugar: "Naguabo",
      mapa: null,                            // ← pin, sólo para el mensaje de WhatsApp
      punto: null,
      descripcion: "De 2 PM en adelante.",
      llevar: ["Instrumentos"],
      costo: null,
      dificultad: null,
      cupo: null,
    },
    {
      id: "camping-villalba-2026-10",
      titulo: "Camping en El Yerta",
      inicio: "2026-10-23",
      fin: "2026-10-25",
      lugar: "El Yerta, Villalba",
      mapa: null,                            // ← pin, sólo para el mensaje de WhatsApp
      punto: null,                           // ← dónde y a qué hora se encuentran
      descripcion:
        "Se paga el mismo día. Cerca de la fecha se hace una compra para dividirla entre todos.",
      llevar: [],
      costo: "$25 por noche",
      dificultad: null,
      cupo: null,
    },
    {
      id: "navidad-criolla-caguas-2026-11-27",
      titulo: "Encendido de la Navidad Criolla en Caguas",
      inicio: "2026-11-27T17:00",
      lugar: "Caguas",
      mapa: null,                            // ← pin, sólo para el mensaje de WhatsApp
      punto: null,                           // ← dónde y a qué hora se encuentran
      descripcion:
        "3 tarimas con música en vivo: La Sonora Ponceña, Elvis Crespo, Andrés Jiménez, Danny Rivera, Sergio Vargas, Maelo Ruiz, Hermes Croatto, Giselle y más.",
      foto: "assets/salidas/navidad-criolla-caguas-2026.jpg",
      llevar: [],
      costo: null,                           // ← el post del municipio no dice precio
      dificultad: null,
      cupo: null,
    },
  ],
};
