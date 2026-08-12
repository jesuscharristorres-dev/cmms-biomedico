#!/usr/bin/env node
// scripts/hash-password.mjs
// Genera el valor para la variable de entorno AUTH_PASSWORD_HASH (Vercel → Project
// Settings → Environment Variables), usando el mismo algoritmo (scrypt) que verifica
// api/login.js vía lib/auth.js. La contraseña en texto plano NUNCA se guarda en ningún
// archivo — solo se usa en memoria para calcular el hash que se imprime en pantalla.
//
// Uso:
//   node scripts/hash-password.mjs "tu-contraseña-nueva"

import { hashPassword } from '../lib/auth.js';

const password = process.argv[2];

if (!password) {
  console.error('Uso: node scripts/hash-password.mjs "tu-contraseña"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Elige una contraseña de al menos 8 caracteres.');
  process.exit(1);
}

const hash = hashPassword(password);

console.log('\nAgrega esto en Vercel → Project Settings → Environment Variables:\n');
console.log('  AUTH_PASSWORD_HASH =', hash);
console.log('\n(Aplica a Production, Preview y Development. No compartas este valor fuera de Vercel.)\n');
