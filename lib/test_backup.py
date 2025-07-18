import time
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from transformers import (
    MarianMTModel, 
    MarianTokenizer,
    M2M100ForConditionalGeneration, 
    M2M100Tokenizer
)
from googletrans import Translator
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

class TranslationService:
    """Translation service"""
    
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        # Model instances (lazy loading)
        self.marian_models = {}  # Cache for different language pairs
        self.m2m100_model = None
        self.m2m100_tokenizer = None
        self.google_translator = None
        
        self.marian_lang_codes = {
            'chinese': 'zh',
            'tamil': 'ta',
            'french': 'fr',
            'spanish': 'es',
            'german': 'de',
            'japanese': 'ja',
            'korean': 'ko'
        }
        
        self.m2m100_lang_codes = {
            'chinese': 'zh',
            'tamil': 'ta',
            'french': 'fr',
            'spanish': 'es',
            'german': 'de',
            'japanese': 'ja',
            'korean': 'ko',
            'english': 'en'
        }
        
        # Performance tracking
        self.translation_count = 0
        self.start_time = datetime.now()
    
    def get_marian_model_name(self, target_language: str) -> str:
        """Get the appropriate MarianMT model for target language"""
        marian_models = {
            'chinese': 'Helsinki-NLP/opus-mt-en-zh',
            'tamil': 'Helsinki-NLP/opus-mt-en-mul',  # Multilingual for Tamil
            'french': 'Helsinki-NLP/opus-mt-en-fr',
            'spanish': 'Helsinki-NLP/opus-mt-en-es',
            'german': 'Helsinki-NLP/opus-mt-en-de',
            'japanese': 'Helsinki-NLP/opus-mt-en-jap',
            'korean': 'Helsinki-NLP/opus-mt-en-ko'
        }
        
        return marian_models.get(target_language.lower(), 'Helsinki-NLP/opus-mt-en-mul')
    
    def load_marian_model(self, target_language: str):
        """Load MarianMT model for specific language pair"""
        if target_language not in self.marian_models:
            try:
                model_name = self.get_marian_model_name(target_language)
                logger.info(f"Loading MarianMT model: {model_name}")
                
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                model = MarianMTModel.from_pretrained(model_name)
                
                if torch.cuda.is_available():
                    model = model.to(self.device)
                
                self.marian_models[target_language] = {
                    'model': model,
                    'tokenizer': tokenizer,
                    'model_name': model_name
                }
                
                logger.info(f"MarianMT model loaded for {target_language}")
                
            except Exception as e:
                logger.error(f"Failed to load MarianMT model for {target_language}: {e}")
                raise
    
    def load_m2m100_model(self):
        """Load M2M-100 model (Facebook's multilingual model)"""
        if self.m2m100_model is None:
            try:
                logger.info("Loading M2M-100 model...")
                # Using the 418M model (smaller, faster)
                model_name = "facebook/m2m100_418M"
                
                self.m2m100_tokenizer = M2M100Tokenizer.from_pretrained(model_name)
                self.m2m100_model = M2M100ForConditionalGeneration.from_pretrained(model_name)
                
                if torch.cuda.is_available():
                    self.m2m100_model = self.m2m100_model.to(self.device)
                
                logger.info("M2M-100 model loaded successfully")
                
            except Exception as e:
                logger.error(f"Failed to load M2M-100 model: {e}")
                raise
    
    def load_google_translator(self):
        """Initialize Google Translate service"""
        if self.google_translator is None:
            try:
                self.google_translator = Translator()
                logger.info("Google Translator initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Google Translator: {e}")
                raise
    
    def translate_with_marian(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using MarianMT"""
        start_time = time.time()
        
        try:
            self.load_marian_model(target_language)
            
            model_data = self.marian_models[target_language]
            model = model_data['model']
            tokenizer = model_data['tokenizer']
            
            # Tokenize input
            inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
            if torch.cuda.is_available():
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate translation
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_length=512,
                    num_beams=4,
                    early_stopping=True,
                    do_sample=False
                )
            
            # Decode translation
            translation = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
                "latency": latency,
                "model": "MarianMT",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": None,
                "latency": latency,
                "model": "MarianMT",
                "status": "failed",
                "error": str(e)
            }

    def translate_with_m2m100(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using M2M-100"""
        start_time = time.time()
        
        try:
            self.load_m2m100_model()
            
            # Get language code
            tgt_lang = self.m2m100_lang_codes.get(target_language.lower())
            
            if not tgt_lang:
                return {
                    "translation": None,
                    "latency": time.time() - start_time,
                    "model": "M2M-100",
                    "status": "failed",
                    "error": f"Unsupported language: {target_language}"
                }
            
            # Set target language
            self.m2m100_tokenizer.src_lang = "en"
            
            # Tokenize input
            inputs = self.m2m100_tokenizer(
                text, 
                return_tensors="pt", 
                padding=True, 
                truncation=True,
                max_length=512
            )
            
            if torch.cuda.is_available():
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate translation
            with torch.no_grad():
                generated_tokens = self.m2m100_model.generate(
                    **inputs, 
                    forced_bos_token_id=self.m2m100_tokenizer.get_lang_id(tgt_lang),
                    max_length=512,
                    num_beams=4,
                    early_stopping=True,
                    do_sample=False
                )
            
            # Decode translation
            translation = self.m2m100_tokenizer.batch_decode(
                generated_tokens, 
                skip_special_tokens=True
            )[0]
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
                "latency": latency,
                "model": "M2M-100",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": None,
                "latency": latency,
                "model": "M2M-100",
                "status": "failed",
                "error": str(e)
            }
    
    def translate_with_google(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using Google Translate"""
        start_time = time.time()
        
        try:
            self.load_google_translator()
            
            lang_codes = {
                'chinese': 'zh',
                'tamil': 'ta',
                'french': 'fr',
                'spanish': 'es',
                'german': 'de',
                'japanese': 'ja',
                'korean': 'ko'
            }
            
            target_code = lang_codes.get(target_language.lower(), target_language)
            
            result = self.google_translator.translate(text, dest=target_code)
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": result.text,
                "latency": latency,
                "model": "Google Translate",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": None,
                "latency": latency,
                "model": "Google Translate",
                "status": "failed",
                "error": str(e)
            }

# Initialize translation service
translation_service = TranslationService()

# Flask Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    uptime = datetime.now() - translation_service.start_time
    
    return jsonify({
        "status": "healthy",
        "uptime_seconds": int(uptime.total_seconds()),
        "translation_count": translation_service.translation_count,
        "cuda_available": torch.cuda.is_available(),
        "device": str(translation_service.device),
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route('/translate', methods=['POST'])
def translate():
    """Main translation endpoint (MarianMT)"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": "MarianMT",
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        result = translation_service.translate_with_marian(text, target_language)
        translation_service.translation_count += 1
        
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"MarianMT translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "MarianMT",
            "status": "failed",
            "error": str(e)
        }), 500

