from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import MarianMTModel, MarianTokenizer
import torch
from googletrans import Translator
import time
from pathlib import Path
import traceback

app = Flask(__name__)
CORS(app)

# Initialize Google Translator
google_translator = Translator()

# Audio test data storage
AUDIO_TEST_DIR = Path("audio_tests")
AUDIO_TEST_DIR.mkdir(exist_ok=True)

def get_model_name(target_language):
    """Get the correct model name for the target language with Malay support and fallbacks"""
    target_language = target_language.lower().strip()
    
    # Primary model mapping with verified models
    language_map = {
        "french": "Helsinki-NLP/opus-mt-en-fr",
        "spanish": "Helsinki-NLP/opus-mt-en-es", 
        "german": "Helsinki-NLP/opus-mt-en-de",
        "italian": "Helsinki-NLP/opus-mt-en-it",
        "japanese": "Helsinki-NLP/opus-mt-en-jap",
        "chinese": "Helsinki-NLP/opus-mt-en-zh",
        "portuguese": "Helsinki-NLP/opus-mt-en-roa",  # Romance languages
        "dutch": "Helsinki-NLP/opus-mt-en-nl",
        "korean": "Helsinki-NLP/opus-mt-en-ko",
        "thai": "Helsinki-NLP/opus-mt-en-th",
        "vietnamese": "Helsinki-NLP/opus-mt-en-vi",
        "indonesian": "Helsinki-NLP/opus-mt-en-id",
    }
    
    # Malay/Bahasa Melayu fallback options (try multiple model names)
    malay_models = [
        "Helsinki-NLP/opus-mt-en-ms",      # Standard Malay
        "Helsinki-NLP/opus-mt-en-msa",     # Alternative Malay code
        "Helsinki-NLP/opus-mt-en-zlm",     # Malay (individual language)
        "Helsinki-NLP/opus-mt-en-mul",     # Multilingual model
        "Helsinki-NLP/opus-mt-en-id",      # Indonesian as fallback (similar to Malay)
    ]
    
    if target_language in ["malay", "bahasa", "malaysian", "bahasa_melayu"]:
        return malay_models  # Return list for fallback handling
    
    model_name = language_map.get(target_language)
    if not model_name:
        print(f"Warning: Unknown language '{target_language}', falling back to French")
        model_name = language_map["french"]
    
    print(f"Selected model '{model_name}' for language '{target_language}'")
    return model_name

def get_google_language_code(target_language):
    """Get Google Translate language code"""
    language_map = {
        "french": "fr",
        "spanish": "es", 
        "german": "de",
        "italian": "it",
        "japanese": "ja",
        "chinese": "zh",
        "malay": "ms",  # Malay support in Google Translate
        "bahasa": "ms",
        "malaysian": "ms",
        "portuguese": "pt",
        "dutch": "nl",
        "korean": "ko",
        "thai": "th",
        "vietnamese": "vi",
        "indonesian": "id",
    }
    
    return language_map.get(target_language.lower(), "fr")

def load_marian_model(target_language):
    """Load MarianMT model and tokenizer with fallback support for Malay"""
    try:
        print(f"Loading MarianMT model for language: {target_language}")
        model_names = get_model_name(target_language)
        
        # Handle Malay with multiple fallback options
        if isinstance(model_names, list):
            print(f"Trying multiple models for {target_language}: {model_names}")
            
            for model_name in model_names:
                try:
                    print(f"Attempting to load: {model_name}")
                    tokenizer = MarianTokenizer.from_pretrained(model_name)
                    model = MarianMTModel.from_pretrained(model_name)
                    
                    if torch.cuda.is_available():
                        model = model.cuda()
                        print(f"Successfully loaded {model_name} with CUDA")
                    else:
                        print(f"Successfully loaded {model_name} with CPU")
                    
                    return model, tokenizer
                    
                except Exception as e:
                    print(f"Failed to load {model_name}: {str(e)}")
                    continue
            
            # If all Malay models fail, raise a specific error
            raise ValueError(f"All Malay models failed to load. Available models tried: {model_names}")
        
        # Handle single model (non-Malay languages)
        else:
            model_name = model_names
            if not model_name:
                raise ValueError(f"Unsupported language: {target_language}")
            
            tokenizer = MarianTokenizer.from_pretrained(model_name)
            model = MarianMTModel.from_pretrained(model_name)
            
            if torch.cuda.is_available():
                model = model.cuda()
                print("Using CUDA for MarianMT model")
            else:
                print("Using CPU for MarianMT model")
            
            return model, tokenizer
            
    except Exception as e:
        print(f"Error loading MarianMT model for {target_language}: {str(e)}")
        return None, None

