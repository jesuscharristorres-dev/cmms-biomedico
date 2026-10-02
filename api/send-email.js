// api/send-email.js
// Endpoint serverless de Vercel. Corre en el servidor (Node.js), nunca en el navegador,
// así que RESEND_API_KEY nunca queda expuesta en el bundle del frontend.
//
// Configuración requerida en Vercel (Project Settings → Environment Variables):
//   RESEND_API_KEY     → tu API key de https://resend.com/api-keys
//   RESEND_FROM_EMAIL  → opcional. Remitente verificado, ej: "CMMS Biomédico <alertas@tudominio.com>"
//                         Si no la defines, se usa el remitente de pruebas de Resend
//                         (onboarding@resend.dev), que solo entrega a la cuenta dueña del API key.
//
// Instalación local:
//   npm install resend
//
// Vercel detecta automáticamente cualquier archivo dentro de /api como una función serverless
// — no necesitas configuración adicional en vercel.json para que este endpoint quede publicado
// en https://tu-dominio.vercel.app/api/send-email

import { Resend } from 'resend';
import { datos } from '../lib/datos/index.js';
import { requireSuperAdmin } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'CMMS Biomédico <onboarding@resend.dev>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  // MULTIEMPRESA / auditoría 2026-09-29: antes este endpoint era PÚBLICO — cualquiera en
  // internet podía mandar un correo con asunto y HTML arbitrarios a la lista interna de
  // alertas (vector de phishing con el dominio y la cuota de Resend del proyecto). Ningún
  // flujo actual del frontend lo usa (src/services/emailService.js no se importa en ningún
  // componente), así que se restringe al SUPER_ADMIN: la lista de alertas es global, no de
  // una empresa. Si en el futuro el formulario público de fallas debe notificar por correo,
  // el correo debe componerse EN EL SERVIDOR a partir del reporte guardado (no con HTML del
  // cliente) — ver docs/multi-tenant.md.
  try {
    await requireSuperAdmin(req);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('[api/send-email] Error verificando sesión:', err);
    return res.status(500).json({ error: 'Error inesperado del servidor.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[api/send-email] Falta la variable de entorno RESEND_API_KEY.');
    return res.status(500).json({ error: 'RESEND_API_KEY no está configurada en el servidor.' });
  }

  const { to, subject, html, text } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Faltan campos requeridos: to, subject, html.' });
  }

  // Defensa adicional: el destinatario nunca se toma tal cual del cliente — se valida
  // contra la lista real de correos de alerta configurados en KV. Cualquier dirección que
  // no esté en esa lista se descarta.
  const solicitados = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const permitidos = new Set(await datos.alertEmails.leer());
  const recipients = solicitados.filter((addr) => permitidos.has(addr));

  if (recipients.length === 0) {
    return res.status(400).json({ error: 'No hay destinatarios válidos configurados en Configuración → Correos para alertas.' });
  }

  try {
    // El cliente se crea aquí (no al cargar el módulo): sin RESEND_API_KEY el constructor
    // lanza, y eso tumbaba la función completa antes de poder responder un error controlado.
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
      text: text || undefined,
    });

    if (error) {
      console.error('[api/send-email] Error de Resend:', error);
      return res.status(502).json({ error: error.message || 'Resend rechazó el envío.' });
    }

    return res.status(200).json({ success: true, id: data?.id });
  } catch (err) {
    console.error('[api/send-email] Error inesperado:', err);
    return res.status(500).json({ error: 'Error inesperado del servidor al enviar el correo.' });
  }
}
