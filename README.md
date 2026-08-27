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
2. Pulsa el logo del local (arriba a la izquierda, identificado por
   `RESTAURANT_NAME`) para entrar directamente en la pantalla de
   **Personal**, busca al empleado por su nombre y pulsa su tarjeta.
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
- `RESTAURANT_NAME`: el nombre exacto de tu local tal cual aparece en el
  logo de arriba a la izquierda en Q-POS (por ejemplo `Botavara`).
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

- **Añadir empleado**: su nombre completo, el nombre **exacto** tal cual
  aparece en su tarjeta dentro de Q-POS (p. ej. "Angel A.", con mayúsculas y
  puntos incluidos — es lo que el script usa para encontrarlo sin
  confundirlo con otro empleado), su PIN de 4 dígitos, días de trabajo y
  hora de entrada/salida.
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

El fichaje automático solo funciona mientras el proceso Node esté vivo, así
que en producción necesitas algo que lo mantenga arrancado y lo reinicie
si se cae. Elige una de las dos opciones:

### Opción A: pm2

Ya incluye `ecosystem.config.js` en la raíz del proyecto.

```bash
npm install -g pm2
cd /ruta/a/qamarero-timetracker
pm2 start ecosystem.config.js
pm2 save        # guarda la lista de procesos
pm2 startup     # te da el comando para que pm2 arranque solo al reiniciar el servidor
```

Comandos útiles: `pm2 logs qamarero-timetracker`, `pm2 restart
qamarero-timetracker`, `pm2 stop qamarero-timetracker`.

### Opción B: systemd

Hay una plantilla en `deploy/qamarero-timetracker.service`.

```bash
# 1. Copia la plantilla y edítala: pon el usuario del sistema y la ruta real
sudo cp deploy/qamarero-timetracker.service /etc/systemd/system/
sudo nano /etc/systemd/system/qamarero-timetracker.service
#   User=tu_usuario
#   WorkingDirectory=/ruta/real/a/qamarero-timetracker

# 2. Activa y arranca el servicio
sudo systemctl daemon-reload
sudo systemctl enable --now qamarero-timetracker

# 3. Comprobar que corre y ver logs
sudo systemctl status qamarero-timetracker
sudo journalctl -u qamarero-timetracker -f
```

Con `enable` el servicio arrancará solo cada vez que se reinicie el
servidor, y `Restart=on-failure` hace que se reinicie solo si el proceso
se cae.

En ambos casos, recuerda que `.env` debe existir en la carpeta del
proyecto (no se sube al repositorio) y que la primera vez conviene lanzar
`npm start` a mano para comprobar que todo arranca bien antes de dejarlo
en manos de pm2/systemd.

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
