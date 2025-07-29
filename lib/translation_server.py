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
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
)
from deep_translator import GoogleTranslator
import deepl
import os
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

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

class EnhancedTranslationService:
    """Enhanced translation service with multiple models including new additions"""
    
    def __init__(self, preload_models=False):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        # Model instances (lazy loading)
        self.marian_models = {}  # Cache for different language pairs
        self.m2m100_model = None
        self.m2m100_tokenizer = None
        self.google_translator = None
        self.deepl_translator = None
        self.madlad_model = None
        self.madlad_tokenizer = None
        
        # Language code mappings
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
        
        # DeepL language codes
        self.deepl_lang_codes = {
            'chinese': 'ZH',
            'french': 'FR',
            'spanish': 'ES',
            'german': 'DE',
            'japanese': 'JA',
            'korean': 'KO'
        }
        
        # Madlad language codes
        self.madlad_lang_codes = {
            'chinese': 'zh',
            'tamil': 'ta',
            'french': 'fr',
            'spanish': 'es',
            'german': 'de',
            'japanese': 'ja',
            'korean': 'ko'
        }
        
        # Performance tracking
        self.translation_count = 0
        self.start_time = datetime.now()
        
        # Model loading status
        self.models_loaded = {
            'google': False,
            'm2m100': False,
            'marian': {},  # Will track per language
            'deepl': False,
            'madlad': False
        }
        
        # Initialize DeepL API key from environment
        self.deepl_api_key = os.getenv('DEEPL_API_KEY')
        
        # Preload models if requested
        if preload_models:
            self.preload_all_models()
    
    def preload_all_models(self):
        """Preload all available models at startup"""
        logger.info("🔄 Starting enhanced model preloading...")
        
        try:
            logger.info("📥 Loading Google Translator...")
            self.load_google_translator()
            self.models_loaded['google'] = True
            logger.info("✅ Google Translator loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load Google Translator: {e}")
            self.models_loaded['google'] = False
        
        try:
            logger.info("📥 Loading DeepL API...")
            self.load_deepl_translator()
            self.models_loaded['deepl'] = True
            logger.info("✅ DeepL API loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load DeepL API: {e}")
            self.models_loaded['deepl'] = False
        
        for lang in self.marian_lang_codes.keys():
            try:
                logger.info(f"📥 Loading MarianMT for {lang}...")
                self.load_marian_model(lang)
                self.models_loaded['marian'][lang] = True
                logger.info(f"✅ MarianMT loaded for {lang}")
            except Exception as e:
                logger.error(f"❌ Failed to load MarianMT for {lang}: {e}")
                self.models_loaded['marian'][lang] = False
        
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
        
        try:
            logger.info("📥 Loading Madlad-400 model...")
            self.load_madlad_model()
            if self.madlad_model is not None:
                self.models_loaded['madlad'] = True
                logger.info("✅ Madlad-400 loaded successfully")
            else:
                self.models_loaded['madlad'] = False
                logger.warning("⚠️ Madlad-400 model not available")
        except Exception as e:
            logger.error(f"❌ Failed to load Madlad-400: {e}")
            self.models_loaded['madlad'] = False
        
        self._print_loading_summary()
    
    def _print_loading_summary(self):
        """Print a summary of which models loaded successfully"""
        logger.info("=" * 60)
        logger.info("📊 ENHANCED MODEL LOADING SUMMARY")
        logger.info("=" * 60)
        
        # Google Translator
        status = "✅ READY" if self.models_loaded['google'] else "❌ FAILED"
        logger.info(f"Google Translate: {status}")
        
        # DeepL API
        status = "✅ READY" if self.models_loaded['deepl'] else "❌ FAILED"
        logger.info(f"DeepL API: {status}")
        
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
        
        # Madlad-400
        status = "✅ READY" if self.models_loaded['madlad'] else "❌ FAILED"
        logger.info(f"Madlad-400: {status}")
        
        # Overall status
        total_models = 2 + marian_total  # Google + DeepL + M2M + Madlad + MarianMT langs
        loaded_models = (
            (1 if self.models_loaded['google'] else 0) +
            (1 if self.models_loaded['deepl'] else 0) +
            marian_success +
            (1 if self.models_loaded['m2m100'] else 0) +
            (1 if self.models_loaded['madlad'] else 0)
        )
        
        logger.info("=" * 60)
        logger.info(f"🎯 TOTAL: {loaded_models}/{total_models + 1} models ready")
        logger.info("🚀 Enhanced server is ready to handle requests!")
        logger.info("=" * 60)
    
    # Existing model loaders (unchanged)
    def get_marian_model_name(self, target_language: str) -> str:
        """Get the appropriate MarianMT model for target language"""
        marian_models = {
            'chinese': 'Helsinki-NLP/opus-mt-en-zh',
            'tamil': 'Helsinki-NLP/opus-mt-en-mul',
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
                    cache_dir="./model_cache"
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
                self.m2m100_model = None
                self.m2m100_tokenizer = None

    def load_google_translator(self):
        """Initialize Google Translate service using deep-translator"""
        if self.google_translator is None:
            try:
                # Test the translator with a simple translation
                test_translator = GoogleTranslator(source='en', target='fr')
                test_result = test_translator.translate('test')
                if test_result:
                    self.google_translator = True  # Flag to indicate it's working
                    logger.info("Google Translator (deep-translator) initialized")
                else:
                    raise Exception("Test translation failed")
            except Exception as e:
                logger.error(f"Failed to initialize Google Translator: {e}")
                raise
    
    def load_deepl_translator(self):
        """Initialize DeepL API translator"""
        if self.deepl_translator is None:
            try:
                if not self.deepl_api_key:
                    raise ValueError("DeepL API key not found in environment variables")
                
                self.deepl_translator = deepl.Translator(self.deepl_api_key)
                
                # Test the API key
                usage = self.deepl_translator.get_usage()
                logger.info(f"DeepL API initialized. Usage: {usage.character.count}/{usage.character.limit}")
                
            except Exception as e:
                logger.error(f"Failed to initialize DeepL API: {e}")
                raise
    
    def load_madlad_model(self):
        """Load Madlad-400 model (Google's multilingual model)"""
        if self.madlad_model is None:
            try:
                logger.info("Loading Madlad-400 model...")
                
                # Use the 3B model for better performance
                model_name = "google/madlad400-3b-mt"
                
                self.madlad_tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    cache_dir="./model_cache"
                )
                
                self.madlad_model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                    low_cpu_mem_usage=True,
                    cache_dir="./model_cache"
                )
                
                if torch.cuda.is_available():
                    try:
                        self.madlad_model = self.madlad_model.to(self.device)
                        logger.info("Madlad-400 loaded on GPU")
                    except RuntimeError as e:
                        if "out of memory" in str(e).lower():
                            logger.warning("GPU out of memory for Madlad, falling back to CPU")
                            self.madlad_model = self.madlad_model.to("cpu")
                        else:
                            raise
                else:
                    self.madlad_model = self.madlad_model.to(self.device)
                    logger.info("Madlad-400 loaded on CPU")
                
                logger.info("Madlad-400 model loaded successfully")
                
            except Exception as e:
                logger.error(f"Failed to load Madlad-400 model: {e}")
                self.madlad_model = None
                self.madlad_tokenizer = None
    
    # TRANSLATION METHODS (existing methods unchanged, adding new ones)
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
                    "latency": 0,
                    "model": "M2M-100",
                    "status": "failed",
                    "error": "M2M-100 model not loaded"
                }
            
            # Get target language code
            target_lang_code = self.m2m100_lang_codes.get(target_language.lower(), 'fr')
            
            # Set source and target languages
            self.m2m100_tokenizer.src_lang = "en"
            
            # Encode text
            encoded = self.m2m100_tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
            if torch.cuda.is_available() and self.m2m100_model.device.type == 'cuda':
                encoded = {k: v.to(self.device) for k, v in encoded.items()}
            
            # Generate translation
            generated_tokens = self.m2m100_model.generate(
                **encoded,
                forced_bos_token_id=self.m2m100_tokenizer.lang_code_to_id[target_lang_code],
                max_length=512,
                num_beams=4,
                early_stopping=True
            )
            
            # Decode translation
            translation = self.m2m100_tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
            
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
        """Translate text using Google Translate (deep-translator)"""
        start_time = time.time()
        
        try:
            if self.google_translator is None:
                self.load_google_translator()
            
            # Get target language code
            target_lang_code = self.marian_lang_codes.get(target_language.lower(), 'fr')
            
            # Create translator instance for this specific translation
            translator = GoogleTranslator(source='en', target=target_lang_code)
            translation = translator.translate(text)
            
            if not translation:
                raise Exception("Translation returned empty result")
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
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
    
    def translate_with_deepl(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using DeepL API"""
        start_time = time.time()
        
        try:
            if self.deepl_translator is None:
                self.load_deepl_translator()
            
            # Check if language is supported by DeepL
            target_lang_code = self.deepl_lang_codes.get(target_language.lower())
            if not target_lang_code:
                return {
                    "translation": None,
                    "latency": 0,
                    "model": "DeepL",
                    "status": "failed",
                    "error": f"Language '{target_language}' not supported by DeepL"
                }
            
            # Translate
            result = self.deepl_translator.translate_text(text, target_lang=target_lang_code)
            translation = result.text
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
                "latency": latency,
                "model": "DeepL",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": None,
                "latency": latency,
                "model": "DeepL",
                "status": "failed",
                "error": str(e)
            }
    
    def translate_with_madlad(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using Madlad-400"""
        start_time = time.time()
        
        try:
            if self.madlad_model is None or self.madlad_tokenizer is None:
                return {
                    "translation": None,
                    "latency": 0,
                    "model": "Madlad-400",
                    "status": "failed",
                    "error": "Madlad-400 model not loaded"
                }
            
            # Get target language code
            target_lang_code = self.madlad_lang_codes.get(target_language.lower(), 'fr')
            
            # Format text for Madlad (uses special format)
            formatted_text = f"<2{target_lang_code}> {text}"
            
            # Encode text
            inputs = self.madlad_tokenizer(formatted_text, return_tensors="pt", padding=True, truncation=True, max_length=512)
            if torch.cuda.is_available() and self.madlad_model.device.type == 'cuda':
                inputs = {k: v.to(self.madlad_model.device) for k, v in inputs.items()}
            
            # Generate translation
            with torch.no_grad():
                outputs = self.madlad_model.generate(
                    **inputs,
                    max_length=512,
                    num_beams=4,
                    early_stopping=True,
                    do_sample=False
                )
            
            # Decode translation
            translation = self.madlad_tokenizer.decode(outputs[0], skip_special_tokens=True)
            # Clean up the output (remove language tags)
            translation = translation.replace(f"<2{target_lang_code}>", "").strip()
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
                "latency": latency,
                "model": "Madlad-400",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": None,
                "latency": latency,
                "model": "Madlad-400",
                "status": "failed",
                "error": str(e)
            }

