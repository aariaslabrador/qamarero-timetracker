# Qamarero Timetracker

Panel web para automatizar el fichaje de entrada y salida del personal en
[pos.qamarero.com](https://pos.qamarero.com/) (Q-POS). Permite dar de alta y
baja empleados, y definir sus días de trabajo y horario de entrada/salida
desde el navegador. Un planificador interno comprueba cada minuto si algún
empleado tiene una entrada o salida programada y, si es así, abre un
navegador headless, entra en Q-POS y ficha por él.

## Cómo funciona

1. Con el teléfono y PIN de acceso general a Q-POS (`ACCESS_PHONE` /
   `ACCESS_PIN`), el script hace login en la app.
2. Entra en la sección **Personal**, busca al empleado por su nombre y pulsa
   su tarjeta.
3. Si el empleado está "Fuera de turno", introduce su PIN de 4 dígitos para
   **fichar entrada**.
4. Si está "En turno", pulsa **Fin de turno** y vuelve a introducir su PIN
   para **fichar salida**.

Los selectores usados están basados en el texto visible y el rol accesible
de los botones (no en clases CSS), porque la app usa Chakra UI + Emotion,
cuyas clases `css-xxxxx` se regeneran en cada despliegue y romperían el
script sin que la web haya cambiado realmente.

## Requisitos

- Node.js 18+
- Acceso a internet desde la máquina donde se ejecute (a `pos.qamarero.com`
  y a la descarga de Chromium de Playwright)

## Instalación

```bash
npm install
cp .env.example .env
```

Edita `.env`:

- `ACCESS_PHONE` / `ACCESS_PIN`: el teléfono y PIN de acceso general a Q-POS
  (el login inicial de la app, **no** el PIN de cada empleado).
- `WEB_ADMIN_USER` / `WEB_ADMIN_PASS`: usuario y contraseña para entrar a
  este panel (guarda los PINs de tus empleados, protégelo).
- `SESSION_SECRET`: cualquier cadena larga y aleatoria.
- `PORT`: puerto donde escucha el panel (por defecto 3000).
- `HEADLESS`: déjalo en `true` salvo que quieras ver el navegador mientras
  ficha (útil para depurar en tu propio ordenador).

`npm install` descarga automáticamente Chromium para Playwright
(`postinstall`). Si tu servidor no tiene las dependencias de sistema para
Chromium, instálalas con:

```bash
npx playwright install-deps chromium
```

## Uso

```bash
npm start
```

Abre `http://localhost:3000`, entra con `WEB_ADMIN_USER` / `WEB_ADMIN_PASS`
y desde el panel:

- **Añadir empleado**: nombre exactamente como aparece en Q-POS, su PIN de 4
  dígitos, días de trabajo y hora de entrada/salida.
- **Fichar entrada / Fichar salida**: dispara el fichaje al momento, útil
  para probar que todo funciona antes de dejarlo en automático.
- **Historial de fichajes**: muestra cada intento (automático o manual), si
  fue bien y, si falló, el motivo.
- Marca un empleado como "Pausado" (checkbox "activo" al editar) para que
  el planificador deje de ficharlo sin necesidad de borrarlo.

Mientras el proceso `npm start` esté corriendo, el planificador interno
dispara automáticamente la entrada y la salida de cada empleado activo a
las horas configuradas, cada día que le corresponda.

## Mantener el panel siempre activo

El fichaje automático solo funciona mientras el proceso Node esté vivo.
Para producción, usa un gestor de procesos, por ejemplo con
[pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/server.js --name qamarero-timetracker
pm2 save
pm2 startup
```

O un servicio `systemd` que ejecute `npm start` en este directorio y se
reinicie solo si el proceso cae.

## Datos y seguridad

- Los empleados, sus PINs y el historial de fichajes se guardan en
  `data/db.json` (no se sube al repositorio). Ese archivo contiene PINs en
  texto plano: restringe permisos del archivo y del servidor donde corra
  esta app.
- `.env` tampoco se sube al repositorio: nunca compartas ni subas tu
  `ACCESS_PHONE`, `ACCESS_PIN`, `WEB_ADMIN_USER` ni `WEB_ADMIN_PASS`.
- Si un fichaje falla, se guarda una captura de pantalla en
  `data/errors/` para poder ver qué ocurrió (por ejemplo, si la web cambió
  algo en su interfaz).

## Estructura del proyecto

```
src/
  server.js       Servidor Express: autenticación, API REST y planificador
  scheduler.js     Comprueba cada 20s si toca fichar a algún empleado
  runner.js        Lanza el navegador, hace login y ficha
  store.js         Persistencia en data/db.json (empleados, logs, ajustes)
  auth.js          Login del panel (usuario/contraseña + sesión)
  qpos/
    browser.js     Login en Q-POS (teclados numéricos de teléfono y PIN)
    personal.js     Navegación a Personal, búsqueda de empleado y fichaje
public/            Frontend (HTML/CSS/JS sin dependencias ni build)
```

## Limitaciones conocidas

- Si Q-POS cambia el texto de sus pantallas (p. ej. "Fichar entrada" o "Fin
  de turno"), los selectores del script dejarán de encontrar esos elementos
  y habrá que actualizarlos.
- El planificador vive en memoria: si el proceso se reinicia justo en el
  minuto exacto de un fichaje programado, existe una posibilidad remota de
  que se dispare dos veces.
