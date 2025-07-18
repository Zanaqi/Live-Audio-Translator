from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import MarianMTModel, MarianTokenizer
import torch
import time
import os
from pathlib import Path
import traceback
from openai import OpenAI

app = Flask(__name__)
CORS(app)

# Audio test data storage
AUDIO_TEST_DIR = Path("audio_tests")
AUDIO_TEST_DIR.mkdir(exist_ok=True)

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")  # Make sure this environment variable is set
)

def get_model_name(target_language):
    """Get the correct model name for the target language with fallbacks"""
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
        "tamil": "Helsinki-NLP/opus-mt-en-ta",
    }
    
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
        "portuguese": "pt",
        "dutch": "nl",
        "korean": "ko",
        "thai": "th",
        "vietnamese": "vi",
        "indonesian": "id",
        "tamil": "ta",
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
        from googletrans import Translator
        google_translator = Translator()
        
        lang_code = get_google_language_code(target_language)
        result = google_translator.translate(text, dest=lang_code)
        return result.text
        
    except Exception as e:
        print(f"Google Translate error: {str(e)}")
        raise

def translate_with_chatgpt(text, target_language):
    """
    Translate text using ChatGPT with the new OpenAI v1.0.0+ API
    """
    start_time = time.time()
    
    try:
        # Language mapping for better prompts
        language_prompts = {
            'malay': 'Malay (Bahasa Melayu)',
            'chinese': 'Chinese (Simplified)',
            'tamil': 'Tamil',
            'french': 'French',
            'spanish': 'Spanish',
            'german': 'German',
            'japanese': 'Japanese',
            'korean': 'Korean'
        }
        
        target_lang_name = language_prompts.get(target_language.lower(), target_language)
        
        # Create chat completion using new API
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",  # or "gpt-4" if you have access
            messages=[
                {
                    "role": "system", 
                    "content": f"You are a professional translator. Translate the given English text to {target_lang_name}. Provide only the translation without any explanations, comments, or additional text."
                },
                {
                    "role": "user", 
                    "content": f"Translate this text to {target_lang_name}: {text}"
                }
            ],
            max_tokens=500,
            temperature=0.1,  # Low temperature for consistent translations
            timeout=30  # 30 second timeout
        )
        
        end_time = time.time()
        latency = end_time - start_time
        
        # Extract translation from response
        translation = response.choices[0].message.content.strip()
        
        return {
            "translation": translation,
            "latency": latency,
            "model": "ChatGPT",
            "status": "success",
            "error": None
        }
        
    except Exception as e:
        end_time = time.time()
        latency = end_time - start_time
        
        return {
            "translation": None,
            "latency": latency,
            "model": "ChatGPT",
            "status": "failed",
            "error": str(e)
        }

def apply_context_adaptation(
    text, base_translation, source_lang, target_lang, context_info
):
    """Apply context-aware adaptations to the base translation"""
    adapted_translation = base_translation

    # Apply domain-specific adaptations
    if context_info and "domain" in context_info:
        domain = context_info["domain"]
        if domain == "museum_tour" and target_lang == "fr":
            # French museum context adaptations
            adapted_translation = adapted_translation.replace("pièce", "œuvre")
            adapted_translation = adapted_translation.replace("montrer", "présenter")

        elif domain == "art_gallery" and target_lang == "fr":
            # French art gallery context adaptations
            adapted_translation = adapted_translation.replace("pièce", "tableau")

    # Apply name completions
    if context_info and "key_references" in context_info:
        references = context_info["key_references"]
        for name, confidence in references.items():
            if confidence > 0.7:
                if (
                    "leonardo" in adapted_translation.lower()
                    and "leonardo" in name.lower()
                ):
                    adapted_translation = adapted_translation.replace(
                        "Leonardo", "Leonardo da Vinci"
                    )

    return adapted_translation

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        model_type = data.get('model', 'marian')  # Default to MarianMT
        context_info = data.get('context', None)
        
        print(f"Translating: '{text}' to {target_language} using {model_type}")
        
        start_time = time.time()
        
        if model_type.lower() == 'google':
            translation = translate_with_google(text, target_language)
        else:  # Default to MarianMT
            translation = translate_with_marian(text, target_language)
        
        # Apply context adaptation if provided
        if context_info:
            translation = apply_context_adaptation(
                text, translation, "en", target_language.lower(), context_info
            )
        
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

