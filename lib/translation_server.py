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

def get_model_name(target_language):
    """Get the correct model name for the target language"""
    target_language = target_language.lower().strip()
    
    language_map = {
        'french': 'Helsinki-NLP/opus-mt-en-fr',
        'spanish': 'Helsinki-NLP/opus-mt-en-es',
        'german': 'Helsinki-NLP/opus-mt-en-de',
        'italian': 'Helsinki-NLP/opus-mt-en-it',
        'japanese': 'Helsinki-NLP/opus-mt-en-jap',
        'chinese': 'Helsinki-NLP/opus-mt-en-zh'
    }
    
    model_name = language_map.get(target_language)
    if not model_name:
        print(f"Warning: Unknown language '{target_language}', falling back to French")
        model_name = language_map['french']
    
    print(f"Selected model '{model_name}' for language '{target_language}'")
    return model_name

@app.route('/translate', methods=['POST'])
def handle_translation():
    try:
        print("Received translation request")
        data = request.get_json()
        print("Request data:", data)
        
        if not data:
            return jsonify({"error": "No data provided"}), 400

        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'French')

        print(f"Processing translation request: '{text}' to {target_language}")

        if not text:
            return jsonify({"error": "No text provided"}), 400

        try:
            result = translate_text(text, target_language)
            print("Translation result:", result)
            return jsonify(result)
        except Exception as e:
            print("Translation error:", str(e))
            return jsonify({"error": f"Translation failed: {str(e)}"}), 500

    except Exception as e:
        print("Server error:", str(e))
        return jsonify({"error": f"Server error: {str(e)}"}), 500

def load_model(target_language):
    """Load model and tokenizer"""
    try:
        print(f"Loading model for language: {target_language}")
        model_name = get_model_name(target_language)
        
        if not model_name:
            raise ValueError(f"Unsupported language: {target_language}")
        
        tokenizer = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
        
        if torch.cuda.is_available():
            model = model.cuda()
            print("Using CUDA for model")
        else:
            print("Using CPU for model")
        
        return model, tokenizer
    except Exception as e:
        print(f"Error loading model for {target_language}: {str(e)}")
        return None, None

@lru_cache(maxsize=1000)
def translate_text(text, target_language):
    try:
        print(f"Translating text: '{text}' to {target_language}")
        
        # Load model and tokenizer
        model, tokenizer = load_model(target_language)
        if not model or not tokenizer:
            raise ValueError(f"Failed to load model for {target_language}")

        # Tokenize and translate
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}

        with torch.no_grad():
            translated = model.generate(**inputs)
            
        # Decode translation
        translation = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        print(f"Translation completed: '{translation}'")
        
        return {
            "translation": translation,
            "source_text": text,
            "target_language": target_language
        }

    except Exception as e:
        print(f"Translation error: {str(e)}")
        raise

if __name__ == '__main__':
    print("Starting translation server on port 5000...")
    app.run(port=5000, debug=True)