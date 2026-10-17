import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

test('envia los registros por OTLP con el nombre del servicio y el trace_id', async () => {
  const received = [];
  const collector = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push({path: request.url, body: JSON.parse(body)});
    response.writeHead(200, {'content-type': 'application/json'}).end('{}');
  });
  await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
  try {
    const bootstrap = readFileSync(new URL('../../../telemetry/node.cjs', import.meta.url), 'utf8');
    const child = spawn(process.execPath, ['-e', bootstrap + `
      const {logs} = require('@opentelemetry/api-logs');
      logs.getLogger('transport-test').emit({
        severityNumber: 9,
        body: JSON.stringify({event:'transport_test',trace_id:'00112233445566778899aabbccddeeff'}),
      });
      sdk.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
    `], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: {...process.env, OTEL_SERVICE_NAME:'gateway', OTEL_METRICS_EXPORTER:'none',
        OTEL_EXPORTER_OTLP_ENDPOINT:`http://127.0.0.1:${collector.address().port}`},
      timeout: 10000,
      stdio: 'ignore',
    });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(exitCode, 0);
    const exported = received.find(item => item.path === '/v1/logs');
    assert.ok(exported, 'el Collector debe recibir una exportacion de logs');
    const resource = exported.body.resourceLogs[0];
    assert.ok(resource.resource.attributes.some(attribute => attribute.key === 'service.name' && attribute.value.stringValue === 'gateway'));
    const record = JSON.parse(resource.scopeLogs[0].logRecords[0].body.stringValue);
    assert.equal(record.trace_id, '00112233445566778899aabbccddeeff');
  } finally {
    collector.closeAllConnections();
    await new Promise(resolve => collector.close(resolve));
  }
});
