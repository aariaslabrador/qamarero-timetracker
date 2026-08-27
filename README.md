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
- **Variación aleatoria (minutos)**: cada día ficha unos minutos antes o
  después de la hora programada (hasta el máximo que indiques, tope 15
  minutos), para que no fiche a la hora exacta todos los días. La hora real
  de ese día se calcula una sola vez y se mantiene fija el resto del día
  (como una persona real, no salta de un minuto a otro en cada fichaje).
- **Vacaciones / días libres**: añade uno o varios rangos de fechas por
  empleado; el planificador no ficha nada esos días aunque coincidan con un
  día de trabajo configurado.
- **Fichar entrada / Fichar salida**: dispara el fichaje al momento, útil
  para probar que todo funciona antes de dejarlo en automático.
- **Historial de fichajes**: muestra cada intento (automático o manual), si
  fue bien y, si falló, el motivo.
- Marca un empleado como "Pausado" (checkbox "activo" al editar) para que
  el planificador deje de ficharlo sin necesidad de borrarlo.

Mientras el proceso `npm start` esté corriendo, el planificador interno
dispara automáticamente la entrada y la salida de cada empleado activo a
las horas configuradas (con su variación aleatoria aplicada), cada día que
le corresponda y que no esté de vacaciones.

> La variación aleatoria está pensada para automatizar el fichaje de
> jornadas que **realmente** se cumplen tal cual —no para simular presencia
> que no es real—: el registro horario debe reflejar la hora real de
> entrada y salida de cada empleado.

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

## Publicar en un subdominio (VPS + nginx + HTTPS)

Pasos para dejarlo accesible en `https://admin.botavaracordoba.es` (o el
subdominio que uses) desde un VPS con nginx ya instalado.

### 1. DNS

En el panel de tu proveedor de dominio (Ginernet, o donde gestiones el DNS
de `botavaracordoba.es`), añade un registro:

```
Tipo: A
Nombre: admin
Valor: <IP pública de tu VPS>
TTL: por defecto
```

Comprueba que ha propagado antes de seguir:

```bash
dig +short admin.botavaracordoba.es
```

Debe devolver la IP de tu VPS (puede tardar de unos minutos a un par de
horas).

### 2. Clonar e instalar en el VPS

```bash
cd /var/www   # o la ruta que uses habitualmente
git clone <url-de-este-repositorio> qamarero-timetracker
cd qamarero-timetracker
npm install
npx playwright install-deps chromium   # instala las librerías de sistema que faltan
cp .env.example .env
nano .env
```

En `.env`, además de `ACCESS_PHONE`/`ACCESS_PIN`/`RESTAURANT_NAME` y las
credenciales del panel:

- `PORT=3000` (o el que prefieras; nginx apuntará a este puerto).
- `TRUST_PROXY=true` — imprescindible en producción detrás de nginx con
  HTTPS, si no el login no funcionará bien.

Prueba que arranca antes de seguir: `npm start`, `Ctrl+C` para pararlo.

### 3. Mantenerlo siempre encendido (systemd)

Sigue la **Opción B** de la sección anterior con la ruta real del VPS
(`/var/www/qamarero-timetracker` o la que hayas usado).

### 4. nginx

Hay una plantilla lista en `deploy/nginx-admin.botavaracordoba.es.conf`.

```bash
sudo cp deploy/nginx-admin.botavaracordoba.es.conf /etc/nginx/sites-available/admin.botavaracordoba.es
sudo ln -s /etc/nginx/sites-available/admin.botavaracordoba.es /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

En este punto, `http://admin.botavaracordoba.es` ya debería mostrar el
login (sin HTTPS todavía).

Si usas `ufw` u otro firewall, el puerto `3000` (o el que hayas puesto en
`PORT`) no necesita estar abierto al exterior — nginx lo alcanza por
`127.0.0.1`, solo hacen falta `80`/`443` abiertos hacia fuera.

### 5. HTTPS con certbot

```bash
sudo apt install certbot python3-certbot-nginx   # si no lo tienes ya
sudo certbot --nginx -d admin.botavaracordoba.es
```

Certbot reescribe automáticamente el archivo de nginx añadiendo el bloque
`server { listen 443 ssl; ... }` y la redirección de HTTP a HTTPS, y deja
programada la renovación automática del certificado.

Verifica que todo quedó bien:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I https://admin.botavaracordoba.es
```

### 6. Verificación final

- Abre `https://admin.botavaracordoba.es`, deberías ver el login con
  candado válido en el navegador.
- Entra con `WEB_ADMIN_USER`/`WEB_ADMIN_PASS` y confirma que la sesión se
  mantiene al navegar (si no, revisa que `TRUST_PROXY=true` esté puesto y
  reinicia el servicio: `sudo systemctl restart qamarero-timetracker`).
- Prueba un "Fichar entrada" manual para confirmar que el VPS también
  tiene salida a internet hacia `pos.qamarero.com`.

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
