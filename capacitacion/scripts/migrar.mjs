#!/usr/bin/env node
// Migra el contenido del sitio de WordPress a las fichas de curso.
//
//   npm run migrar                     descarga todo desde WordPress y actualiza fichas
//   npm run migrar -- --pdfs <carpeta> usa PDF ya descargados (nombre de archivo = equipo o título)
//   npm run migrar -- --solo-laminas   solo regenera láminas WebP de los PDF que ya están en public/
//   npm run migrar -- --simular        no escribe nada; muestra lo que haría
//
// Requiere pdftoppm (poppler-utils) en el PATH. Escribe migracion/reporte.md.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import sharp from 'sharp';

const SITIO = 'formacionbiomedica.wordpress.com';
const API = `https://public-api.wordpress.com/wp/v2/sites/${SITIO}`;
const RAIZ = new URL('..', import.meta.url).pathname;
const FICHAS = join(RAIZ, 'src/content/cursos');
const ANCHO = 1600;

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const soloLaminas = args.includes('--solo-laminas');
const carpetaPdfs = args.includes('--pdfs') ? args[args.indexOf('--pdfs') + 1] : null;

export const normalizar = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function extraer(html) {
  const youtube = [...html.matchAll(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/g)].map((m) => m[1]);
  const pdfs = [...html.matchAll(/https?:\/\/[^"'\s<>]+?\.pdf/gi)].map((m) => m[0]);
  const formularios = [...html.matchAll(/https?:\/\/(?:forms\.gle\/[\w-]+|docs\.google\.com\/forms\/[^"'\s<>]+)/g)].map((m) => m[0].replace(/&amp;/g, '&'));
  const calendario = html.match(/https:\/\/calendar\.google\.com\/calendar\/embed[^"'\s<>]+/)?.[0]?.replace(/&amp;/g, '&') ?? null;
  return { youtube: [...new Set(youtube)], pdfs: [...new Set(pdfs)], formularios: [...new Set(formularios)], calendario };
}

// Empareja una ficha con una página de WordPress por título o slug.
export function emparejar(ficha, paginas) {
  const claves = [normalizar(ficha.titulo), normalizar(ficha.equipo.replaceAll('-', ' '))];
  return (
    paginas.find((p) => claves.includes(normalizar(p.titulo))) ??
    paginas.find((p) => claves.some((k) => normalizar(p.titulo).includes(k))) ??
    paginas.find((p) => claves.some((k) => normalizar(p.slug.replace(/-\d+$/, '')) === k)) ??
    null
  );
}

async function json(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'migracion-capacitacion-biomedica' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function paginasWordPress() {
  const todas = [];
  for (const tipo of ['pages', 'posts']) {
    for (let page = 1; ; page++) {
      let lote;
      try {
        lote = await json(`${API}/${tipo}?per_page=100&page=${page}&_fields=slug,link,title,content`);
      } catch (e) {
        if (page > 1) break;
        throw e;
      }
      if (!lote.length) break;
      todas.push(...lote.map((p) => ({ tipo, slug: p.slug, link: p.link, titulo: p.title.rendered, html: p.content.rendered })));
      if (lote.length < 100) break;
    }
  }
  return todas;
}

async function descargar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} al descargar ${url}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

export async function pdfALaminas(pdf, carpeta) {
  const tmp = mkdtempSync(join(tmpdir(), 'laminas-'));
  try {
    execFileSync('pdftoppm', ['-png', '-r', '150', '-scale-to-x', String(ANCHO), '-scale-to-y', '-1', pdf, join(tmp, 'p')]);
    const pngs = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
    rmSync(carpeta, { recursive: true, force: true });
    mkdirSync(carpeta, { recursive: true });
    let n = 0;
    for (const png of pngs) {
      n++;
      await sharp(join(tmp, png)).webp({ quality: 78, effort: 5 }).toFile(join(carpeta, `${String(n).padStart(2, '0')}.webp`));
    }
    return n;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const quitar = (lista, prefijo) => lista.filter((p) => !p.startsWith(prefijo));

async function main() {
  const archivos = readdirSync(FICHAS).filter((f) => f.endsWith('.yaml')).sort();
  const reporte = ['# Reporte de migración', '', `Fecha: ${new Date().toISOString().slice(0, 10)}`, ''];
  let paginas = [];
  let calendario = null;

  if (!soloLaminas && !carpetaPdfs) {
    try {
      paginas = await paginasWordPress();
      reporte.push(`Páginas leídas de WordPress: ${paginas.length}`, '');
      calendario = paginas.map((p) => extraer(p.html).calendario).find(Boolean) ?? null;
    } catch (e) {
      console.error(`No se pudo leer WordPress (${e.message}). Usa --pdfs <carpeta> con los PDF descargados a mano.`);
      process.exitCode = 1;
      return;
    }
  }

  reporte.push('| Código | Curso | Página anterior | PDF | Láminas | Video | Pos test | Pendientes |', '|---|---|---|---|---|---|---|---|');

  for (const archivo of archivos) {
    const ruta = join(FICHAS, archivo);
    const f = parse(readFileSync(ruta, 'utf8'));
    const carpeta = join(RAIZ, 'public/cursos', f.categoria, f.equipo);
    const destinoPdf = join(carpeta, `${f.equipo}.pdf`);
    let pdfLocal = existsSync(destinoPdf) ? destinoPdf : null;
    let pagina = null;

    if (paginas.length) {
      pagina = emparejar(f, paginas);
      if (pagina) {
        const d = extraer(pagina.html);
        f.slug_anterior = `/${pagina.slug}/`;
        if (d.youtube[0]) { f.video = d.youtube[0]; f.pendientes = quitar(f.pendientes, 'Migrar ID del video'); }
        const pos = d.formularios.at(-1);
        if (pos && !f.pos_test) { f.pos_test = pos; f.pendientes = quitar(f.pendientes, 'Migrar enlace de pos test'); }
        if (d.pdfs[0] && !simular) {
          mkdirSync(carpeta, { recursive: true });
          await descargar(d.pdfs[0], destinoPdf);
          pdfLocal = destinoPdf;
        }
      }
    }

    if (carpetaPdfs) {
      const claves = [normalizar(f.equipo.replaceAll('-', ' ')), normalizar(f.titulo)];
      const candidato = readdirSync(carpetaPdfs).find((x) => x.toLowerCase().endsWith('.pdf') && claves.includes(normalizar(basename(x, '.pdf'))));
      if (candidato && !simular) {
        mkdirSync(carpeta, { recursive: true });
        writeFileSync(destinoPdf, readFileSync(join(carpetaPdfs, candidato)));
        pdfLocal = destinoPdf;
      }
    }

    let n = null;
    if (pdfLocal && !simular) {
      n = await pdfALaminas(pdfLocal, join(carpeta, 'laminas'));
      f.pdf = `/cursos/${f.categoria}/${f.equipo}/${f.equipo}.pdf`;
      f.laminas = n;
      f.pendientes = quitar(f.pendientes, 'Migrar PDF y láminas');
    }

    if (!simular) writeFileSync(ruta, stringify(f));
    reporte.push(`| ${f.codigo} | ${f.titulo} | ${pagina ? pagina.link : 'sin coincidencia'} | ${f.pdf ? 'Sí' : 'No'} | ${n ?? f.laminas} | ${f.video ?? (f.video_existente ? 'falta ID' : 'no tiene')} | ${f.pos_test ? 'Sí' : 'No'} | ${f.pendientes.join('; ')} |`);
    console.log(`${f.codigo} ${f.titulo}: ${pagina ? 'emparejado' : 'sin página'}${n ? `, ${n} láminas` : ''}`);
  }

  if (calendario) reporte.push('', `Calendario encontrado: \`${calendario}\` (copiar en src/lib/sitio.ts → calendarioUrl).`);
  reporte.push('', '## Avisos para el sitio anterior', '', 'Reemplazar el contenido de cada página antigua por:', '', '> Este curso se trasladó a la nueva Plataforma de Capacitación Biomédica: <nueva URL>. Tus resultados anteriores se conservan.');

  if (!simular) {
    mkdirSync(join(RAIZ, 'migracion'), { recursive: true });
    writeFileSync(join(RAIZ, 'migracion/reporte.md'), reporte.join('\n') + '\n');
  } else {
    console.log(reporte.join('\n'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
