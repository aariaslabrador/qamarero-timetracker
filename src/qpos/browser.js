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

  // Tras el login la app puede aterrizar en distintas pantallas (el
  // dashboard general o directamente en "Cuenta rápida"), pero el enlace
  // "Mesas" de la barra superior está siempre presente en ambas: es la
  // señal fiable de que el login terminó bien, sin depender de si el
  // nombre del local está configurado correctamente (eso se comprueba
  // aparte, al intentar abrir Personal).
  try {
    await page.getByText('Mesas', { exact: true }).waitFor({ timeout: 15000 });
  } catch {
    throw new Error(
      'El login no llegó a completarse (no apareció la pantalla principal tras introducir el PIN). ' +
        'Revisa que el teléfono y el PIN de acceso de este local sean correctos.'
    );
  }
}

module.exports = { BASE_URL, clickDigit, typeDigits, login };
