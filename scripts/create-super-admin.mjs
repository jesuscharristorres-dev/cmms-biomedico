#!/usr/bin/env node
// scripts/create-super-admin.mjs
// Crea (o restablece) un usuario SUPER_ADMIN directamente en Vercel KV. Útil si no se
// quiere usar el alta automática por variables de entorno (migración 002) o si se perdió
// el acceso. La contraseña NO se pasa como argumento (quedaría en el historial del shell):
// se lee de la variable SUPERADMIN_PASSWORD o se pide por consola.
//
// Uso:
//   vercel env pull .env.local
//   node --env-file=.env.local scripts/create-super-admin.mjs admin@empresa.com "Nombre Apellido"

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ensureSchema } from '../lib/migrations.js';
import { listUsuarios, saveUsuarios, crearUsuario, PASSWORD_MIN } from '../lib/usuarios.js';
import { hashPassword } from '../lib/password.js';

const [email, nombre = 'Administrador global'] = process.argv.slice(2);
if (!email) {
  console.error('Uso: create-super-admin.mjs <email> ["Nombre"]');
  process.exit(1);
}

let password = process.env.SUPERADMIN_PASSWORD;
if (!password) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  password = await rl.question(`Contraseña (mín. ${PASSWORD_MIN} caracteres): `);
  rl.close();
}

try {
  await ensureSchema();
  const usuarios = await listUsuarios();
  const existente = usuarios.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  if (existente) {
    if (password.length < PASSWORD_MIN) throw new Error('Contraseña demasiado corta.');
    Object.assign(existente, { role: 'SUPER_ADMIN', empresa_id: null, estado: 'activo', password_hash: hashPassword(password), updated_at: new Date().toISOString() });
    await saveUsuarios(usuarios);
    console.log(`Usuario existente ${email} actualizado como SUPER_ADMIN activo.`);
  } else {
    await crearUsuario({ nombre, email, password, role: 'SUPER_ADMIN', estado: 'activo' });
    console.log(`SUPER_ADMIN ${email} creado.`);
  }
} catch (err) {
  console.error('Error:', err.message, err.details || '');
  process.exit(1);
}
