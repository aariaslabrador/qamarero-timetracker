const { typeDigits } = require('./browser');

// El logo/avatar del local (arriba a la izquierda) es el acceso directo a
// la pantalla de Personal desde cualquier pantalla en la que aterrice el
// login (dashboard general o "Cuenta rápida"). Se identifica por su nombre
// accesible; coincidencia flexible (sin distinguir mayúsculas ni exigir
// texto exacto) porque aquí no hace falta precisión — solo es el punto de
// entrada, no hay riesgo de confundir un local con otro.
async function openPersonal(page, restaurantName) {
  try {
    await page.getByRole('button', { name: restaurantName }).click({ timeout: 15000 });
  } catch (err) {
    throw new Error(
      `No se encontró el botón del local "${restaurantName}" tras el login (el login sí funcionó). ` +
        'Comprueba en "Gestionar locales" que el campo "Nombre tal cual aparece en Q-POS al entrar" ' +
        'coincide con lo que ves en el logo de arriba a la izquierda al entrar a mano. ' +
        `Error técnico: ${err.message}`
    );
  }
  await page.getByPlaceholder('Buscar personal').waitFor({ timeout: 15000 });
}

// El buscador de Q-POS solo encuentra resultados con el nombre de pila
// suelto (ni el nombre completo "Angel Arias" ni el texto exacto de la
// tarjeta "Angel A." devuelven nada), así que se busca siempre así. Para
// el clic, en cambio, se usa `displayName` (el texto exacto de la tarjeta,
// obligatorio al crear el empleado) con coincidencia exacta, para no
// confundir a dos empleados que compartan nombre de pila.
async function selectEmployee(page, { name, displayName }) {
  const search = page.getByPlaceholder('Buscar personal');
  await search.waitFor();

  const firstName = name.trim().split(/\s+/)[0];
  await search.fill(firstName);

  if (displayName && displayName.trim()) {
    await page.getByText(displayName.trim(), { exact: true }).first().click();
  } else {
    await page.getByText(firstName, { exact: false }).first().click();
  }
}

async function waitForKeypad(page) {
  await page.getByRole('button', { name: '7', exact: true }).waitFor();
}

// Tras pulsar la tarjeta del empleado, la pantalla que aparece depende de
// si ya está en turno o no: "Fichar entrada" (con teclado) si está "Fuera
// de turno", o su ficha de detalle con "Fin de turno" si está "En turno".
// Se detecta cuál de las dos apareció en vez de asumirlo, para poder avisar
// con un mensaje claro si no cuadra con la acción pedida (p. ej. querer
// fichar salida de alguien que nunca fichó entrada).
async function detectShiftState(page, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.getByText('Fichar entrada').isVisible().catch(() => false)) return 'off';
    if (await page.getByText('Fin de turno').isVisible().catch(() => false)) return 'on';
    await page.waitForTimeout(300);
  }
  return null;
}

// Fichaje de un empleado. Asume que ya se ha hecho login() previamente.
// action: 'entrada' | 'salida'
async function fichar(page, { name, pin, action, restaurantName, displayName }) {
  await openPersonal(page, restaurantName);
  await selectEmployee(page, { name, displayName });

  const state = await detectShiftState(page);
  if (!state) {
    throw new Error(
      `No se pudo comprobar si ${name} está en turno (no apareció ni "Fichar entrada" ni "Fin de turno").`
    );
  }

  if (action === 'entrada') {
    if (state === 'on') {
      // Ya estaba fichado (a mano, o por un intento automático anterior):
      // no es un fallo, así que no hay nada que hacer ni que avisar.
      return { skipped: true, reason: `${name} ya estaba en turno` };
    }
    // Empleado "Fuera de turno": aparece el teclado "Fichar entrada" pidiendo
    // su PIN (se envía solo al 4º dígito).
    await waitForKeypad(page);
    await typeDigits(page, pin);
    // Confirmación: pantalla de detalle del empleado con el botón "Fin de turno".
    await page.getByText('Fin de turno').waitFor({ timeout: 15000 });
  } else if (action === 'salida') {
    if (state === 'off') {
      throw new Error(`${name} no está en turno; no se puede fichar salida hasta que fiche entrada.`);
    }
    // Empleado "En turno": pulsar "Fin de turno" vuelve a pedir su PIN para
    // confirmar la salida.
    await page.getByText('Fin de turno').click();
    await waitForKeypad(page);
    await typeDigits(page, pin);
  } else {
    throw new Error(`Acción desconocida: ${action}`);
  }

  return { skipped: false };
}

module.exports = { openPersonal, selectEmployee, fichar };
