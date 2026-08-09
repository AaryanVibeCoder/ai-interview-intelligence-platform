import os
import json
import urllib.request
import urllib.error
import time
from dotenv import load_dotenv

# Load env variables from .env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

def test_groq_gpt():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("ERROR: GROQ_API_KEY not found in .env file.")
        return

    model_name = "openai/gpt-oss-20b"
    chat_url = "https://api.groq.com/openai/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": "Hello"}
        ],
        "max_tokens": 10
    }

    print("=" * 70)
    print(f"Testing Groq API with Model: {model_name}")
    print(f"Sending 10 rapid-fire requests to observe rate limit window behavior...")
    print("=" * 70)

    for i in range(1, 11):
        t0 = time.monotonic()
        req = urllib.request.Request(
            chat_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                latency = int((time.monotonic() - t0) * 1000)
                status = response.getcode()
                info = response.info()
                
                # Fetch relevant rate limiting headers
                limit_reqs = info.get("x-ratelimit-limit-requests", "N/A")
                rem_reqs = info.get("x-ratelimit-remaining-requests", "N/A")
                reset_reqs = info.get("x-ratelimit-reset-requests", "N/A")
                
                limit_tokens = info.get("x-ratelimit-limit-tokens", "N/A")
                rem_tokens = info.get("x-ratelimit-remaining-tokens", "N/A")
                reset_tokens = info.get("x-ratelimit-reset-tokens", "N/A")

                # Parse response snippet
                body = json.loads(response.read().decode("utf-8"))
                completion = body["choices"][0]["message"]["content"].strip().replace("\n", " ")

                print(f"Req #{i:02d} | Status: {status} | Latency: {latency:4d}ms | Msg: '{completion}'")
                print(f"       Requests: Rem={rem_reqs}/{limit_reqs} | Reset={reset_reqs}")
                print(f"       Tokens:   Rem={rem_tokens}/{limit_tokens} | Reset={reset_tokens}")
                print("-" * 70)
                
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            print(f"Req #{i:02d} | Failed: HTTP {e.code}")
            print(f"       Details: {err_body}")
            print("-" * 70)
        except Exception as e:
            print(f"Req #{i:02d} | Failed with unexpected error: {e}")
            print("-" * 70)
        
        # Micro-sleep to keep the requests rapid but distinct
        time.sleep(0.1)

if __name__ == "__main__":
    test_groq_gpt()
