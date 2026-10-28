const net = require('node:net');

function configureSecurity(app, env = process.env) {
  const production = env.NODE_ENV === 'production';
  const secret = env.SESSION_SECRET || '';
  if (secret.length < 32 || /cambia|dev-secret/i.test(secret)) {
    throw new Error('SESSION_SECRET debe ser un secreto aleatorio de al menos 32 caracteres.');
  }
  const proxies = (env.TRUSTED_PROXIES || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const proxy of proxies) {
    const [address, bits, extra] = proxy.split('/');
    const version = net.isIP(address);
    if (!version || extra || (bits !== undefined &&
      (!/^\d+$/.test(bits) || Number(bits) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXIES solo acepta direcciones IP o subredes CIDR explícitas.');
    }
    if (bits !== undefined && Number(bits) === 0) throw new Error('No confíes en todas las direcciones como proxy.');
  }
  const textoSaltos = (env.PROXY_SALTOS_CONFIABLES || '').trim();
  if (textoSaltos && !/^[1-3]$/.test(textoSaltos)) {
    throw new Error('PROXY_SALTOS_CONFIABLES debe ser un número entero entre 1 y 3.');
  }
  if (textoSaltos && proxies.length) {
    throw new Error('Configura TRUSTED_PROXIES o PROXY_SALTOS_CONFIABLES, no ambas.');
  }
  if (production && !textoSaltos && !proxies.length) {
    throw new Error('Producción requiere PROXY_SALTOS_CONFIABLES (por ejemplo 1 en Railway) o TRUSTED_PROXIES.');
  }
  // Con saltos, Express confía solo en los N saltos más cercanos y toma la IP del cliente
  // desde el extremo derecho de X-Forwarded-For, que añade el proxy de la plataforma.
  app.set('trust proxy', textoSaltos ? Number(textoSaltos) : (proxies.length ? proxies : false));
  if (production) {
    let url;
    try { url = new URL(env.PUBLIC_URL); } catch { throw new Error('PUBLIC_URL debe ser una URL HTTPS válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('PUBLIC_URL debe ser HTTPS y no debe contener credenciales.');
    }
  }
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (production && !req.secure) {
      return res.status(403).json({ error: 'Se requiere HTTPS.' });
    }
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  return {
    name: 'cafes.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  };
}

module.exports = configureSecurity;
