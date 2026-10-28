const nodemailer = require('nodemailer');
const { correoValido } = require('./correo');

const ASUNTO = 'Confirma tu voto — Bebidas con Alma y Origen';
const URL_API_BREVO = 'https://api.brevo.com/v3/smtp/email';

function textoCodigo(code) {
  return `Tu código de verificación es ${code}. Es válido por 10 minutos y admite 5 intentos. No compartas este código. Si no solicitaste votar, ignora este correo.`;
}

// Envío por la API HTTPS de Brevo: necesario en hostings que bloquean SMTP (Railway Hobby).
function crearEnvioBrevo(env, hacerFetch) {
  const remitente = (env.CORREO_REMITENTE || env.SMTP_USER || '').trim();
  if (!correoValido(remitente)) {
    throw new Error('Configura CORREO_REMITENTE con el correo verificado como remitente en Brevo.');
  }
  const claveApi = env.BREVO_API_KEY.trim();
  return async (correo, code) => {
    if (!correoValido(correo)) throw new Error('Destinatario no válido.');
    const respuesta = await hacerFetch(URL_API_BREVO, {
      method: 'POST',
      headers: { 'api-key': claveApi, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Concurso de Cafés', email: remitente },
        to: [{ email: correo.trim() }],
        subject: ASUNTO,
        textContent: textoCodigo(code),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!respuesta.ok) {
      throw new Error(`Brevo rechazó el mensaje (HTTP ${respuesta.status}).`);
    }
  };
}

function createMailer(env = process.env, { fetch: hacerFetch = globalThis.fetch } = {}) {
  if (env.BREVO_API_KEY && env.BREVO_API_KEY.trim()) {
    return crearEnvioBrevo(env, hacerFetch);
  }
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('Configura BREVO_API_KEY, o SMTP_USER y SMTP_PASS con tu cuenta Gmail y contraseña de aplicación.');
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return async (correo, code) => {
    if (!correoValido(correo)) throw new Error('Destinatario no válido.');
    const result = await transport.sendMail({
      from: env.SMTP_USER,
      // Objeto de dirección: Nodemailer no vuelve a interpretar el texto como lista de destinatarios.
      to: { name: '', address: correo.trim() },
      subject: ASUNTO,
      text: textoCodigo(code),
    });
    if (!result.accepted.length) throw new Error('El proveedor no aceptó el mensaje.');
  };
}

module.exports = createMailer;
