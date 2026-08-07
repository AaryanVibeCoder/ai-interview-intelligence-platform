import os
import sys
import httpx
from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

def test_openrouter():
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        print("ERROR: LLM_API_KEY not found in .env file.")
        return

    print("=" * 60)
    print(f"Testing OpenRouter API Key Prefix: {api_key[:15]}...")
    print("=" * 60)

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Model: poolside/laguna-s-2.1:free
    model_name = os.getenv("NVIDIA_MODEL_NAME", "poolside/laguna-s-2.1:free")
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": "Say hello!"}
        ]
    }

    print(f"Sending request for model: {model_name}...")
    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        print(f"Status Code: {response.status_code}")
        print("Headers:")
        for k, v in response.headers.items():
            if k.lower() in ("content-type", "x-rate-limit-limit", "x-rate-limit-remaining"):
                print(f"  {k}: {v}")
        print("Response Body:")
        print(response.text)
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_openrouter()
