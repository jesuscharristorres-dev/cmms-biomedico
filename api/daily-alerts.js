// api/cron/daily-alerts.js
// Vercel Cron Job — se dispara solo, todos los días, aunque nadie tenga la app abierta.
// Horario definido en vercel.json (13:00 UTC = 8:00am Colombia, sin horario de verano).
//
// Lee los datos desde Vercel KV (sincronizados por api/sync-data.js) y envía UN correo
// resumen diario con todas las alertas activas — no reenvía la misma alerta varias veces
// en el día porque solo corre una vez, a las 8am.

import { kv } from '@vercel/kv';
import { Resend } from 'resend';
import { buildAlerts } from '../../src/services/alertLogic.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'CMMS Biomédico <onboarding@resend.dev>';

// a.equipo/a.empresa/a.sede vienen de texto libre cargado por usuarios (nombre del
// equipo, etc.) — se escapan antes de interpolarlos en el HTML del correo.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  // Vercel agrega automáticamente este header en sus Cron Jobs cuando defines CRON_SECRET
  // en el proyecto. A propósito falla CERRADO: si la variable no está configurada, el
  // endpoint se rechaza en vez de quedar abierto — antes, si alguien olvidaba configurar
  // CRON_SECRET en Vercel, cualquiera podía disparar este endpoint manualmente sin límite
  // y agotar la cuota de Resend.
  if (!process.env.CRON_SECRET) {
    console.error('[cron/daily-alerts] Falta la variable de entorno CRON_SECRET — rechazando por seguridad.');
    return res.status(500).json({ error: 'CRON_SECRET no está configurado en el servidor.' });
  }
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[cron/daily-alerts] Falta RESEND_API_KEY.');
    return res.status(500).json({ error: 'RESEND_API_KEY no configurada.' });
  }

  try {
    const equipos = (await kv.get('cmms:equipos')) || [];
    const alertEmails = (await kv.get('cmms:alertEmails')) || [];

    if (alertEmails.length === 0) {
      return res.status(200).json({ skipped: true, reason: 'Sin correos configurados en Configuración.' });
    }

    const alerts = buildAlerts(equipos);
    if (alerts.length === 0) {
      return res.status(200).json({ skipped: true, reason: 'Sin alertas activas hoy.' });
    }

    const filas = alerts
      .map(
        (a) => `
      <tr>
        <td style="padding:7px 10px;font-size:11px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;white-space:nowrap;">${esc(a.tipo)} — ${esc(a.equipo)}</td>
        <td style="padding:7px 10px;font-size:13px;color:#1e293b;border:1px solid #e2e8f0;">${esc(a.empresa)} · ${esc(a.sede)} · ${
          a.status === 'vencido' ? `vencida hace ${Math.abs(a.diffDays)} días` : `faltan ${a.diffDays} días`
        }</td>
      </tr>`
      )
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:#4FD1C5;padding:16px 22px;">
            <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Resumen diario · 8:00 am</div>
            <div style="font-size:17px;font-weight:700;color:#ffffff;margin-top:2px;">${alerts.length} alerta${alerts.length !== 1 ? 's' : ''} activa${alerts.length !== 1 ? 's' : ''}</div>
          </div>
          <div style="padding:20px 22px;">
            <table style="width:100%;border-collapse:collapse;">${filas}</table>
            <p style="font-size:12px;color:#64748b;margin-top:16px;">Ingresa al CMMS → Alertas para ver el detalle completo.</p>
          </div>
          <div style="padding:12px 22px;background:#f8fafc;font-size:10.5px;color:#94a3b8;text-align:center;">
            Notificación automática diaria — CMMS Biomédico
          </div>
        </div>
      </div>`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: alertEmails,
      subject: `📋 Resumen diario de alertas — ${alerts.length} pendiente${alerts.length !== 1 ? 's' : ''}`,
      html,
    });

    if (error) {
      console.error('[cron/daily-alerts] Error de Resend:', error);
      return res.status(502).json({ error: error.message });
    }

    return res.status(200).json({ success: true, alertCount: alerts.length, id: data?.id });
  } catch (err) {
    console.error('[cron/daily-alerts] Error inesperado:', err);
    return res.status(500).json({ error: 'Error inesperado ejecutando el cron.' });
  }
}
