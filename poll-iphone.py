import urllib.request
import json
import time

url = "https://advice-board.onrender.com/api/prices/iphone"
for _ in range(30):
    try:
        req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print("Success! Items count:", data.get('total'))
            if data.get('total') and data.get('total') > 0:
                print("FOUND UPDATED DEPLOYMENT AND IT WORKS!")
                break
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        if e.code == 502:
            print("Deploying...")
        else:
            try:
                err_data = json.loads(e.read().decode())
                print("Error Details:", err_data)
                if 'detail' in err_data:
                    print("This is the new code with error details.")
            except:
                pass
    except Exception as e:
        print("Error:", e)
    time.sleep(10)