@app.route('/translate-chatgpt', methods=['POST'])
def translate_chatgpt():
    """Translate using ChatGPT/OpenAI API"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        
        start_time = time.time()
        translation = translate_with_chatgpt(text, target_language)
        end_time = time.time()
        latency = end_time - start_time
        
        return jsonify({
            "translation": translation,
            "source_text": text,
            "target_language": target_language,
            "model": "ChatGPT",
            "latency": round(latency, 3)
        })
        
    except Exception as e:
        print(f"ChatGPT translation error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/compare', methods=['POST'])
def compare_translations():
    """Compare translations from MarianMT and Google Translate with enhanced error handling"""
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

@app.route('/compare-three', methods=['POST'])
def compare_three_models():
    """Compare translations from all three models"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        
        print(f"Comparing all three models for: '{text}' to {target_language}")
        
        # Initialize results
        results = {}
        
        # Try MarianMT translation
        try:
            start_time = time.time()
            marian_translation = translate_with_marian(text, target_language)
            marian_time = time.time() - start_time
            results["marian"] = {
                "translation": marian_translation,
                "latency": round(marian_time, 3),
                "model": "MarianMT",
                "status": "success"
            }
        except Exception as e:
            results["marian"] = {
                "translation": None,
                "latency": 0,
                "model": "MarianMT",
                "status": "failed",
                "error": str(e)
            }
        
        # Try Google Translate
        try:
            start_time = time.time()
            google_translation = translate_with_google(text, target_language)
            google_time = time.time() - start_time
            results["google"] = {
                "translation": google_translation,
                "latency": round(google_time, 3),
                "model": "Google Translate",
                "status": "success"
            }
        except Exception as e:
            results["google"] = {
                "translation": None,
                "latency": 0,
                "model": "Google Translate",
                "status": "failed",
                "error": str(e)
            }
        
        # Try ChatGPT translation
        try:
            start_time = time.time()
            chatgpt_translation = translate_with_chatgpt(text, target_language)
            chatgpt_time = time.time() - start_time
            results["chatgpt"] = {
                "translation": chatgpt_translation,
                "latency": round(chatgpt_time, 3),
                "model": "ChatGPT",
                "status": "success"
            }
        except Exception as e:
            results["chatgpt"] = {
                "translation": None,
                "latency": 0,
                "model": "ChatGPT",
                "status": "failed",
                "error": str(e)
            }
        
        # Calculate comparisons between successful translations
        successful_models = [k for k, v in results.items() if v["status"] == "success"]
        
        comparison = {
            "successful_models": successful_models,
            "total_models": len(results),
            "success_rate": len(successful_models) / len(results)
        }
        
        # Add pairwise comparisons if we have successful translations
        if len(successful_models) >= 2:
            comparison["pairwise"] = {}
            for i, model1 in enumerate(successful_models):
                for model2 in successful_models[i+1:]:
                    trans1 = results[model1]["translation"]
                    trans2 = results[model2]["translation"]
                    
                    comparison["pairwise"][f"{model1}_vs_{model2}"] = {
                        "are_same": trans1.lower().strip() == trans2.lower().strip(),
                        "length_diff": len(trans2) - len(trans1),
                        "speed_diff": round(results[model2]["latency"] - results[model1]["latency"], 3)
                    }
        
        return jsonify({
            "source_text": text,
            "target_language": target_language,
            "results": results,
            "comparison": comparison
        })
        
    except Exception as e:
        print(f"Three-model comparison error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/compare-custom', methods=['POST'])
def compare_custom_models():
    """Compare translations from selected models"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data or 'targetLanguage' not in data or 'models' not in data:
            return jsonify({"error": "Missing required fields: text, targetLanguage, models"}), 400
        
        text = data['text']
        target_language = data['targetLanguage']
        selected_models = data['models']  # List of model names to compare
        
        print(f"Comparing selected models {selected_models} for: '{text}' to {target_language}")
        
        results = {}
        
        # Translate with each selected model
        for model in selected_models:
            if model == 'marian':
                try:
                    start_time = time.time()
                    translation = translate_with_marian(text, target_language)
                    latency = time.time() - start_time
                    results["marian"] = {
                        "translation": translation,
                        "latency": round(latency, 3),
                        "model": "MarianMT",
                        "status": "success"
                    }
                except Exception as e:
                    results["marian"] = {
                        "translation": None,
                        "latency": 0,
                        "model": "MarianMT",
                        "status": "failed",
                        "error": str(e)
                    }
            
            elif model == 'google':
                try:
                    start_time = time.time()
                    translation = translate_with_google(text, target_language)
                    latency = time.time() - start_time
                    results["google"] = {
                        "translation": translation,
                        "latency": round(latency, 3),
                        "model": "Google Translate",
                        "status": "success"
                    }
                except Exception as e:
                    results["google"] = {
                        "translation": None,
                        "latency": 0,
                        "model": "Google Translate",
                        "status": "failed",
                        "error": str(e)
                    }
            
            elif model == 'chatgpt':
                try:
                    start_time = time.time()
                    translation = translate_with_chatgpt(text, target_language)
                    latency = time.time() - start_time
                    results["chatgpt"] = {
                        "translation": translation,
                        "latency": round(latency, 3),
                        "model": "ChatGPT",
                        "status": "success"
                    }
                except Exception as e:
                    results["chatgpt"] = {
                        "translation": None,
                        "latency": 0,
                        "model": "ChatGPT",
                        "status": "failed",
                        "error": str(e)
                    }
        
        # Calculate success metrics
        successful_models = [k for k, v in results.items() if v["status"] == "success"]
        
        return jsonify({
            "source_text": text,
            "target_language": target_language,
            "selected_models": selected_models,
            "results": results,
            "successful_models": successful_models,
            "success_rate": len(successful_models) / len(selected_models) if selected_models else 0
        })
        
    except Exception as e:
        print(f"Custom model comparison error: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/test-audio', methods=['POST'])
def test_audio_translation():
    """Test translation with predefined audio test cases"""
    try:
        data = request.get_json()
        target_language = data.get('targetLanguage', 'french')
        test_case = data.get('testCase', 'museum_tour')
        
        # Predefined test cases
        test_cases = {
            "museum_tour": [
                "Welcome to the National Museum. This ancient artifact was created in the 15th century.",
                "This painting by Leonardo da Vinci represents the Renaissance period.",
                "The sculpture was discovered in Egypt and dates back to 3000 BC.",
                "This exhibition showcases traditional European art and culture.",  
                "The museum houses over 5000 historical artifacts from around the world."  
            ],
            "guided_tour": [
                "Follow me as we explore this historic building.",
                "This room was used by the royal family for important ceremonies.",
                "The architecture reflects traditional European design elements.", 
                "Please be careful with the stairs as they are quite old.",
                "Our next stop will be the heritage garden behind the palace."
            ],
            "general": [
                "Hello, how are you today?",
                "Can you help me find the nearest restaurant?",
                "What time does the tour start?",
                "Thank you for your assistance.",
                "I would like to learn more about local culture."  # Changed from Malaysian culture
            ]
        }
        
        test_texts = test_cases.get(test_case, test_cases["general"])
        results = []
        
        for text in test_texts:
            # Compare both models for each test case
            start_time = time.time()
            try:
                marian_translation = translate_with_marian(text, target_language)
                marian_time = time.time() - start_time
            except Exception:
                marian_translation = "Failed"
                marian_time = 0
            
            start_time = time.time()
            try:
                google_translation = translate_with_google(text, target_language)
                google_time = time.time() - start_time
            except Exception:
                google_translation = "Failed"
                google_time = 0
            
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
        valid_marian = [r["marian"]["latency"] for r in results if r["marian"]["translation"] != "Failed"]
        valid_google = [r["google"]["latency"] for r in results if r["google"]["translation"] != "Failed"]
        
        avg_marian_time = sum(valid_marian) / len(valid_marian) if valid_marian else 0
        avg_google_time = sum(valid_google) / len(valid_google) if valid_google else 0
        
        return jsonify({
            "test_case": test_case,
            "target_language": target_language,
            "results": results,
            "summary": {
                "total_tests": len(results),
                "avg_marian_latency": round(avg_marian_time, 3),
                "avg_google_latency": round(avg_google_time, 3),
                "faster_model": "MarianMT" if avg_marian_time < avg_google_time and avg_marian_time > 0 else "Google Translate"
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
            {"code": "tamil", "name": "Tamil", "native": "தமிழ்"},
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
        "models": ["MarianMT", "Google Translate", "ChatGPT"],
        "cuda_available": torch.cuda.is_available()
    })

if __name__ == "__main__":
    print("Starting enhanced translation server on port 5000...")
    print("Features: MarianMT + Google Translate + ChatGPT comparison, Multi-language support, Audio testing")
    print("Models available: MarianMT, Google Translate, ChatGPT")
    print("Endpoints: /translate, /compare, /compare-three, /compare-custom, /test-audio, /languages, /health")
    app.run(port=5000, debug=True)