// src/services/emailService.js
// Servicio ÚNICO y reutilizable para todas las notificaciones por correo del CMMS.
// El frontend NUNCA llama a Resend directamente — siempre pasa por /api/send-email
// (función serverless de Vercel), que es la única que conoce la RESEND_API_KEY.
//
// Cualquier notificación nueva que necesites en el futuro debe agregarse aquí como
// una función más, reutilizando sendEmail() y baseTemplate().

const ENDPOINT = '/api/send-email';

/* ---------------------------------------------------------------- */
/* NÚCLEO: envío genérico                                            */
/* ---------------------------------------------------------------- */

async function sendEmail({ to, subject, html, text }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[emailService] Sin destinatarios configurados — no se envía:', subject);
    return { skipped: true };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: recipients, subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[emailService] Error enviando correo:', data.error || res.statusText);
      return { success: false, error: data.error || res.statusText };
    }
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[emailService] Error de red enviando correo:', err);
    return { success: false, error: err.message };
  }
}

/* ---------------------------------------------------------------- */
/* PLANTILLA BASE (HTML por correo, reutilizada por todas las notif.) */
/* ---------------------------------------------------------------- */

// Escapa entidades HTML antes de interpolar texto libre (descripciones de fallas,
// nombres de responsables, etc.) en las plantillas de correo — sin esto, un campo con
// `<script>` o `<img onerror=...>` se ejecuta en el cliente de correo de quien lo reciba.
function esc(v) {
  return (v ?? '—')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseTemplate({ colorFranja, eyebrow, titulo, filas, nota }) {
  const filasHtml = filas
    .map(
      ([label, valor]) => `
      <tr>
        <td style="padding:7px 10px;font-size:11px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;text-transform:uppercase;white-space:nowrap;">${esc(label)}</td>
        <td style="padding:7px 10px;font-size:13px;color:#1e293b;border:1px solid #e2e8f0;">${esc(valor)}</td>
      </tr>`
    )
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:${colorFranja};padding:16px 22px;">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);">${esc(eyebrow)}</div>
        <div style="font-size:17px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(titulo)}</div>
      </div>
      <div style="padding:20px 22px;">
        <table style="width:100%;border-collapse:collapse;">${filasHtml}</table>
        ${nota ? `<p style="font-size:12px;color:#64748b;margin-top:16px;line-height:1.5;">${nota}</p>` : ''}
      </div>
      <div style="padding:12px 22px;background:#f8fafc;font-size:10.5px;color:#94a3b8;text-align:center;">
        Notificación automática — CMMS Biomédico
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- */
/* NOTIFICACIONES ESPECÍFICAS                                        */
/* ---------------------------------------------------------------- */

/** 1. Se dispara cuando un coordinador de sede registra un nuevo reporte de falla. */
export async function notifyFallaReportada(reporte, destinatarios) {
  const html = baseTemplate({
    colorFranja: '#EF4444',
    eyebrow: 'Nuevo reporte de falla',
    titulo: reporte.equipoNombre || 'Equipo sin especificar',
    filas: [
      ['Empresa', reporte.empresa],
      ['Sede', reporte.sede],
      ['Prioridad', reporte.prioridad],
      ['Reportó', reporte.personaReporta],
      ['Fecha', reporte.fecha],
      ['Descripción', reporte.descripcion],
    ],
    nota: 'Ingresa al CMMS → Reportes de falla para asignar un técnico y darle seguimiento.',
  });
  return sendEmail({
    to: destinatarios,
    subject: `🔧 Nueva falla reportada — ${reporte.equipoNombre || 'Equipo'} (${reporte.prioridad})`,
    html,
  });
}

/** 2. Se dispara al registrar un mantenimiento correctivo sobre un equipo. */
export async function notifyCorrectivoRegistrado(equipo, correctivo, destinatarios) {
  const html = baseTemplate({
    colorFranja: '#F97316',
    eyebrow: 'Mantenimiento correctivo registrado',
    titulo: equipo.equipo || 'Equipo sin nombre',
    filas: [
      ['Empresa', equipo.empresa],
      ['Sede', equipo.sede],
      ['Fecha', correctivo.fecha],
      ['Estado', correctivo.estado],
      ['Responsable', correctivo.responsable],
    ],
  });
  return sendEmail({
    to: destinatarios,
    subject: `🛠️ Correctivo registrado — ${equipo.equipo || 'Equipo'}`,
    html,
  });
}

