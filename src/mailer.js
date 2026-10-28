const nodemailer = require('nodemailer');

function createMailer(env = process.env) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('Configura SMTP_USER y SMTP_PASS con tu cuenta Gmail y contraseña de aplicación.');
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
    const result = await transport.sendMail({
      from: env.SMTP_USER,
      to: correo,
      subject: 'Confirma tu voto — Bebidas con Alma y Origen',
      text: `Tu código de verificación es ${code}. Es válido por 10 minutos y admite 5 intentos. No compartas este código. Si no solicitaste votar, ignora este correo.`,
    });
    if (!result.accepted.length) throw new Error('El proveedor no aceptó el mensaje.');
  };
}

module.exports = createMailer;
