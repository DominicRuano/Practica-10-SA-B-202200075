import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:8080';
const seconds = Number(process.argv[3] || 600);
const output = process.argv[4] || 'P10/.runtime';
const email = `p10.${randomUUID()}@example.com`;
const password = `P10-${randomUUID()}!`;
let cookie = '';
let lastTrace;
let completed = 0;
let errors = 0;

async function call(path, body, expected = 200, method = 'POST') {
  const response = await fetch(`${base}${path}`, {
    method, headers: {'content-type':'application/json', origin:'http://127.0.0.1:8080', cookie, connection:'close'},
    body: method === 'GET' ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (response.status !== expected) throw new Error(`${path}: HTTP ${response.status}`);
  return {response, body: text ? JSON.parse(text) : null};
}
await mkdir(output, {recursive: true, mode: 0o700});
let reachable = false;
for (let attempt = 0; attempt < 150; attempt += 1) {
  try {
    const health = await fetch(`${base}/health`, {signal:AbortSignal.timeout(2000)});
    if (health.ok) {reachable = true; break;}
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!reachable) throw new Error('El gateway candidato no quedo disponible.');
await call('/api/v1/auth/register', {nombre:'Prueba de operacion P10', correo:email, contrasena:password}, 201);
const login = await call('/api/v1/auth/login', {correo:email, contrasena:password});
cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const catalog = await call('/api/v1/catalogo/graphql', {query:'query { categorias { id nombre } }'});
const category = catalog.body.data.categorias[0].id;
const created = await call('/api/v1/solicitudes', {categoria_id:category, titulo:`Operacion P10 ${Date.now()}`, descripcion:'Verificacion de trazabilidad del ecosistema academico.', prioridad:3}, 201);
await writeFile(`${output}/trace-correlacion.json`, JSON.stringify({trace_id:created.response.headers.get('x-trace-id'),solicitud_id:created.body.data.id,timestamp:new Date().toISOString()}, null, 2));
await call('/api/v1/solicitudes', {}, 400);
let renewAt = Date.now() + 240000;
let renewing;
async function renewSession() {
  if (Date.now() < renewAt) return;
  if (!renewing) renewing = (async () => {
    const next = await call('/api/v1/auth/login', {correo:email, contrasena:password});
    cookie = next.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    renewAt = Date.now() + 240000;
  })().finally(() => {renewing = undefined;});
  await renewing;
}
const deadline = Date.now() + seconds * 1000;
async function worker() {
  let iteration = 0;
  while (Date.now() < deadline) {
    const started = Date.now();
    try {
      await renewSession();
      const result = await call('/api/v1/catalogo/graphql', {query:'query { categorias { id nombre } }'});
      if (iteration % 3 === 0) await call('/api/v1/solicitudes', undefined, 200, 'GET');
      iteration += 1;
      lastTrace = result.response.headers.get('x-trace-id');
      completed += 1;
      await writeFile(`${output}/ultimo-trafico.json`, JSON.stringify({timestamp:new Date().toISOString(),trace_id:lastTrace,duration_ms:Date.now()-started}));
    } catch (error) {
      errors += 1;
      await writeFile(`${output}/ultimo-error.json`, JSON.stringify({timestamp:new Date().toISOString(),error:error.message}));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
await Promise.all(Array.from({length:2}, worker));
console.log(JSON.stringify({completed,errors,seconds,trace_id:lastTrace}));
