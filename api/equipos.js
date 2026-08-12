// api/equipos.js
// Fuente de verdad COMPARTIDA del inventario de equipos (y, dentro de cada equipo, sus
// preventivos, correctivos, calibraciones y bajas, que van anidados en el mismo objeto).
// Reemplaza el uso de localStorage como almacenamiento principal: corre en el servidor
// (Vercel serverless + Vercel KV), así que cualquier usuario, desde cualquier computador,
// lee y escribe siempre el mismo dato.
//
// Igual que api/reportes-falla.js: nunca recibe el arreglo completo desde el cliente para
// sobrescribirlo. Cada operación es puntual (crear uno o varios, actualizar uno por id,
// eliminar uno por id) y el servidor hace el read-modify-write sobre KV, así dos usuarios
// guardando casi al mismo tiempo desde computadores distintos no se pisan ni se pierden
// equipos entre sí.
//
// Usa la misma clave que ya usaba api/sync-data.js ('cmms:equipos'), para que el cron
// diario de alertas (api/daily-alerts.js) siga leyendo el mismo dato sin cambios.

import { kv } from '@vercel/kv';

const KV_KEY = 'cmms:equipos';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let equipos = (await kv.get(KV_KEY)) || [];
      // Filtrado por empresa a nivel de servidor (opcional): si el cliente pide
      // ?empresa=MACROMED, la respuesta ya viene recortada — no depende de que el
      // frontend oculte visualmente los registros de las demás empresas.
      const { empresa } = req.query || {};
      if (empresa) equipos = equipos.filter(e => e.empresa === empresa);
      return res.status(200).json({ equipos });
    }

    if (req.method === 'POST') {
      const { equipo, equipos: nuevos } = req.body || {};
      const porAgregar = nuevos && Array.isArray(nuevos) ? nuevos : equipo ? [equipo] : null;
      if (!porAgregar || porAgregar.some(e => !e || !e.id)) {
        return res.status(400).json({ error: 'Falta el equipo (o equipos) a crear, con id.' });
      }
      const equipos = (await kv.get(KV_KEY)) || [];
      const existentes = new Set(equipos.map(e => e.id));
      const aAgregar = porAgregar.filter(e => !existentes.has(e.id));
      const actualizados = [...equipos, ...aAgregar];
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ equipos: actualizados });
    }

    if (req.method === 'PATCH') {
      const { id, patch } = req.body || {};
      if (!id || !patch) {
        return res.status(400).json({ error: 'Falta id o patch para actualizar el equipo.' });
      }
      const equipos = (await kv.get(KV_KEY)) || [];
      const idx = equipos.findIndex(e => e.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'No existe un equipo con ese id.' });
      }
      const actualizado = { ...equipos[idx], ...patch };
      const actualizados = [...equipos];
      actualizados[idx] = actualizado;
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ equipo: actualizado, equipos: actualizados });
    }

    if (req.method === 'DELETE') {
      const { id, borrarTodo } = req.body || {};
      if (borrarTodo) {
        await kv.set(KV_KEY, []);
        return res.status(200).json({ equipos: [] });
      }
      if (!id) {
        return res.status(400).json({ error: 'Falta id del equipo a eliminar.' });
      }
      const equipos = (await kv.get(KV_KEY)) || [];
      const actualizados = equipos.filter(e => e.id !== id);
      await kv.set(KV_KEY, actualizados);
      return res.status(200).json({ equipos: actualizados });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error('[api/equipos] Error:', err);
    return res.status(500).json({ error: 'No se pudo acceder a la base de datos compartida de equipos.' });
  }
}
