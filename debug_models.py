import requests
import json

def test_individual_endpoints():
    """Test each model endpoint individually"""
    base_url = "http://localhost:5000"
    test_text = "Hello, how are you today?"
    target_language = "french"
    
    # Test data
    data = {
        "text": test_text,
        "targetLanguage": target_language
    }
    
    endpoints = [
        ("/translate", "MarianMT"),
        ("/translate-google", "Google Translate"),
        ("/translate-m2m100", "M2M-100"),
        ("/translate-madlad", "MADLAD-400")
    ]
    
    print("Testing individual translation endpoints...")
    print("=" * 60)
    
    for endpoint, model_name in endpoints:
        print(f"\n🔍 Testing {model_name} ({endpoint})")
        try:
            response = requests.post(
                f"{base_url}{endpoint}",
                json=data,
                timeout=30  # 30 second timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "success":
                    print(f"✅ SUCCESS: {result.get('translation')}")
                    print(f"   Latency: {result.get('latency', 'N/A')}s")
                else:
                    print(f"❌ FAILED: {result.get('error', 'Unknown error')}")
            else:
                print(f"❌ HTTP ERROR {response.status_code}: {response.text}")
                
        except requests.exceptions.Timeout:
            print(f"⏰ TIMEOUT: Model took too long to respond (>30s)")
        except requests.exceptions.ConnectionError:
            print(f"🔌 CONNECTION ERROR: Cannot connect to server")
        except Exception as e:
            print(f"💥 ERROR: {str(e)}")

def test_compare_custom():
    """Test the compare-custom endpoint"""
    base_url = "http://localhost:5000"
    test_text = "Hello, how are you today?"
    target_language = "french"
    
    data = {
        "text": test_text,
        "targetLanguage": target_language,
        "models": ["marian", "m2m100", "madlad"]
    }
    
    print("\n" + "=" * 60)
    print("🔍 Testing compare-custom endpoint...")
    
    try:
        response = requests.post(
            f"{base_url}/compare-custom",
            json=data,
            timeout=60  # 60 second timeout for multiple models
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ SUCCESS: {len(result.get('results', {}))} models responded")
            
            for model, model_result in result.get('results', {}).items():
                status = model_result.get('status', 'unknown')
                if status == 'success':
                    translation = model_result.get('translation', 'N/A')
                    latency = model_result.get('latency', 'N/A')
                    print(f"   {model}: ✅ '{translation}' ({latency}s)")
                else:
                    error = model_result.get('error', 'Unknown error')
                    print(f"   {model}: ❌ {error}")
        else:
            print(f"❌ HTTP ERROR {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"💥 ERROR: {str(e)}")

def test_server_health():
    """Test server health and available models"""
    base_url = "http://localhost:5000"
    
    print("🔍 Testing server health...")
    
    try:
        # Health check
        response = requests.get(f"{base_url}/health", timeout=10)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ Server is healthy")
            print(f"   Status: {health.get('status', 'unknown')}")
            print(f"   CUDA Available: {health.get('cuda_available', 'unknown')}")
            print(f"   Translation Count: {health.get('translation_count', 'unknown')}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            
        # Models check
        response = requests.get(f"{base_url}/models", timeout=10)
        if response.status_code == 200:
            models = response.json()
            print(f"✅ Available models:")
            for model in models.get('models', []):
                print(f"   - {model.get('display_name')} ({model.get('name')})")
        else:
            print(f"❌ Models check failed: {response.status_code}")
            
    except Exception as e:
        print(f"💥 ERROR: {str(e)}")

if __name__ == "__main__":
    print("🧪 Translation Models Debug Tool")
    print("=" * 60)
    
    # Test server health first
    test_server_health()
    
    # Test individual endpoints
    test_individual_endpoints()
    
    # Test compare-custom
    test_compare_custom()
    
    print("\n" + "=" * 60)
    print("🏁 Debug complete!")
    print("\nIf M2M-100 or MADLAD show timeouts or memory errors,")
    print("they might be too large for your system.")
    print("Consider using smaller models or increasing memory.")