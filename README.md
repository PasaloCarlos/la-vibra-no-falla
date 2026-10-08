# La vibra no falla

Calendario de salidas de **Vibra Extrema**: qué viene, dónde es y quién va.

Sitio estático — HTML, CSS y un archivo de JavaScript, sin build ni dependencias.
Se sirve tal cual desde GitHub Pages. Las confirmaciones se guardan en un Google
Sheet del grupo a través de un Apps Script.

```
index.html           la página
styles.css           estilos (azul y verde del logo, primero teléfono)
script.js            pinta las salidas, la cuenta regresiva y las confirmaciones
events.config.js     ← LAS SALIDAS VIVEN AQUÍ
apps-script/Code.gs  lo que se pega dentro del Google Sheet
assets/logo.jpg      el logo
```

---

## Añadir una salida

Edita **`events.config.js`** y añade un objeto al arreglo `salidas`:

```js
{
  id: "carite-2026-12",            // único y PARA SIEMPRE: amarra las confirmaciones
  titulo: "Acampada en Carite",
  inicio: "2026-12-13T15:00",      // hora de Puerto Rico
  lugar: "Bosque de Carite, Guavate",
  mapa: "https://maps.app.goo.gl/...",   // o null
  punto: "Salimos del Walmart de Cayey a las 2:00 PM",  // o null
  descripcion: "Noche de fogata y casetas.",
  llevar: ["Caseta", "Saco de dormir", "Linterna"],      // [] si no hay nada
  costo: 12,                       // 0 = gratis
  dificultad: "suave",             // "suave" | "media" | "fuerte" | null
  cupo: 20                         // o null
}
```

Guarda, haz commit y empuja. GitHub Pages republica solo en un par de minutos.
Se puede hacer desde el celular con el editor web de GitHub.

**El `id` no se cambia nunca.** Es la llave con la que el Sheet guarda quién va;
si lo cambias, las confirmaciones de esa salida quedan huérfanas.

Las salidas que ya pasaron **no se borran**: la página las mueve sola a *Ya
vibramos* cuando pasa su día. Una salida sigue apareciendo como próxima durante
todo su propio día, así que la de las 7 AM no desaparece a las 8.

---

## Montar las confirmaciones (una sola vez)

1. Crea un Google Sheet nuevo. Llámalo, por ejemplo, **Vibra Extrema — confirmaciones**.
2. Dentro del Sheet: **Extensiones → Apps Script**.
3. Borra lo que haya y pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda.
4. **Implementar → Nueva implementación**, tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
5. Autoriza cuando Google lo pida (sale un aviso de "app no verificada" porque
   el script es tuyo: *Configuración avanzada → Ir a (nombre)*).
6. Copia la **URL de la aplicación web** (termina en `/exec`) y pégala en
   `events.config.js`:

```js
rsvp: {
  url: "https://script.google.com/macros/s/AKfy.../exec",
  maxAcompanantes: 3,
}
```

Listo. Cada confirmación es una fila en la pestaña `RSVPs`:
`Fecha | Salida | Nombre | Acompañantes`.

- Borrar una fila a mano en el Sheet la quita de la página.
- Confirmar dos veces con el mismo nombre **actualiza** la fila, no la duplica.
- *Ya no voy* borra la fila.

**Si cambias el código del script**, hay que hacer *Implementar → Gestionar
implementaciones → editar → Versión nueva*. Si no, Google sigue sirviendo la
versión vieja.

### Lo que esto no es

La URL del web app está en el código del sitio, así que cualquiera que mire el
código fuente puede escribir en la hoja. Para un grupo de amigos eso está bien,
y el script limita el nombre a 40 caracteres, los acompañantes a 5 y la hoja a
5.000 filas. No pongas ahí nada que no quieras que se vea, y si alguien escribe
boberías, borra la fila.

Tampoco hay cuentas: la gente escribe su nombre. La lista es tan honesta como el
grupo.

---

## Mientras no haya Sheet

Con `rsvp.url` vacío la página funciona igual, sin lista de asistencia. Si pones
el enlace de invitación del grupo en `grupo.whatsapp`, cada salida muestra
*Avisa en el grupo que vas* en vez del botón.

---

## Publicar en GitHub Pages

1. Sube el repo a GitHub.
2. **Settings → Pages**: *Source* = **Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
3. La página queda en `https://<usuario>.github.io/la-vibra-no-falla/`.

Para verla localmente basta con abrir `index.html` en el navegador. Las
confirmaciones también funcionan desde el archivo local, porque Apps Script
responde a cualquier origen.

---

## Detalles que importan si editas el código

- Los nombres vienen de un endpoint público y se pintan con `textContent`,
  nunca con `innerHTML`. No lo cambies: es lo único que separa un nombre
  gracioso de un script ajeno corriendo en la página de todos.
- El POST sale como `text/plain` a propósito. Con `application/json` el
  navegador manda primero un preflight que Apps Script no contesta, y la
  confirmación falla sin decir por qué.
- La página se pinta completa antes de que lleguen las confirmaciones. Si el
  Sheet no responde, las salidas se ven igual.
