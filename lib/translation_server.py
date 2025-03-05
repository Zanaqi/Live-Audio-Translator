# File: lib/translation_server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import MarianMTModel, MarianTokenizer
import torch
import os
import time
from threading import Lock
from functools import lru_cache

app = Flask(__name__)
CORS(app)

# Global variables to store models and tokenizers
models = {}
tokenizers = {}
model_locks = {}

class TranslationCache:
    def __init__(self, max_size=1000):
        self.cache = {}
        self.max_size = max_size
        self.lock = Lock()

    def get(self, key):
        with self.lock:
            return self.cache.get(key)

    def set(self, key, value):
        with self.lock:
            if len(self.cache) >= self.max_size:
                # Remove oldest entry
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
            self.cache[key] = value


translation_cache = TranslationCache()


def get_model_name(target_language):
    language_map = {
        'French': 'Helsinki-NLP/opus-mt-en-fr',
        'Spanish': 'Helsinki-NLP/opus-mt-en-es',
        'German': 'Helsinki-NLP/opus-mt-en-de',
        'Italian': 'Helsinki-NLP/opus-mt-en-it',
        'Japanese': 'Helsinki-NLP/opus-mt-en-jap',
        'Chinese': 'Helsinki-NLP/opus-mt-en-zh'  # Added Chinese support
    }
    return language_map.get(target_language)


def load_model(target_language):
    """Load model and tokenizer with improved error handling and locking"""
    if target_language not in models:
        model_name = get_model_name(target_language)
        if not model_name:
            return None, None

        # Create lock if it doesn't exist
        if target_language not in model_locks:
            model_locks[target_language] = Lock()

        with model_locks[target_language]:
            try:
                # Check again in case another thread loaded while waiting
                if target_language not in models:
                    tokenizer = MarianTokenizer.from_pretrained(model_name)
                    model = MarianMTModel.from_pretrained(model_name)
                    
                    # Move model to GPU if available
                    if torch.cuda.is_available():
                        model = model.cuda()
                    
                    models[target_language] = model
                    tokenizers[target_language] = tokenizer
                    print(f"Loaded model for {target_language}")

            except Exception as e:
                print(f"Error loading model for {target_language}: {str(e)}")
                return None, None

    return models[target_language], tokenizers[target_language]


def preprocess_text(text):
    """Clean and prepare text for translation"""
    # Remove excessive whitespace
    text = ' '.join(text.split())
    # Truncate if too long
    max_length = 512
    if len(text.split()) > max_length:
        text = ' '.join(text.split()[:max_length])
    return text


def generate_cache_key(text, target_language, context=None):
    """Generate a unique cache key"""
    key = f"{text}:{target_language}"
    if context:
        key += f":{context}"
    return key


@lru_cache(maxsize=1000)
def translate_text(text, target_language, context=None):
    """Translate text with caching and error handling"""
    start_time = time.time()
    
    try:
        # Check cache first
        cache_key = generate_cache_key(text, target_language, context)
        cached_result = translation_cache.get(cache_key)
        if cached_result:
            return {"translation": cached_result, "cached": True}

        # Load model and tokenizer
        model, tokenizer = load_model(target_language)
        if not model or not tokenizer:
            return {"error": f"Failed to load model for {target_language}"}

        # Preprocess text
        text = preprocess_text(text)
        if context:
            text = f"{context} {text}"

        # Prepare input
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}

        # Generate translation
        with torch.no_grad():
            translated = model.generate(**inputs, num_beams=4, length_penalty=0.6)

        # Decode translation
        translation = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]

        # Cache result
        translation_cache.set(cache_key, translation)

        # Calculate processing time
        processing_time = time.time() - start_time
        
        return {
            "translation": translation,
            "processingTime": processing_time,
            "cached": False
        }

    except Exception as e:
        print(f"Translation error: {str(e)}")
        return {"error": f"Translation failed: {str(e)}"}
    

@app.route('/translate', methods=['POST'])
def handle_translation():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'French')
        context = data.get('context', '')

        if not text:
            return jsonify({"error": "No text provided"}), 400

        result = translate_text(text, target_language, context)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


if __name__ == '__main__':
    print("Starting translation server on port 5000...")
    app.run(port=5000, debug=False, threaded=True)