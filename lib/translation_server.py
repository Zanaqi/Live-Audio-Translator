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
    M2M100Tokenizer,
)
from googletrans import Translator
import gc
from typing import Dict, Any
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Audio test data storage
AUDIO_TEST_DIR = Path("audio_tests")
AUDIO_TEST_DIR.mkdir(exist_ok=True)

class TranslationService:
    """Complete translation service with multiple models"""
    
    def __init__(self, preload_models=False):
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
        
        # Model loading status
        self.models_loaded = {
            'google': False,
            'm2m100': False,
            'marian': {}  # Will track per language
        }
        
        # Preload models if requested
        if preload_models:
            self.preload_all_models()
    
    def preload_all_models(self):
        """Preload all available models at startup"""
        logger.info("🔄 Starting model preloading...")
        
        # 1. Load Google Translator (fastest)
        try:
            logger.info("📥 Loading Google Translator...")
            self.load_google_translator()
            self.models_loaded['google'] = True
            logger.info("✅ Google Translator loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load Google Translator: {e}")
            self.models_loaded['google'] = False
        
        # 2. Load MarianMT models for each language
        for lang in self.marian_lang_codes.keys():
            try:
                logger.info(f"📥 Loading MarianMT for {lang}...")
                self.load_marian_model(lang)
                self.models_loaded['marian'][lang] = True
                logger.info(f"✅ MarianMT loaded for {lang}")
            except Exception as e:
                logger.error(f"❌ Failed to load MarianMT for {lang}: {e}")
                self.models_loaded['marian'][lang] = False
        
        # 3. Load M2M-100 (may be slow)
        try:
            logger.info("📥 Loading M2M-100 model...")
            self.load_m2m100_model()
            if self.m2m100_model is not None:
                self.models_loaded['m2m100'] = True
                logger.info("✅ M2M-100 loaded successfully")
            else:
                self.models_loaded['m2m100'] = False
                logger.warning("⚠️ M2M-100 model not available")
        except Exception as e:
            logger.error(f"❌ Failed to load M2M-100: {e}")
            self.models_loaded['m2m100'] = False
        
        # Summary
        self._print_loading_summary()
    
    def _print_loading_summary(self):
        """Print a summary of which models loaded successfully"""
        logger.info("=" * 50)
        logger.info("📊 MODEL LOADING SUMMARY")
        logger.info("=" * 50)
        
        # Google Translator
        status = "✅ READY" if self.models_loaded['google'] else "❌ FAILED"
        logger.info(f"Google Translate: {status}")
        
        # MarianMT
        marian_success = sum(1 for loaded in self.models_loaded['marian'].values() if loaded)
        marian_total = len(self.marian_lang_codes)
        logger.info(f"MarianMT: {marian_success}/{marian_total} languages loaded")
        for lang, loaded in self.models_loaded['marian'].items():
            status = "✅" if loaded else "❌"
            logger.info(f"  {status} {lang}")
        
        # M2M-100
        status = "✅ READY" if self.models_loaded['m2m100'] else "❌ FAILED"
        logger.info(f"M2M-100: {status}")
        
        # Overall status
        total_models = 2 + marian_total  # Google + M2M + MarianMT langs
        loaded_models = (
            (1 if self.models_loaded['google'] else 0) +
            marian_success +
            (1 if self.models_loaded['m2m100'] else 0)
        )
        
        logger.info("=" * 50)
        logger.info(f"🎯 TOTAL: {loaded_models}/{total_models} models ready")
        logger.info("🚀 Server is ready to handle requests!")
        logger.info("=" * 50)
    
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
                
                tokenizer = MarianTokenizer.from_pretrained(
                    model_name,
                    cache_dir="./model_cache"
                )
                model = MarianMTModel.from_pretrained(
                    model_name,
                    cache_dir="./model_cache"
                )
                
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
        """Load M2M-100 model - with better error handling and memory management"""
        if self.m2m100_model is None:
            try:
                logger.info("Loading M2M-100 model...")
                
                # Use smaller model variant (418M instead of 1.2B)
                model_name = "facebook/m2m100_418M"
                
                # Check GPU memory and adjust accordingly
                if torch.cuda.is_available():
                    memory_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
                    if memory_gb < 4:
                        logger.warning("Low GPU memory, using CPU for M2M-100")
                        self.device = torch.device("cpu")
                
                logger.info(f"Loading M2M-100 from {model_name}...")
                
                # Load with optimizations
                self.m2m100_tokenizer = M2M100Tokenizer.from_pretrained(
                    model_name,
                    cache_dir="./model_cache"  # Cache to avoid re-downloading
                )
                
                self.m2m100_model = M2M100ForConditionalGeneration.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                    low_cpu_mem_usage=True,
                    cache_dir="./model_cache"
                )
                
                # Move to device
                if torch.cuda.is_available():
                    try:
                        self.m2m100_model = self.m2m100_model.to(self.device)
                        logger.info("M2M-100 loaded on GPU")
                    except RuntimeError as e:
                        if "out of memory" in str(e).lower():
                            logger.warning("GPU out of memory, falling back to CPU")
                            self.device = torch.device("cpu")
                            self.m2m100_model = self.m2m100_model.to(self.device)
                        else:
                            raise
                else:
                    self.m2m100_model = self.m2m100_model.to(self.device)
                    logger.info("M2M-100 loaded on CPU")
                
                logger.info("M2M-100 model loaded successfully")
                
            except Exception as e:
                logger.error(f"Failed to load M2M-100 model: {e}")
                # Don't raise the exception, just log it
                # This allows the server to continue running without M2M-100
                self.m2m100_model = None
                self.m2m100_tokenizer = None

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
            # Check if model is available (should be preloaded)
            if self.m2m100_model is None or self.m2m100_tokenizer is None:
                return {
                    "translation": None,
                    "latency": time.time() - start_time,
                    "model": "M2M-100",
                    "status": "failed",
                    "error": "M2M-100 model not available (failed to load at startup)"
                }
            
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
                max_length=256  # Reduced from 512
            )
            
            if torch.cuda.is_available() and self.device.type == 'cuda':
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate translation
            with torch.no_grad():
                generated_tokens = self.m2m100_model.generate(
                    **inputs, 
                    forced_bos_token_id=self.m2m100_tokenizer.get_lang_id(tgt_lang),
                    max_length=256,  # Reduced max length
                    num_beams=2,     # Reduced from 4
                    early_stopping=True,
                    no_repeat_ngram_size=2
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
            
            logger.error(f"M2M-100 translation error: {e}")
            
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
    
    def cleanup_memory(self):
        """Clean up GPU memory"""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()
        logger.info("Memory cleanup completed")

# ============================================================================
# GLOBAL TRANSLATION SERVICE INSTANCE
# ============================================================================

translation_service = TranslationService(preload_models=True)

# ============================================================================
# FLASK ROUTES
# ============================================================================

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
        "models_loaded": translation_service.models_loaded,
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route('/translate', methods=['POST'])
def translate():
    """Main translation endpoint (MarianMT or Google based on model parameter)"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        model = data.get('model', 'marian')  # Default to marian
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": model,
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        # Route to appropriate translation method
        if model.lower() == 'google':
            result = translation_service.translate_with_google(text, target_language)
        elif model.lower() == 'marian':
            result = translation_service.translate_with_marian(text, target_language)
        else:
            result = translation_service.translate_with_marian(text, target_language)  # Default fallback
        
        translation_service.translation_count += 1
        
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": model,
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

@app.route('/test-audio', methods=['POST'])
def test_audio_translation():
    """Test translation with predefined audio test cases"""
    try:
        data = request.get_json()
        target_language = data.get('targetLanguage', 'french')
        test_case = data.get('testCase', 'museum_tour')
        
        # Predefined test cases
        test_scripts = {
            'museum_tour': [
                "Welcome to the museum.",
                "Please follow the guided tour.",
                "This painting is from the Renaissance period.",
                "The exhibition closes at 6 PM.",
                "Photography is not allowed in this gallery."
            ],
            'airport_announcement': [
                "Flight 402 is now boarding at gate 12.",
                "Please have your boarding pass ready.",
                "All passengers should be seated.",
                "We apologize for the delay.",
                "Thank you for flying with us."
            ],
            'restaurant': [
                "Good evening, table for two?",
                "What would you like to drink?",
                "The special today is grilled salmon.",
                "Would you like dessert?",
                "Here is your check."
            ]
        }
        
        test_texts = test_scripts.get(test_case, test_scripts['museum_tour'])
        results = []
        
        total_marian_time = 0
        total_google_time = 0
        
        for text in test_texts:
            marian_result = translation_service.translate_with_marian(text, target_language)
            google_result = translation_service.translate_with_google(text, target_language)
            
            total_marian_time += marian_result.get("latency", 0)
            total_google_time += google_result.get("latency", 0)
            
            results.append({
                "original": text,
                "marian": {
                    "translation": marian_result.get("translation", "Failed"),
                    "latency": marian_result.get("latency", 0)
                },
                "google": {
                    "translation": google_result.get("translation", "Failed"),
                    "latency": google_result.get("latency", 0)
                }
            })
        
        translation_service.translation_count += len(test_texts) * 2
        
        avg_marian_latency = total_marian_time / len(test_texts)
        avg_google_latency = total_google_time / len(test_texts)
        
        return jsonify({
            "test_case": test_case,
            "target_language": target_language,
            "results": results,
            "summary": {
                "total_tests": len(test_texts),
                "avg_marian_latency": round(avg_marian_latency, 3),
                "avg_google_latency": round(avg_google_latency, 3),
                "faster_model": "MarianMT" if avg_marian_latency < avg_google_latency else "Google"
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Audio test error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/languages', methods=['GET'])
def get_supported_languages():
    """Get list of supported languages"""
    return jsonify({
        "languages": [
            {"code": "chinese", "name": "Chinese", "native": "中文"},
            {"code": "tamil", "name": "Tamil", "native": "தமிழ்"},
            {"code": "french", "name": "French", "native": "Français"},
            {"code": "spanish", "name": "Spanish", "native": "Español"},
            {"code": "german", "name": "German", "native": "Deutsch"},
            {"code": "japanese", "name": "Japanese", "native": "日本語"},
            {"code": "korean", "name": "Korean", "native": "한국어"}
        ]
    }), 200

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

@app.route('/cleanup', methods=['POST'])
def cleanup_memory():
    """Clean up GPU memory"""
    try:
        translation_service.cleanup_memory()
        return jsonify({
            "status": "success",
            "message": "Memory cleanup completed"
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

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
            "/test-audio",
            "/languages",
            "/models",
            "/cleanup"
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
    logger.info("🚀 Starting Complete Translation Server")
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
    
    logger.info("🌐 Available Endpoints:")
    logger.info("   - /health - Health check")
    logger.info("   - /translate - Main translation (MarianMT/Google)")
    logger.info("   - /translate-m2m100 - M2M-100 translation")
    logger.info("   - /translate-google - Google Translate")
    logger.info("   - /compare - Compare MarianMT vs Google")
    logger.info("   - /compare-three - Compare three models")
    logger.info("   - /compare-custom - Compare custom models")
    logger.info("   - /test-audio - Audio test cases")
    logger.info("   - /languages - Supported languages")
    logger.info("   - /models - Available models")
    
    logger.info("🌐 Server starting on http://localhost:5000")
    logger.info("=" * 60)
    
    # Start the Flask server
    app.run(
        debug=False,
        host="0.0.0.0",
        port=5000,
        threaded=True
    )