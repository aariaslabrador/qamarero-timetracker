const { typeDigits } = require('./browser');

// El logo/avatar del local (arriba a la izquierda) es el acceso directo a
// la pantalla de Personal desde cualquier pantalla en la que aterrice el
// login (dashboard general o "Cuenta rápida").
async function openPersonal(page, restaurantName) {
  await page.getByRole('button', { name: restaurantName }).click();
  await page.getByPlaceholder('Buscar personal').waitFor({ timeout: 15000 });
}

// El buscador de Q-POS compara contra el nombre abreviado que se muestra en
// la tarjeta (p. ej. "Angel A." aunque el nombre completo guardado sea
// "Angel Arias"), así que buscar con el nombre completo no encuentra nada.
// `displayName` es el texto exacto de esa tarjeta (obligatorio al crear el
// empleado): se busca y se hace clic con coincidencia exacta sobre él, así
// nunca hay confusión aunque dos empleados compartan nombre de pila.
async function selectEmployee(page, { name, displayName }) {
  const search = page.getByPlaceholder('Buscar personal');
  await search.waitFor();

  const term = (displayName && displayName.trim()) || name.trim().split(/\s+/)[0];
  const exact = Boolean(displayName && displayName.trim());

  await search.fill(term);
  await page.getByText(term, { exact }).first().click();
}

async function waitForKeypad(page) {
  await page.getByRole('button', { name: '7', exact: true }).waitFor();
}

// Fichaje de un empleado. Asume que ya se ha hecho login() previamente.
// action: 'entrada' | 'salida'
async function fichar(page, { name, pin, action, restaurantName, displayName }) {
  await openPersonal(page, restaurantName);
  await selectEmployee(page, { name, displayName });

  if (action === 'entrada') {
    // Empleado "Fuera de turno": al pulsar su tarjeta aparece directamente
    // el teclado "Fichar entrada" pidiendo su PIN (se envía solo al 4º dígito).
    await page.getByText('Fichar entrada').waitFor();
    await waitForKeypad(page);
    await typeDigits(page, pin);
    // Confirmación: pantalla de detalle del empleado con el botón "Fin de turno".
    await page.getByText('Fin de turno').waitFor({ timeout: 15000 });
  } else if (action === 'salida') {
    // Empleado "En turno": al pulsar su tarjeta se abre su pantalla de detalle
    // directamente (sin PIN). Hay que pulsar "Fin de turno", que vuelve a
    // pedir el PIN del empleado para confirmar la salida.
    await page.getByText('Fin de turno').waitFor();
    await page.getByText('Fin de turno').click();
    await waitForKeypad(page);
    await typeDigits(page, pin);
  } else {
    throw new Error(`Acción desconocida: ${action}`);
  }
}

module.exports = { openPersonal, selectEmployee, fichar };
