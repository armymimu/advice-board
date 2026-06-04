import urllib.request
import json

url = "https://advice-board.onrender.com/api/prices/iphone"
try:
    req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Success! Items count:", data.get('total'))
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