def translate_with_marian(text, target_language):
    """Translate using MarianMT model with enhanced error handling and fallbacks"""
    try:
        model, tokenizer = load_marian_model(target_language)
        if not model or not tokenizer:
            # For Malay, provide specific fallback message
            if target_language.lower() in ["malay", "bahasa", "malaysian", "bahasa_melayu"]:
                raise ValueError("MarianMT models for Malay are not available. Using Google Translate only for Malay translations.")
            else:
                raise ValueError(f"Failed to load MarianMT model for {target_language}")
        
        # Tokenize and translate
        inputs = tokenizer(
            text, return_tensors="pt", padding=True, truncation=True, max_length=512
        )
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        
        with torch.no_grad():
            translated = model.generate(**inputs)
        
        # Decode translation
        translation = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        return translation
        
    except Exception as e:
        print(f"MarianMT translation error: {str(e)}")
        raise

def translate_with_google(text, target_language):
    """Translate using Google Translate API"""
    try:
        lang_code = get_google_language_code(target_language)
        result = google_translator.translate(text, dest=lang_code)
        return result.text
        
    except Exception as e:
        print(f"Google Translate error: {str(e)}")
        raise

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        model_type = data.get('model', 'marian')  # Default to MarianMT
        
        print(f"Translating: '{text}' to {target_language} using {model_type}")
        
        start_time = time.time()
        
        if model_type.lower() == 'google':
            translation = translate_with_google(text, target_language)
        else:  # Default to MarianMT
            translation = translate_with_marian(text, target_language)
        
        end_time = time.time()
        latency = end_time - start_time
        
        return jsonify({
            "translation": translation,
            "source_text": text,
            "target_language": target_language,
            "model": model_type,
            "latency": round(latency, 3)
        })
        
    except Exception as e:
        print(f"Translation error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/compare', methods=['POST'])
def compare_translations():
    """Compare translations from both models with enhanced error handling"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        
        print(f"Comparing translations for: '{text}' to {target_language}")
        
        # Initialize results
        marian_translation = None
        marian_time = 0
        marian_error = None
        
        google_translation = None
        google_time = 0
        google_error = None
        
        # Try MarianMT translation
        try:
            start_time = time.time()
            marian_translation = translate_with_marian(text, target_language)
            marian_time = time.time() - start_time
        except Exception as e:
            marian_error = str(e)
            print(f"MarianMT failed: {marian_error}")
        
        # Try Google Translate
        try:
            start_time = time.time()
            google_translation = translate_with_google(text, target_language)
            google_time = time.time() - start_time
        except Exception as e:
            google_error = str(e)
            print(f"Google Translate failed: {google_error}")
        
        # If both failed, return error
        if marian_translation is None and google_translation is None:
            return jsonify({
                "error": f"Both translation services failed. MarianMT: {marian_error}, Google: {google_error}"
            }), 500
        
        # Build response
        response = {
            "source_text": text,
            "target_language": target_language,
        }
        
        # Add MarianMT results
        if marian_translation:
            response["marian"] = {
                "translation": marian_translation,
                "latency": round(marian_time, 3),
                "model": "MarianMT",
                "status": "success"
            }
        else:
            response["marian"] = {
                "translation": None,
                "latency": 0,
                "model": "MarianMT",
                "status": "failed",
                "error": marian_error
            }
        
        # Add Google results
        if google_translation:
            response["google"] = {
                "translation": google_translation,
                "latency": round(google_time, 3),
                "model": "Google Translate",
                "status": "success"
            }
        else:
            response["google"] = {
                "translation": None,
                "latency": 0,
                "model": "Google Translate",
                "status": "failed",
                "error": google_error
            }
        
        # Add comparison only if both succeeded
        if marian_translation and google_translation:
            response["comparison"] = {
                "are_same": marian_translation.lower().strip() == google_translation.lower().strip(),
                "length_diff": len(google_translation) - len(marian_translation),
                "speed_diff": round(google_time - marian_time, 3)
            }
        else:
            response["comparison"] = {
                "note": "Comparison unavailable - one or both models failed"
            }
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Comparison error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/test-audio', methods=['POST'])
def test_audio_translation():
    """Test translation with predefined audio test cases"""
    try:
        data = request.get_json()
        target_language = data.get('targetLanguage', 'malay')
        test_case = data.get('testCase', 'museum_tour')
        
        # Predefined test cases
        test_cases = {
            "museum_tour": [
                "Welcome to the National Museum. This ancient artifact was created in the 15th century.",
                "This painting by Leonardo da Vinci represents the Renaissance period.",
                "The sculpture was discovered in Egypt and dates back to 3000 BC.",
                "This exhibition showcases traditional Malaysian art and culture.",
                "The museum houses over 5000 historical artifacts from Southeast Asia."
            ],
            "guided_tour": [
                "Follow me as we explore this historic building.",
                "This room was used by the royal family for important ceremonies.",
                "The architecture reflects traditional Malay design elements.",
                "Please be careful with the stairs as they are quite old.",
                "Our next stop will be the heritage garden behind the palace."
            ],
            "general": [
                "Hello, how are you today?",
                "Can you help me find the nearest restaurant?",
                "What time does the tour start?",
                "Thank you for your assistance.",
                "I would like to learn more about Malaysian culture."
            ]
        }
        
        test_texts = test_cases.get(test_case, test_cases["general"])
        results = []
        
        for text in test_texts:
            # Compare both models for each test case
            start_time = time.time()
            marian_translation = translate_with_marian(text, target_language)
            marian_time = time.time() - start_time
            
            start_time = time.time()
            google_translation = translate_with_google(text, target_language)
            google_time = time.time() - start_time
            
            results.append({
                "original": text,
                "marian": {
                    "translation": marian_translation,
                    "latency": round(marian_time, 3)
                },
                "google": {
                    "translation": google_translation,
                    "latency": round(google_time, 3)
                }
            })
        
        # Calculate average performance
        avg_marian_time = sum(r["marian"]["latency"] for r in results) / len(results)
        avg_google_time = sum(r["google"]["latency"] for r in results) / len(results)
        
        return jsonify({
            "test_case": test_case,
            "target_language": target_language,
            "results": results,
            "summary": {
                "total_tests": len(results),
                "avg_marian_latency": round(avg_marian_time, 3),
                "avg_google_latency": round(avg_google_time, 3),
                "faster_model": "MarianMT" if avg_marian_time < avg_google_time else "Google Translate"
            }
        })
        
    except Exception as e:
        print(f"Audio test error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/languages', methods=['GET'])
def get_supported_languages():
    """Get list of supported languages"""
    return jsonify({
        "languages": [
            {"code": "french", "name": "French", "native": "Français"},
            {"code": "spanish", "name": "Spanish", "native": "Español"},
            {"code": "german", "name": "German", "native": "Deutsch"},
            {"code": "italian", "name": "Italian", "native": "Italiano"},
            {"code": "japanese", "name": "Japanese", "native": "日本語"},
            {"code": "chinese", "name": "Chinese", "native": "中文"},
            {"code": "malay", "name": "Malay", "native": "Bahasa Melayu"},
            {"code": "portuguese", "name": "Portuguese", "native": "Português"},
            {"code": "dutch", "name": "Dutch", "native": "Nederlands"},
            {"code": "korean", "name": "Korean", "native": "한국어"},
            {"code": "thai", "name": "Thai", "native": "ไทย"},
            {"code": "vietnamese", "name": "Vietnamese", "native": "Tiếng Việt"},
            {"code": "indonesian", "name": "Indonesian", "native": "Bahasa Indonesia"}
        ]
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "models": ["MarianMT", "Google Translate"],
        "cuda_available": torch.cuda.is_available()
    })

if __name__ == "__main__":
    print("Starting enhanced translation server on port 5000...")
    print("Features: MarianMT + Google Translate comparison, Malay support, Audio testing")
    app.run(port=5000, debug=True)