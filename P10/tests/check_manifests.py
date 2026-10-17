import sys
from pathlib import Path
import yaml

rendered = Path(sys.argv[1])
platform = [item for item in yaml.safe_load_all((rendered / 'platform.yaml').read_text()) if item]
resources = [item for item in yaml.safe_load_all((rendered / 'observability.yaml').read_text()) if item]
for service in ['gateway', 'solicitudes', 'catalogo']:
    rollout = next(item for item in platform if item['kind'] == 'Rollout' and item['metadata']['name'] == service)
    assert rollout['spec']['replicas'] >= 2
    assert rollout['spec']['template']['spec']['containers'][0]['image'].startswith('ghcr.io/dominicruano/sa-p8/')
    analysis = next(item for item in platform if item['kind'] == 'AnalysisTemplate' and item['metadata']['name'] == f'{service}-promotion')
    for metric in analysis['spec']['metrics']:
        assert set(metric['provider']) == {'prometheus'}
        assert 'pod_template_hash=' in metric['provider']['prometheus']['query']
    assert {metric['name'] for metric in analysis['spec']['metrics']} == {'candidate-traffic', 'candidate-error-rate', 'candidate-p95'}
    steps = rollout['spec']['strategy']['canary']['steps']
    assert any(arg.get('valueFrom', {}).get('podTemplateHashValue') == 'Latest' for step in steps if 'analysis' in step for arg in step['analysis']['args'])
rule = next(item for item in resources if item['kind'] == 'PrometheusRule')
alerts = [entry for group in rule['spec']['groups'] for entry in group['rules'] if 'alert' in entry]
assert len(alerts) == 2
for alert in alerts:
    assert 'burnrate5m' in alert['expr'] and 'burnrate1m' in alert['expr']
    assert alert['annotations']['runbook_url'].endswith(('#disponibilidad', '#latencia'))
assert not any(item['kind'] == 'Service' and item.get('spec', {}).get('type') == 'LoadBalancer' for item in resources)
print('P10: replicas, consultas del canary, presupuesto de error y destinos privados correctos.')