# Initialize translation service with preloading
translation_service = EnhancedTranslationService(preload_models=True)

# ENHANCED API ENDPOINTS
@app.route('/models', methods=['GET'])
def get_available_models():
    """Get list of available translation models with their status"""
    try:
        models = {
            "marian": {
                "name": "MarianMT",
                "status": translation_service.models_loaded['marian'],
                "languages": list(translation_service.marian_lang_codes.keys()),
                "description": "Neural machine translation models by University of Edinburgh"
            },
            "google": {
                "name": "Google Translate",
                "status": translation_service.models_loaded['google'],
                "languages": list(translation_service.marian_lang_codes.keys()),
                "description": "Google's cloud-based translation service"
            },
            "m2m100": {
                "name": "M2M-100",
                "status": translation_service.models_loaded['m2m100'],
                "languages": list(translation_service.m2m100_lang_codes.keys()),
                "description": "Facebook's multilingual machine translation model"
            },
            "deepl": {
                "name": "DeepL",
                "status": translation_service.models_loaded['deepl'],
                "languages": list(translation_service.deepl_lang_codes.keys()),
                "description": "DeepL's professional translation API"
            },
            "madlad": {
                "name": "Madlad-400",
                "status": translation_service.models_loaded['madlad'],
                "languages": list(translation_service.madlad_lang_codes.keys()),
                "description": "Google's 400+ language translation model"
            }
        }
        
        return jsonify({
            "models": models,
            "total_models": len(models),
            "loaded_models": sum(1 for model in models.values() if model["status"])
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting models: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/compare-custom', methods=['POST'])
def compare_custom_models():
    """Compare custom selection of models including new ones"""
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
            elif model == 'deepl':
                results['deepl'] = translation_service.translate_with_deepl(text, target_language)
            elif model == 'madlad':
                results['madlad'] = translation_service.translate_with_madlad(text, target_language)
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

@app.route('/compare-all', methods=['POST'])
def compare_all_models():
    """Compare all available models"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        # Get all available models
        all_models = ['marian', 'google', 'm2m100', 'deepl', 'madlad']
        
        results = {}
        
        # Test each model
        for model in all_models:
            if model == 'marian':
                results['marian'] = translation_service.translate_with_marian(text, target_language)
            elif model == 'google':
                results['google'] = translation_service.translate_with_google(text, target_language)
            elif model == 'm2m100':
                results['m2m100'] = translation_service.translate_with_m2m100(text, target_language)
            elif model == 'deepl':
                results['deepl'] = translation_service.translate_with_deepl(text, target_language)
            elif model == 'madlad':
                results['madlad'] = translation_service.translate_with_madlad(text, target_language)
        
        translation_service.translation_count += len(all_models)
        
        return jsonify({
            "original": text,
            "target_language": target_language,
            "results": results,
            "models_tested": len(all_models)
        }), 200
        
    except Exception as e:
        logger.error(f"All models comparison error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Enhanced health check including new models"""
    try:
        uptime = datetime.now() - translation_service.start_time
        
        # Test each model briefly
        test_text = "Hello"
        test_lang = "french"
        
        model_health = {}
        
        # Test Google (fastest)
        try:
            result = translation_service.translate_with_google(test_text, test_lang)
            model_health['google'] = result['status'] == 'success'
        except:
            model_health['google'] = False
        
        # Test other models
        models_to_test = ['marian', 'm2m100', 'deepl', 'madlad']
        for model in models_to_test:
            try:
                if model == 'marian':
                    result = translation_service.translate_with_marian(test_text, test_lang)
                elif model == 'm2m100':
                    result = translation_service.translate_with_m2m100(test_text, test_lang)
                elif model == 'deepl':
                    result = translation_service.translate_with_deepl(test_text, test_lang)
                elif model == 'madlad':
                    result = translation_service.translate_with_madlad(test_text, test_lang)
                
                model_health[model] = result['status'] == 'success'
            except:
                model_health[model] = False
        
        return jsonify({
            "status": "healthy",
            "uptime_seconds": uptime.total_seconds(),
            "translation_count": translation_service.translation_count,
            "device": str(translation_service.device),
            "models_loaded": translation_service.models_loaded,
            "model_health": model_health,
            "enhanced_features": [
                "DeepL API",
                "Madlad-400 model"
            ]
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    logger.info("Starting Enhanced Translation Server...")
    app.run(host='0.0.0.0', port=5000, debug=False)