@app.route('/translate-m2m100', methods=['POST'])
def translate_m2m100():
    """Translate using M2M-100"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": "M2M-100",
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        result = translation_service.translate_with_m2m100(text, target_language)
        translation_service.translation_count += 1
        
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"M2M-100 translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "M2M-100",
            "status": "failed",
            "error": str(e)
        }), 500

@app.route('/translate-google', methods=['POST'])
def translate_google():
    """Translate using Google Translate"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": "Google Translate",
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        result = translation_service.translate_with_google(text, target_language)
        translation_service.translation_count += 1
        
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Google translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "Google Translate",
            "status": "failed",
            "error": str(e)
        }), 500

@app.route('/compare', methods=['POST'])
def compare_translations():
    """Compare MarianMT and Google Translate"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        # Get translations from both models
        marian_result = translation_service.translate_with_marian(text, target_language)
        google_result = translation_service.translate_with_google(text, target_language)
        
        translation_service.translation_count += 2
        
        # Compare results
        comparison = {
            "are_same": False,
            "length_diff": 0,
            "speed_diff": 0
        }
        
        if (marian_result["status"] == "success" and 
            google_result["status"] == "success"):
            
            marian_trans = marian_result["translation"]
            google_trans = google_result["translation"]
            
            comparison["are_same"] = marian_trans.lower().strip() == google_trans.lower().strip()
            comparison["length_diff"] = len(marian_trans) - len(google_trans)
            comparison["speed_diff"] = marian_result["latency"] - google_result["latency"]
        
        return jsonify({
            "original": text,
            "target_language": target_language,
            "marian": marian_result,
            "google": google_result,
            "comparison": comparison
        }), 200
        
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/compare-three', methods=['POST'])
def compare_three_models():
    """Compare MarianMT, Google Translate, and M2M-100"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        # Get translations from all three models
        marian_result = translation_service.translate_with_marian(text, target_language)
        google_result = translation_service.translate_with_google(text, target_language)
        m2m100_result = translation_service.translate_with_m2m100(text, target_language)
        
        translation_service.translation_count += 3
        
        return jsonify({
            "original": text,
            "target_language": target_language,
            "results": {
                "marian": marian_result,
                "google": google_result,
                "m2m100": m2m100_result
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Three-way comparison error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/compare-custom', methods=['POST'])
def compare_custom_models():
    """Compare custom selection of models"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        models = data.get('models', ['marian', 'google'])  # Default models
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        if not models or len(models) == 0:
            return jsonify({
                "error": "No models specified"
            }), 400
        
        results = {}
        
        # Process each requested model
        for model in models:
            if model == 'marian':
                results['marian'] = translation_service.translate_with_marian(text, target_language)
            elif model == 'google':
                results['google'] = translation_service.translate_with_google(text, target_language)
            elif model == 'm2m100':
                results['m2m100'] = translation_service.translate_with_m2m100(text, target_language)
            else:
                results[model] = {
                    "translation": None,
                    "latency": 0,
                    "model": model,
                    "status": "failed",
                    "error": f"Unknown model: {model}"
                }
        
        translation_service.translation_count += len(models)
        
        return jsonify({
            "original": text,
            "target_language": target_language,
            "results": results
        }), 200
        
    except Exception as e:
        logger.error(f"Custom comparison error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/models', methods=['GET'])
def get_available_models():
    """Get list of available translation models"""
    return jsonify({
        "models": [
            {
                "name": "marian",
                "display_name": "MarianMT",
                "provider": "Helsinki-NLP",
                "languages": list(translation_service.marian_lang_codes.keys())
            },
            {
                "name": "m2m100",
                "display_name": "M2M-100",
                "provider": "Facebook",
                "languages": list(translation_service.m2m100_lang_codes.keys())
            },
            {
                "name": "google",
                "display_name": "Google Translate",
                "provider": "Google",
                "languages": list(translation_service.marian_lang_codes.keys())
            }
        ]
    }), 200

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": "Endpoint not found",
        "available_endpoints": [
            "/health",
            "/translate",
            "/translate-m2m100", 
            "/translate-google",
            "/compare",
            "/compare-three",
            "/compare-custom",
            "/models"
        ]
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "error": "Internal server error",
        "message": "An unexpected error occurred"
    }), 500

# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("🚀 Starting Translation Server")
    logger.info("=" * 60)
    logger.info(f"🔧 Device: {translation_service.device}")
    logger.info(f"🎮 CUDA Available: {torch.cuda.is_available()}")
    
    if torch.cuda.is_available():
        logger.info(f"🎯 GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"💾 GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    
    logger.info("📦 Available Models:")
    logger.info("   - MarianMT (Helsinki-NLP)")
    logger.info("   - M2M-100 (Facebook)")
    logger.info("   - Google Translate")
    
    logger.info("🌐 Server starting on http://localhost:5000")
    logger.info("=" * 60)
    
    # Start the Flask server
    app.run(
        debug=False,
        host="0.0.0.0",
        port=5000,
        threaded=True
    )