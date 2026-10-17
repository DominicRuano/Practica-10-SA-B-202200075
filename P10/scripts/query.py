#!/usr/bin/env python3
import json
import sys
import urllib.parse
import urllib.request

kind, expression = sys.argv[1:3]
urls = {
    'prometheus': ('http://127.0.0.1:9090/api/v1/query', {'query': expression}),
    'loki': ('http://127.0.0.1:3100/loki/api/v1/query_range', {'query': expression, 'limit': 50}),
    'tempo': ('http://127.0.0.1:3200/api/search', {'q': expression, 'limit': 20}),
}
url, parameters = urls[kind]
request = urllib.request.Request(url + '?' + urllib.parse.urlencode(parameters), headers={'Accept': 'application/json'})
with urllib.request.urlopen(request, timeout=15) as response:
    print(json.dumps(json.load(response), indent=2))
