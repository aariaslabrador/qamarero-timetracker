const { typeDigits } = require('./browser');

async function openPersonal(page) {
  await page.getByText('PERSONAL', { exact: true }).click();
}

async function selectEmployee(page, name) {
  const search = page.getByPlaceholder('Buscar personal');
  await search.waitFor();
  await search.fill(name);
  await page.getByText(name, { exact: false }).first().click();
}

async function waitForKeypad(page) {
  await page.getByRole('button', { name: '7', exact: true }).waitFor();
}

// Fichaje de un empleado. Asume que ya se ha hecho login() previamente.
// action: 'entrada' | 'salida'
async function fichar(page, { name, pin, action }) {
  await openPersonal(page);
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
