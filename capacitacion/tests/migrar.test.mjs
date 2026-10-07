import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { extraer, emparejar, normalizar, pdfALaminas } from '../scripts/migrar.mjs';

test('extrae video, PDF, formularios y calendario del HTML de WordPress', () => {
  const html = `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed"></iframe>
    <a href="https://formacionbiomedica.files.wordpress.com/2023/05/autoclave.pdf">PDF</a>
    <a href="https://forms.gle/H3yJGNohnRppsUCZ7">POS TEST</a>
    <iframe src="https://calendar.google.com/calendar/embed?src=abc&amp;ctz=America%2FBogota"></iframe>`;
  const d = extraer(html);
  assert.deepEqual(d.youtube, ['dQw4w9WgXcQ']);
  assert.equal(d.pdfs[0], 'https://formacionbiomedica.files.wordpress.com/2023/05/autoclave.pdf');
  assert.deepEqual(d.formularios, ['https://forms.gle/H3yJGNohnRppsUCZ7']);
  assert.equal(d.calendario, 'https://calendar.google.com/calendar/embed?src=abc&ctz=America%2FBogota');
});

test('empareja por título aunque el slug anterior sea engañoso', () => {
  const paginas = [
    { slug: 'centrifuga', titulo: 'CENTRÍFUGA' },
    { slug: 'centrifuga-2', titulo: 'AUTOCLAVE' },
  ];
  assert.equal(emparejar({ titulo: 'Autoclave', equipo: 'autoclave' }, paginas).slug, 'centrifuga-2');
  assert.equal(emparejar({ titulo: 'Centrífuga', equipo: 'centrifuga' }, paginas).slug, 'centrifuga');
  assert.equal(emparejar({ titulo: 'Básculas', equipo: 'basculas' }, paginas), null);
});

test('normaliza tildes y signos', () => {
  assert.equal(normalizar('Laringoscópio – v2'), 'laringoscopio v2');
});

test('convierte cada página del PDF en una lámina WebP de 1600 px', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-'));
  try {
    const pdf = join(dir, 'prueba.pdf');
    execFileSync('convert', ['-size', '1280x720', 'xc:#DCEAE5', 'xc:#F6F8F7', 'xc:#2D6A5F', pdf]);
    const n = await pdfALaminas(pdf, join(dir, 'laminas'));
    assert.equal(n, 3);
    assert.deepEqual(readdirSync(join(dir, 'laminas')), ['01.webp', '02.webp', '03.webp']);
    const { default: sharp } = await import('sharp');
    const meta = await sharp(join(dir, 'laminas', '01.webp')).metadata();
    assert.equal(meta.width, 1600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
