const { typeDigits } = require('./browser');

// El logo/avatar del local (arriba a la izquierda) es el acceso directo a
// la pantalla de Personal desde cualquier pantalla en la que aterrice el
// login (dashboard general o "Cuenta rápida").
async function openPersonal(page, restaurantName) {
  await page.getByRole('button', { name: restaurantName }).click();
  await page.getByPlaceholder('Buscar personal').waitFor({ timeout: 15000 });
}

async function selectEmployee(page, name) {
  const search = page.getByPlaceholder('Buscar personal');
  await search.waitFor();

  // El buscador de Q-POS compara contra el nombre abreviado que se muestra
  // en la tarjeta (p. ej. "Angel A." aunque el nombre completo guardado sea
  // "Angel Arias"), así que buscar con el nombre completo no encuentra
  // nada. Se busca y se hace clic solo por el nombre de pila.
  const firstName = name.trim().split(/\s+/)[0];
  await search.fill(firstName);
  await page.getByText(firstName, { exact: false }).first().click();
}

async function waitForKeypad(page) {
  await page.getByRole('button', { name: '7', exact: true }).waitFor();
}

// Fichaje de un empleado. Asume que ya se ha hecho login() previamente.
// action: 'entrada' | 'salida'
async function fichar(page, { name, pin, action, restaurantName }) {
  await openPersonal(page, restaurantName);
  await selectEmployee(page, name);

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
