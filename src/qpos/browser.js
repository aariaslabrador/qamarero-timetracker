const BASE_URL = 'https://pos.qamarero.com/';

// Pulsa un dígito en cualquiera de los teclados numéricos de la app
// (teléfono, PIN de acceso, PIN de empleado). Se usa el rol accesible
// "button" con el texto visible del dígito en vez de clases CSS: en esta
// app (Chakra UI + Emotion) las clases "css-xxxxx" se regeneran en cada
// despliegue, así que el texto/rol accesible es el selector estable a
// largo plazo.
async function clickDigit(page, digit) {
  await page.getByRole('button', { name: digit, exact: true }).click();
  await page.waitForTimeout(150);
}

async function typeDigits(page, value) {
  for (const digit of String(value)) {
    await clickDigit(page, digit);
  }
}

async function login(page, phone, pin) {
  await page.goto(BASE_URL);

  await page.getByText('Introduce tu teléfono').waitFor();
  await typeDigits(page, phone);
  await page.getByRole('button', { name: 'Ok', exact: true }).click();

  await page.getByText('Introduce el PIN').waitFor();
  await typeDigits(page, pin);

  // El dashboard general muestra la tarjeta "CUENTAS" al terminar el login.
  await page.getByText('CUENTAS', { exact: true }).first().waitFor({ timeout: 15000 });
}

module.exports = { BASE_URL, clickDigit, typeDigits, login };
