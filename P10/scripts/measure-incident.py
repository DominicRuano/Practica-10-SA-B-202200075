#!/usr/bin/env python3
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
evidence = root / 'docs/evidencias'
runtime = root / '.runtime'
evidence.mkdir(parents=True, exist_ok=True)

def now():
    return datetime.now(timezone.utc).isoformat()

def get(url, parameters=None):
    if parameters:
        url += '?' + urllib.parse.urlencode(parameters)
    request = urllib.request.Request(url, headers={'Accept':'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def save(name, data):
    (evidence / name).write_text(json.dumps(data, indent=2) + '\n')

baseline = get('http://127.0.0.1:9090/api/v1/alerts')
if any(item['labels'].get('alertname') == 'P10LatencyBudgetBurn' for item in baseline['data']['alerts']):
    raise SystemExit('La alerta de latencia debe estar inactiva antes de iniciar una prueba nueva.')

started_at = now()
started_ns = time.time_ns()
started = time.monotonic()
deadline = started + 900
save('inicio-medicion.json', {'started_at': started_at})
print('Medicion iniciada. Inducir el fallo desde otra terminal.', flush=True)
while time.monotonic() < deadline:
    alerts = get('http://127.0.0.1:9090/api/v1/alerts')
    active = [item for item in alerts['data']['alerts'] if item['labels'].get('alertname') == 'P10LatencyBudgetBurn' and item['state'] == 'firing']
    if active:
        alert_time = now()
        route_started = time.monotonic()
        save('alerta-latencia.json', active)
        print(f'Alerta observada: {alert_time}', flush=True)
        break
    time.sleep(3)
else:
    raise SystemExit('No se observo una alerta de presupuesto de latencia en el plazo de la prueba.')

while time.monotonic() < deadline:
    traces = get('http://127.0.0.1:3200/api/search', {
        'q': '{ resource.service.name = "catalogo" && duration > 2s }',
        'start': started_ns // 1_000_000_000,
        'end': int(time.time()) + 1,
        'limit': 30,
    })
    for item in traces.get('traces', []):
        trace_id = item['traceID']
        query = '{service_name="catalogo"} | json | trace_id="' + trace_id + '" | event="catalogo_dependency_latency"'
        logs = get('http://127.0.0.1:3100/loki/api/v1/query_range', {
            'query': query, 'start': started_ns, 'end': time.time_ns(), 'limit': 20,
        })
        if logs.get('data',{}).get('result'):
            trace = get('http://127.0.0.1:3200/api/traces/' + trace_id)
            save('traza-incidente.json', trace)
            save('logs-incidente.json', logs)
            fault_query = '{service_name="catalogo"} | json | event="catalogo_dependency_latency"'
            first_fault = get('http://127.0.0.1:3100/loki/api/v1/query_range', {
                'query': fault_query, 'start': started_ns, 'end': time.time_ns(),
                'direction': 'forward', 'limit': 1,
            })
            fault_timestamps = [
                int(value[0])
                for stream in first_fault['data']['result']
                for value in stream['values']
            ]
            if not fault_timestamps:
                continue
            fault_seconds = min(fault_timestamps) / 1_000_000_000
            elapsed = round(time.monotonic() - route_started, 3)
            result = {
                'measurement_started_at': started_at,
                'first_fault_log_at': datetime.fromtimestamp(fault_seconds, timezone.utc).isoformat(),
                'alert_observed_at': alert_time,
                'alert_active_at': active[0]['activeAt'],
                'detection_from_first_fault_log_seconds': round(datetime.fromisoformat(alert_time).timestamp() - fault_seconds, 3),
                'alert_poll_interval_seconds': 3,
                'cause_found_at': now(),
                'trace_id': trace_id,
                'trace_duration_ms': item.get('durationMs'),
                'route_seconds': elapsed,
                'target_seconds': 180,
                'target_met': elapsed < 180,
                'cause': 'latencia_inducida_dependencia_catalogo',
            }
            save('recorrido-sintoma-causa.json', result)
            print(json.dumps(result), flush=True)
            raise SystemExit(0 if result['target_met'] else 1)
    time.sleep(2)
raise SystemExit('La alerta se observo pero no se correlacionaron la traza y su registro.')
