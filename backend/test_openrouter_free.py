import os
import json
import urllib.request
import urllib.error
import time
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

def test_openrouter_free():
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        print("ERROR: LLM_API_KEY not found in .env file.")
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }

    # Step 1: List models and filter for :free
    print("=" * 70)
    print("Step 1: Listing free models on OpenRouter...")
    print("=" * 70)
    
    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}", "User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            free_models = []
            for m in data.get("data", []):
                mid = m.get("id", "")
                pricing = m.get("pricing", {})
                prompt_cost = pricing.get("prompt", "0")
                completion_cost = pricing.get("completion", "0")
                if mid.endswith(":free") or (prompt_cost == "0" and completion_cost == "0"):
                    free_models.append({
                        "id": mid,
                        "prompt_cost": prompt_cost,
                        "completion_cost": completion_cost,
                        "context_length": m.get("context_length", "N/A")
                    })
            
            print(f"Found {len(free_models)} free models:")
            for fm in sorted(free_models, key=lambda x: x["id"]):
                print(f"  - {fm['id']} (ctx={fm['context_length']}, prompt=${fm['prompt_cost']}, completion=${fm['completion_cost']})")
    except Exception as e:
        print(f"Failed to list models: {e}")
        return

    # Step 2: Test candidates
    candidates = [
        "poolside/laguna-s-2.1:free",
        "google/gemma-4-27b-it:free",
        "google/gemma-4-31b-it:free",
    ]
    
    # Only test candidates that actually exist in the free list
    available_free_ids = {fm["id"] for fm in free_models}
    
    print("\n" + "=" * 70)
    print("Step 2: Testing candidate models...")
    print("=" * 70)
    
    for model_slug in candidates:
        exists = model_slug in available_free_ids
        print(f"\n--- {model_slug} (in free list: {exists}) ---")
        
        payload = {
            "model": model_slug,
            "messages": [
                {"role": "user", "content": "Say hello in one word."}
            ],
            "max_tokens": 10
        }
        
        t0 = time.monotonic()
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req) as resp:
                latency = int((time.monotonic() - t0) * 1000)
                body = json.loads(resp.read().decode("utf-8"))
                msg = body["choices"][0]["message"]["content"].strip()
                print(f"  Status: {resp.getcode()} | Latency: {latency}ms | Response: '{msg}'")
        except urllib.error.HTTPError as e:
            latency = int((time.monotonic() - t0) * 1000)
            err = e.read().decode("utf-8")
            print(f"  FAILED: HTTP {e.code} | Latency: {latency}ms | Error: {err[:300]}")
        except Exception as e:
            print(f"  FAILED: {e}")

if __name__ == "__main__":
    test_openrouter_free()
