// Notificaciones por Telegram. Si TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID no
// están configurados, no hace nada (para no romper el resto de la app si
// no se quiere usar esta función).
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: 'Telegram no está configurado (falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID)' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegram] Error al enviar notificación:', res.status, body);
      return { ok: false, error: `Telegram respondió ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[telegram] Error al enviar notificación:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendTelegramMessage };
