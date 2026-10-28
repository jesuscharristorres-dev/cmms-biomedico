// server.js
// Servidor Node.js standalone (Express) para desplegar el CMMS Biomédico fuera de Vercel —
// usa los mismos handlers de api/*.js SIN reescribirlos, como un proceso permanente (pensado
// para pm2/systemd detrás de Nginx/Caddy; ver el plan de migración). Nada de lib/*.js ni de
// api/*.js cambia: esto solo reemplaza el enrutamiento que antes hacía Vercel.
//
// Lo que hace, para quedar equivalente al vercel.json actual:
//   1. Parsea JSON en el body (Vercel lo hacía automáticamente; Express necesita express.json()).
//   2. Expone cada api/<nombre>.js en /api/<nombre>, para todos los métodos — igual que Vercel,
//      que convierte cada archivo de api/ en una ruta pública.
//   3. Replica las "rewrites" de vercel.json (logout, empresas, usuarios, admin/sin-empresa)
//      como rutas Express que inyectan los mismos query params que el rewrite original.
//   4. Replica los "headers" de seguridad de vercel.json en toda respuesta.
//   5. Sirve el build de Vite (dist/) como archivos estáticos, con fallback a index.html.
//
// IMPORTANTE para quien configure Nginx/Caddy delante de este proceso: deben reenviar
// `X-Forwarded-Proto: https` y `X-Forwarded-For` con la IP real del cliente — lib/auth.js los
// usa para decidir el flag "Secure" de la cookie de sesión y el límite de intentos de login
// por IP. Sin esos dos headers, las cookies de sesión no llevarían "Secure" y el bloqueo por
// fuerza bruta contaría todas las peticiones como si vinieran de la misma IP (la del proxy).

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import admin from './api/admin.js';
import capacitaciones from './api/capacitaciones.js';
import checklistDotacion from './api/checklist-dotacion.js';
import equipos from './api/equipos.js';
import formatoTemperaturaHumedad from './api/formato-temperatura-humedad.js';
import limpiezaDesinfeccion from './api/limpieza-desinfeccion.js';
import limpiezaPlantillas from './api/limpieza-plantillas.js';
import login from './api/login.js';
import personal from './api/personal.js';
import planesProgramas from './api/planes-programas.js';
import reportesFalla from './api/reportes-falla.js';
import sendEmail from './api/send-email.js';
import tecnoComites from './api/tecno-comites.js';
import tecnoReportes from './api/tecno-reportes.js';
import tecnoTransversal from './api/tecno-transversal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');

// Mismos headers que la sección "headers" de vercel.json, aplicados a toda respuesta.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

/** Construye la app Express. Separado de `listen()` para poder probarla sin abrir un puerto real. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' })); // formatos con imágenes/archivos en base64

  app.use((req, res, next) => {
    for (const [nombre, valor] of Object.entries(SECURITY_HEADERS)) res.setHeader(nombre, valor);
    next();
  });

  const ruta = (p, handler) => app.all(p, (req, res) => handler(req, res));

  ruta('/api/admin', admin);
  ruta('/api/capacitaciones', capacitaciones);
  ruta('/api/checklist-dotacion', checklistDotacion);
  ruta('/api/equipos', equipos);
  ruta('/api/formato-temperatura-humedad', formatoTemperaturaHumedad);
  ruta('/api/limpieza-desinfeccion', limpiezaDesinfeccion);
  ruta('/api/limpieza-plantillas', limpiezaPlantillas);
  ruta('/api/login', login);
  ruta('/api/personal', personal);
  ruta('/api/planes-programas', planesProgramas);
  ruta('/api/reportes-falla', reportesFalla);
  ruta('/api/send-email', sendEmail);
  ruta('/api/tecno-comites', tecnoComites);
  ruta('/api/tecno-reportes', tecnoReportes);
  ruta('/api/tecno-transversal', tecnoTransversal);

  // Reescrituras de vercel.json: misma ruta pública, mismo handler, con los query params que
  // el rewrite original agregaba (así los handlers no necesitan saber que la ruta cambió).
  app.all('/api/logout', (req, res) => { req.query.action = 'logout'; return login(req, res); });
  app.all('/api/empresas', (req, res) => { req.query.resource = 'empresas'; return admin(req, res); });
  app.all('/api/empresas/:id', (req, res) => { req.query.resource = 'empresas'; req.query.id = req.params.id; return admin(req, res); });
  app.all('/api/usuarios', (req, res) => { req.query.resource = 'usuarios'; return admin(req, res); });
  app.all('/api/usuarios/:id', (req, res) => { req.query.resource = 'usuarios'; req.query.id = req.params.id; return admin(req, res); });
  app.all('/api/admin/sin-empresa', (req, res) => { req.query.resource = 'sin-empresa'; return admin(req, res); });

  // Frontend: build estático de Vite (npm run build → dist/), con fallback a index.html para
  // que recargar la página en cualquier vista del SPA siga funcionando.
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));

  return app;
}

const PORT = Number(process.env.PORT) || 3000;

// Solo arranca el servidor si este archivo se ejecuta directamente (`node server.js`), no
// cuando otro módulo lo importa (p. ej. una futura prueba de integración de createApp()).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, () => {
    console.log(`[server] CMMS Biomédico escuchando en http://localhost:${PORT}`);
  });
}
