import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const servers = [];
const upstreamPorts = [];
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
const backend = await listen((request, response) => {
  if (request.url.startsWith('/api/v1/solicitudes')) upstreamPorts.push(request.socket.remotePort);
  if (request.url === '/internal/verify') {
    if (request.headers.cookie !== 'session=valid') return response.writeHead(401).end();
    return response.writeHead(204, {'x-user-id': 'usuario-verificado', 'x-user-role': 'USER'}).end();
  }
  if (request.url === '/api/v1/auth/login') {
    return response.writeHead(200, {'content-type': 'application/json', 'set-cookie': ['access=uno; HttpOnly', 'refresh=dos; HttpOnly']}).end('{}');
  }
  response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({user: request.headers['x-user-id'], role: request.headers['x-user-role']}));
});
process.env.AUTH_URL = backend;
process.env.SOLICITUDES_URL = backend;
const {createApp} = await import('../dist/app.js');
const gateway = await listen(createApp());
after(async () => Promise.all(servers.map(server => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);} ))));

test('rechaza la identidad enviada por el cliente sin una sesion valida', async () => {
  const response = await fetch(`${gateway}/api/v1/solicitudes`, {headers: {'x-user-id': 'admin', 'x-user-role': 'ADMIN'}});
  assert.equal(response.status, 401);
});
test('propaga solamente la identidad verificada por autenticacion', async () => {
  const response = await fetch(`${gateway}/api/v1/solicitudes`, {headers: {cookie: 'session=valid', 'x-user-id': 'admin', 'x-user-role': 'ADMIN'}});
  assert.deepEqual(await response.json(), {user: 'usuario-verificado', role: 'USER'});
});
test('conserva las dos cookies de autenticacion', async () => {
  const response = await fetch(`${gateway}/api/v1/auth/login`, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(response.headers.getSetCookie().length, 2);
});
test('abre una conexion de backend por peticion para permitir el reparto del canary', async () => {
  const started = upstreamPorts.length;
  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(`${gateway}/api/v1/solicitudes`, {headers: {cookie: 'session=valid'}});
    assert.equal(response.status, 200);
    await response.text();
  }
  const observed = upstreamPorts.slice(started);
  assert.equal(observed.length, 6);
  assert.equal(new Set(observed).size, 6);
});
