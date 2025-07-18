import requests

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
        ("/translate-m2m100", "M2M-100")
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
            print("⏰ TIMEOUT: Model took too long to respond (>30s)")
        except requests.exceptions.ConnectionError:
            print("🔌 CONNECTION ERROR: Cannot connect to server")
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
        "models": ["marian", "m2m100", "google"]
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

def test_compare_three():
    """Test the compare-three endpoint (MarianMT, Google, M2M-100)"""
    base_url = "http://localhost:5000"
    test_text = "Hello, how are you today?"
    target_language = "french"
    
    data = {
        "text": test_text,
        "targetLanguage": target_language
    }
    
    print("\n" + "=" * 60)
    print("🔍 Testing compare-three endpoint...")
    
    try:
        response = requests.post(
            f"{base_url}/compare-three",
            json=data,
            timeout=60  # 60 second timeout for multiple models
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS: Three-way comparison completed")
            
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
            print("✅ Server is healthy")
            print(f"   Status: {health.get('status', 'unknown')}")
            print(f"   CUDA Available: {health.get('cuda_available', 'unknown')}")
            print(f"   Translation Count: {health.get('translation_count', 'unknown')}")
            print(f"   Models Loaded: {health.get('models_loaded', 'unknown')}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            
        # Models check
        response = requests.get(f"{base_url}/models", timeout=10)
        if response.status_code == 200:
            models = response.json()
            print("✅ Available models:")
            for model in models.get('models', []):
                print(f"   - {model.get('display_name')} ({model.get('name')}) - {model.get('provider')}")
        else:
            print(f"❌ Models check failed: {response.status_code}")
            
    except Exception as e:
        print(f"💥 ERROR: {str(e)}")

def test_audio_endpoint():
    """Test the audio test endpoint"""
    base_url = "http://localhost:5000"
    target_language = "french"
    test_case = "museum_tour"
    
    data = {
        "targetLanguage": target_language,
        "testCase": test_case
    }
    
    print("\n" + "=" * 60)
    print("🔍 Testing audio test endpoint...")
    
    try:
        response = requests.post(
            f"{base_url}/test-audio",
            json=data,
            timeout=120  # Longer timeout for batch processing
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS: Audio test completed")
            print(f"   Test Case: {result.get('test_case', 'N/A')}")
            print(f"   Target Language: {result.get('target_language', 'N/A')}")
            print(f"   Total Tests: {result.get('summary', {}).get('total_tests', 'N/A')}")
            print(f"   Avg MarianMT Latency: {result.get('summary', {}).get('avg_marian_latency', 'N/A')}s")
            print(f"   Avg Google Latency: {result.get('summary', {}).get('avg_google_latency', 'N/A')}s")
            print(f"   Faster Model: {result.get('summary', {}).get('faster_model', 'N/A')}")
        else:
            print(f"❌ HTTP ERROR {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"💥 ERROR: {str(e)}")

def performance_benchmark():
    """Run a performance benchmark across all models"""
    base_url = "http://localhost:5000"
    test_texts = [
        "Hello, how are you today?",
        "The weather is beautiful outside.",
        "I would like to make a reservation.",
        "Can you help me find the museum?",
        "Thank you for your assistance."
    ]
    target_language = "french"
    
    print("\n" + "=" * 60)
    print("🔍 Running performance benchmark...")
    
    # Test available models
    models_to_test = ["marian", "google", "m2m100"]
    results = {}
    
    for model in models_to_test:
        print(f"\n📊 Testing {model.upper()}...")
        model_results = []
        
        for i, text in enumerate(test_texts, 1):
            try:
                # Determine endpoint based on model
                if model == "marian":
                    endpoint = "/translate"
                    data = {"text": text, "targetLanguage": target_language, "model": "marian"}
                elif model == "google":
                    endpoint = "/translate-google"
                    data = {"text": text, "targetLanguage": target_language}
                elif model == "m2m100":
                    endpoint = "/translate-m2m100"
                    data = {"text": text, "targetLanguage": target_language}
                
                response = requests.post(f"{base_url}{endpoint}", json=data, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("status") == "success":
                        latency = result.get("latency", 0)
                        model_results.append(latency)
                        print(f"   Test {i}/5: ✅ {latency:.3f}s")
                    else:
                        print(f"   Test {i}/5: ❌ {result.get('error', 'Failed')}")
                        model_results.append(None)
                else:
                    print(f"   Test {i}/5: ❌ HTTP {response.status_code}")
                    model_results.append(None)
                    
            except Exception as e:
                print(f"   Test {i}/5: ❌ {str(e)}")
                model_results.append(None)
        
        # Calculate statistics
        valid_results = [r for r in model_results if r is not None]
        if valid_results:
            avg_latency = sum(valid_results) / len(valid_results)
            success_rate = len(valid_results) / len(test_texts) * 100
            results[model] = {
                "avg_latency": avg_latency,
                "success_rate": success_rate,
                "results": model_results
            }
            print(f"   📈 Average Latency: {avg_latency:.3f}s")
            print(f"   📈 Success Rate: {success_rate:.1f}%")
        else:
            results[model] = {"avg_latency": None, "success_rate": 0, "results": model_results}
            print("   📈 All tests failed")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 PERFORMANCE SUMMARY")
    print("=" * 60)
    
    fastest_model = None
    fastest_time = float('inf')
    most_reliable = None
    highest_success = 0
    
    for model, stats in results.items():
        if stats["avg_latency"] is not None:
            print(f"{model.upper():>10}: {stats['avg_latency']:.3f}s avg, {stats['success_rate']:.1f}% success")
            
            if stats["avg_latency"] < fastest_time:
                fastest_time = stats["avg_latency"]
                fastest_model = model
                
            if stats["success_rate"] > highest_success:
                highest_success = stats["success_rate"]
                most_reliable = model
        else:
            print(f"{model.upper():>10}: Failed all tests")
    
    if fastest_model:
        print(f"\n🏆 Fastest Model: {fastest_model.upper()} ({fastest_time:.3f}s avg)")
    if most_reliable:
        print(f"🛡️ Most Reliable: {most_reliable.upper()} ({highest_success:.1f}% success)")

if __name__ == "__main__":
    print("🧪 Translation Models Debug Tool (MADLAD Removed)")
    print("=" * 60)
    
    # Test server health first
    test_server_health()
    
    # Test individual endpoints
    test_individual_endpoints()
    
    # Test comparison endpoints
    test_compare_custom()
    test_compare_three()
    
    # Test audio endpoint
    test_audio_endpoint()
    
    # Run performance benchmark
    performance_benchmark()
    
    print("\n" + "=" * 60)
    print("🏁 Debug complete!")
    print("Available models: MarianMT, Google Translate, M2M-100")
    print("\nIf M2M-100 shows timeouts or memory errors,")
    print("it might be too large for your system.")