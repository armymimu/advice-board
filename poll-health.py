import urllib.request
import json
import time

url = "https://advice-board.onrender.com/api/health"
for _ in range(30):
    try:
        req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(data)
            if 'lastTokenError' in data:
                print("FOUND UPDATED DEPLOYMENT!")
                print("lastTokenError:", data['lastTokenError'])
                break
    except Exception as e:
        print("Error:", e)
    time.sleep(10)
