import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const dir = new URL('../src/content/cursos/', import.meta.url);
const fichas = readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => parse(readFileSync(new URL(f, dir), 'utf8')));

test('se conservan los 19 cursos', () => assert.equal(fichas.length, 19));

test('códigos y URLs únicos', () => {
  assert.equal(new Set(fichas.map((f) => f.codigo)).size, 19);
  assert.equal(new Set(fichas.map((f) => `${f.categoria}/${f.equipo}`)).size, 19);
});

test('13 cursos con video en el sitio anterior y 6 sin video', () => {
  assert.equal(fichas.filter((f) => f.video || f.video_existente).length, 13);
});

test('suman las 296 láminas del inventario', () => {
  assert.equal(fichas.reduce((s, f) => s + f.laminas, 0), 296);
});

test('ningún texto visible usa em-dash ni "POST TEST"', () => {
  for (const f of fichas) {
    for (const v of [f.titulo, f.objetivo]) {
      assert.ok(!/[—–]/.test(v), `${f.codigo}: guion largo en "${v}"`);
      assert.ok(!/post test/i.test(v), `${f.codigo}: "POST TEST"`);
    }
  }
});
