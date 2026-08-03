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

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'CMMS Biomédico <onboarding@resend.dev>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[api/send-email] Falta la variable de entorno RESEND_API_KEY.');
    return res.status(500).json({ error: 'RESEND_API_KEY no está configurada en el servidor.' });
  }

  const { to, subject, html, text } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Faltan campos requeridos: to, subject, html.' });
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    return res.status(400).json({ error: 'No hay destinatarios válidos.' });
  }

  try {
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
