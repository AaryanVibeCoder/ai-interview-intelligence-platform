import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

# Load env variables from .env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

def test_groq():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("ERROR: GROQ_API_KEY not found in .env file.")
        return

    print("=" * 60)
    print(f"Testing Groq API Key: {api_key[:12]}...")
    print("=" * 60)

    # Standard headers to bypass Cloudflare user-agent blocks
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    # Step 1: Query Models
    models_url = "https://api.groq.com/openai/v1/models"
    req_models = urllib.request.Request(
        models_url,
        headers=headers
    )
    
    print("\n--- 1. Querying Groq Models ---")
    try:
        with urllib.request.urlopen(req_models) as response:
            status = response.getcode()
            body = response.read().decode("utf-8")
            print(f"GET Models Status: {status}")
            data = json.loads(body)
            models = [m["id"] for m in data.get("data", [])]
            print("Available models:")
            for model in sorted(models):
                print(f" - {model}")
    except urllib.error.HTTPError as e:
        print(f"Failed to query models: HTTP {e.code} - {e.read().decode('utf-8')}")
        return
    except Exception as e:
        print(f"Failed to query models: {e}")
        return

    # Choose model: llama-3.3-70b-versatile or first available
    chosen_model = "llama-3.3-70b-versatile"
    if chosen_model not in models:
        # Fallback to llama3-8b-8192 or similar if not found
        llama_models = [m for m in models if "llama" in m]
        if llama_models:
            chosen_model = llama_models[0]
        else:
            chosen_model = models[0] if models else None

    if not chosen_model:
        print("No models available.")
        return

    print(f"\nUsing Model: {chosen_model}")

    # Step 2: Chat Completion Test
    chat_url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": chosen_model,
        "messages": [
            {"role": "user", "content": "Explain recursion in one sentence."}
        ],
        "max_tokens": 100
    }
    
    chat_headers = headers.copy()
    chat_headers["Content-Type"] = "application/json"
    
    req_chat = urllib.request.Request(
        chat_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=chat_headers,
        method="POST"
    )

    print("\n--- 2. Sending Chat Completion Request ---")
    try:
        with urllib.request.urlopen(req_chat) as response:
            status = response.getcode()
            response_headers = response.info()
            body = response.read().decode("utf-8")
            
            print(f"POST Chat Status: {status}")
            print("\nResponse Headers (Rate Limits):")
            for k, v in response_headers.items():
                if any(x in k.lower() for x in ["ratelimit", "limit", "remaining", "reset"]):
                    print(f"  {k}: {v}")
            
            print("\nResponse Body:")
            print(json.dumps(json.loads(body), indent=2))
    except urllib.error.HTTPError as e:
        print(f"Chat request failed: HTTP {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Chat request failed: {e}")

if __name__ == "__main__":
    test_groq()
