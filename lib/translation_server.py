# File: lib/translation_server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import MarianMTModel, MarianTokenizer
import torch
import os

app = Flask(__name__)
CORS(app)

# Global variables to store models and tokenizers
models = {}
tokenizers = {}

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
    """Load model and tokenizer for the target language if not already loaded"""
    if target_language not in models:
        model_name = get_model_name(target_language)
        try:
            tokenizer = MarianTokenizer.from_pretrained(model_name)
            model = MarianMTModel.from_pretrained(model_name)
            models[target_language] = model
            tokenizers[target_language] = tokenizer
            print(f"Loaded model for {target_language}")
        except Exception as e:
            print(f"Error loading model for {target_language}: {str(e)}")
            return None, None
    
    return models[target_language], tokenizers[target_language]

def translate_text(text, target_language, context=None):
    """Translate text to target language"""
    model, tokenizer = load_model(target_language)
    
    if not model or not tokenizer:
        return {"error": f"Failed to load model for {target_language}"}

    try:
        # Combine context with current text if available
        input_text = text
        if context:
            input_text = f"{context} {text}"

        # Tokenize and translate
        inputs = tokenizer(input_text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        
        with torch.no_grad():
            translated = model.generate(**inputs)
        
        # Decode the translation
        translation = tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
        return {"translation": translation}

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
    app.run(port=5000, debug=True)