import os
import time
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import concurrent.futures
import torch
from transformers import (
    MarianMTModel, 
    MarianTokenizer,
    M2M100ForConditionalGeneration, 
    M2M100Tokenizer,
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    pipeline
)
from googletrans import Translator
import gc
from typing import Dict, Any, List, Optional
from pathlib import Path
import traceback
from openai import OpenAI

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

# Initialize OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")  # Make sure this environment variable is set
)

class TranslationService:
    """Complete translation service with multiple models"""
    
    def __init__(self, preload_models=False):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        # Model instances (lazy loading)
        self.marian_models = {}  # Cache for different language pairs
        self.m2m100_model = None
        self.m2m100_tokenizer = None
        self.madlad_model = None
        self.madlad_tokenizer = None
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
        
        self.madlad_lang_codes = {
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
            'madlad': False,
            'marian': {}  # Will track per language
        }
        
        # Preload models if requested
        if preload_models:
            self.preload_all_models()
    
    def preload_all_models(self):
        """Preload all available models at startup"""
        logger.info("🔄 Starting model preloading...")
        
        # 1. Load Google Translator (fast)
        try:
            logger.info("📥 Loading Google Translator...")
            self.load_google_translator()
            self.models_loaded['google'] = True
            logger.info("✅ Google Translator loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load Google Translator: {e}")
        
        # 2. Load MarianMT models for all supported languages
        logger.info("📥 Loading MarianMT models for all languages...")
        for language in self.marian_lang_codes.keys():
            try:
                logger.info(f"   Loading MarianMT for {language}...")
                self.load_marian_model(language)
                self.models_loaded['marian'][language] = True
                logger.info(f"   ✅ MarianMT {language} loaded")
            except Exception as e:
                logger.error(f"   ❌ Failed to load MarianMT for {language}: {e}")
                self.models_loaded['marian'][language] = False
        
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
        
        # 4. Load MADLAD-400 (may be very slow or fail)
        try:
            logger.info("📥 Loading MADLAD-400 model (this may take a while)...")
            self.load_madlad_model()
            if self.madlad_model is not None:
                self.models_loaded['madlad'] = True
                logger.info("✅ MADLAD-400 loaded successfully")
            else:
                self.models_loaded['madlad'] = False
                logger.warning("⚠️ MADLAD-400 model not available")
        except Exception as e:
            logger.error(f"❌ Failed to load MADLAD-400: {e}")
            self.models_loaded['madlad'] = False
        
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
        
        # MADLAD-400
        status = "✅ READY" if self.models_loaded['madlad'] else "❌ FAILED"
        logger.info(f"MADLAD-400: {status}")
        
        # Overall status
        total_models = 3 + marian_total  # Google + M2M + MADLAD + MarianMT langs
        loaded_models = (
            (1 if self.models_loaded['google'] else 0) +
            marian_success +
            (1 if self.models_loaded['m2m100'] else 0) +
            (1 if self.models_loaded['madlad'] else 0)
        )
        
        logger.info("=" * 50)
        logger.info(f"🎯 TOTAL: {loaded_models}/{total_models} models ready")
        logger.info("🚀 Server is ready to handle requests!")
        logger.info("=" * 50)
    
    def get_marian_model_name(self, target_language: str) -> str:
        """Get the appropriate MarianMT model name for the target language"""
        marian_models = {
            'chinese': 'Helsinki-NLP/opus-mt-en-zh',
            'tamil': 'Helsinki-NLP/opus-mt-en-ta', 
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
        """Load M2M-100 model (Facebook's multilingual model) - with better error handling"""
        if self.m2m100_model is None:
            try:
                logger.info("Loading M2M-100 model...")
                
                # Try smaller model first (418M parameters instead of 1.2B)
                model_name = "facebook/m2m100_418M"
                
                # Check available memory
                if torch.cuda.is_available():
                    memory_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
                    logger.info(f"Available GPU memory: {memory_gb:.1f} GB")
                    
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

    def load_madlad_model(self):
        """Load MADLAD-400 model - with better error handling and smaller variant"""
        if self.madlad_model is None:
            try:
                logger.info("Loading MADLAD-400 model...")
                
                # Use smaller model variant or alternative
                model_name = "google/madlad400-3b-mt"  # 3B parameters
                
                # Check if we should use an even smaller model
                if torch.cuda.is_available():
                    memory_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
                    if memory_gb < 8:
                        # Use T5-small as a placeholder if system can't handle MADLAD
                        logger.warning("Using T5-small as MADLAD alternative due to memory constraints")
                        model_name = "t5-small"
                
                logger.info(f"Loading MADLAD from {model_name}...")
                
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
                
                # Move to device with error handling
                if torch.cuda.is_available():
                    try:
                        self.madlad_model = self.madlad_model.to(self.device)
                        logger.info("MADLAD loaded on GPU")
                    except RuntimeError as e:
                        if "out of memory" in str(e).lower():
                            logger.warning("GPU out of memory, falling back to CPU")
                            self.device = torch.device("cpu")
                            self.madlad_model = self.madlad_model.to(self.device)
                        else:
                            raise
                else:
                    self.madlad_model = self.madlad_model.to(self.device)
                    logger.info("MADLAD loaded on CPU")
                
                logger.info("MADLAD-400 model loaded successfully")
                
            except Exception as e:
                logger.error(f"Failed to load MADLAD-400 model: {e}")
                # Don't raise the exception, just log it
                self.madlad_model = None
                self.madlad_tokenizer = None
    
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
            # Check if model is already loaded
            if target_language not in self.marian_models:
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
        """Translate text using M2M-100 (Facebook) - with better error handling"""
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
            
            # Get language codes
            src_lang = self.m2m100_lang_codes.get('english', 'en')
            tgt_lang = self.m2m100_lang_codes.get(target_language.lower())
            
            if not tgt_lang:
                return {
                    "translation": None,
                    "latency": time.time() - start_time,
                    "model": "M2M-100",
                    "status": "failed",
                    "error": f"Unsupported language: {target_language}"
                }
            
            # Set source language
            self.m2m100_tokenizer.src_lang = src_lang
            
            # Tokenize input with limits
            encoded = self.m2m100_tokenizer(
                text, 
                return_tensors="pt", 
                padding=True, 
                truncation=True, 
                max_length=256  # Reduced from 512 to save memory
            )
            
            if torch.cuda.is_available() and self.device.type == 'cuda':
                encoded = {k: v.to(self.device) for k, v in encoded.items()}
            
            # Generate translation with conservative settings
            with torch.no_grad():
                generated_tokens = self.m2m100_model.generate(
                    **encoded,
                    forced_bos_token_id=self.m2m100_tokenizer.get_lang_id(tgt_lang),
                    max_length=256,  # Reduced max length
                    num_beams=2,     # Reduced from 4 to save memory
                    early_stopping=True,
                    no_repeat_ngram_size=2
                )
            
            # Decode translation
            translation = self.m2m100_tokenizer.batch_decode(
                generated_tokens, skip_special_tokens=True
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

    def translate_with_madlad(self, text: str, target_language: str) -> Dict[str, Any]:
        """Translate text using MADLAD-400 (Google) - with better error handling"""
        start_time = time.time()
        
        try:
            # Check if model is available (should be preloaded)
            if self.madlad_model is None or self.madlad_tokenizer is None:
                return {
                    "translation": None,
                    "latency": time.time() - start_time,
                    "model": "MADLAD-400",
                    "status": "failed",
                    "error": "MADLAD-400 model not available (failed to load at startup)"
                }
            
            # Get language code
            tgt_lang = self.madlad_lang_codes.get(target_language.lower())
            
            if not tgt_lang:
                return {
                    "translation": None,
                    "latency": time.time() - start_time,
                    "model": "MADLAD-400",
                    "status": "failed",
                    "error": f"Unsupported language: {target_language}"
                }
            
            # Format input for MADLAD-400
            input_text = f"<2{tgt_lang}> {text}"
            
            # Tokenize input
            inputs = self.madlad_tokenizer(
                input_text, 
                return_tensors="pt", 
                padding=True, 
                truncation=True,
                max_length=256  # Reduced from 512
            )
            
            if torch.cuda.is_available() and self.device.type == 'cuda':
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate translation
            with torch.no_grad():
                output_tokens = self.madlad_model.generate(
                    **inputs,
                    max_length=256,  # Reduced max length
                    num_beams=2,     # Reduced from 4
                    early_stopping=True,
                    no_repeat_ngram_size=2
                )
            
            # Decode translation
            translation = self.madlad_tokenizer.decode(
                output_tokens[0], 
                skip_special_tokens=True
            )
            
            # Clean up the output (remove the input prefix if present)
            if translation.startswith(input_text):
                translation = translation[len(input_text):].strip()
            elif translation.startswith(f"<2{tgt_lang}>"):
                translation = translation[len(f"<2{tgt_lang}>"):].strip()
            
            end_time = time.time()
            latency = end_time - start_time
            
            return {
                "translation": translation,
                "latency": latency,
                "model": "MADLAD-400",
                "status": "success",
                "error": None
            }
            
        except Exception as e:
            end_time = time.time()
            latency = end_time - start_time
            
            logger.error(f"MADLAD-400 translation error: {e}")
            
            return {
                "translation": None,
                "latency": latency,
                "model": "MADLAD-400",
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

# Global service instance with preloading enabled
translation_service = TranslationService(preload_models=True)

# ============================================================================
# HELPER FUNCTIONS (from original translation_server.py)
# ============================================================================

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

def translate_with_chatgpt(text, target_language):
    """
    Translate text using ChatGPT with the new OpenAI v1.0.0+ API
    """
    start_time = time.time()
    
    try:
        language_prompts = {
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
                    "content": text
                }
            ],
            max_tokens=150,
            temperature=0.3,
            top_p=1.0,
            frequency_penalty=0.0,
            presence_penalty=0.0
        )
        
        translation = response.choices[0].message.content.strip()
        
        return translation
        
    except Exception as e:
        print(f"ChatGPT translation error: {str(e)}")
        raise

# ============================================================================
# FLASK ENDPOINTS
# ============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with model status"""
    uptime = datetime.now() - translation_service.start_time
    
    return jsonify({
        "status": "online",
        "uptime_seconds": int(uptime.total_seconds()),
        "translation_count": translation_service.translation_count,
        "device": str(translation_service.device),
        "cuda_available": torch.cuda.is_available(),
        "models": ["MarianMT", "M2M-100", "MADLAD-400", "Google Translate"],
        "models_loaded": translation_service.models_loaded
    }), 200

@app.route('/translate', methods=['POST'])
def translate():
    """Main translate endpoint - supports multiple models"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        model = data.get('model', 'marian')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": model,
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        # Route to appropriate translation method
        if model == 'google':
            result = translation_service.translate_with_google(text, target_language)
        else:  # Default to marian
            result = translation_service.translate_with_marian(text, target_language)
        
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

@app.route('/translate-madlad', methods=['POST'])
def translate_madlad():
    """Translate using MADLAD-400"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": "MADLAD-400",
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        result = translation_service.translate_with_madlad(text, target_language)
        translation_service.translation_count += 1
        
        if result["status"] == "success":
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"MADLAD-400 translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "MADLAD-400",
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
        logger.error(f"Google Translate error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "Google Translate",
            "status": "failed",
            "error": str(e)
        }), 500

@app.route('/translate-chatgpt', methods=['POST'])
def translate_chatgpt():
    """Translate using ChatGPT"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "translation": None,
                "latency": 0,
                "model": "ChatGPT",
                "status": "failed",
                "error": "No text provided"
            }), 400
        
        start_time = time.time()
        translation = translate_with_chatgpt(text, target_language)
        latency = time.time() - start_time
        
        translation_service.translation_count += 1
        
        return jsonify({
            "translation": translation,
            "latency": latency,
            "model": "ChatGPT",
            "status": "success",
            "error": None
        }), 200
        
    except Exception as e:
        logger.error(f"ChatGPT translation error: {e}")
        return jsonify({
            "translation": None,
            "latency": 0,
            "model": "ChatGPT",
            "status": "failed",
            "error": str(e)
        }), 500

@app.route('/compare', methods=['POST'])
def compare_two_models():
    """Compare MarianMT and Google Translate"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        # Run translations in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            marian_future = executor.submit(translation_service.translate_with_marian, text, target_language)
            google_future = executor.submit(translation_service.translate_with_google, text, target_language)
            
            marian_result = marian_future.result()
            google_result = google_future.result()
        
        translation_service.translation_count += 2
        
        # Calculate comparison metrics
        are_same = (marian_result.get('translation') == google_result.get('translation'))
        length_diff = abs(len(marian_result.get('translation', '')) - len(google_result.get('translation', '')))
        speed_diff = marian_result.get('latency', 0) - google_result.get('latency', 0)
        
        return jsonify({
            "source_text": text,
            "target_language": target_language,
            "marian": marian_result,
            "google": google_result,
            "comparison": {
                "are_same": are_same,
                "length_diff": length_diff,
                "speed_diff": speed_diff,
                "note": f"MarianMT was {'faster' if speed_diff < 0 else 'slower'} by {abs(speed_diff):.2f}s"
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Two model comparison error: {e}")
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/compare-three', methods=['POST'])
def compare_three_models():
    """Compare MarianMT, M2M-100, and MADLAD-400"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('targetLanguage', 'french')
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        # Run translations in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            marian_future = executor.submit(translation_service.translate_with_marian, text, target_language)
            m2m100_future = executor.submit(translation_service.translate_with_m2m100, text, target_language)
            madlad_future = executor.submit(translation_service.translate_with_madlad, text, target_language)
            
            marian_result = marian_future.result()
            m2m100_result = m2m100_future.result()
            madlad_result = madlad_future.result()
        
        translation_service.translation_count += 3
        
        # Calculate comparison metrics
        successful_models = []
        if marian_result['status'] == 'success':
            successful_models.append('marian')
        if m2m100_result['status'] == 'success':
            successful_models.append('m2m100')
        if madlad_result['status'] == 'success':
            successful_models.append('madlad')
        
        return jsonify({
            "source_text": text,
            "target_language": target_language,
            "results": {
                "marian": marian_result,
                "m2m100": m2m100_result,
                "madlad": madlad_result
            },
            "comparison": {
                "successful_models": successful_models,
                "total_models": 3,
                "success_rate": len(successful_models) / 3
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Three model comparison error: {e}")
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
        models = data.get('models', ['marian', 'm2m100'])
        
        if not text:
            return jsonify({
                "error": "No text provided"
            }), 400
        
        if not models:
            return jsonify({
                "error": "No models specified"
            }), 400
        
        # Map model names to functions
        model_functions = {
            'marian': translation_service.translate_with_marian,
            'm2m100': translation_service.translate_with_m2m100,
            'madlad': translation_service.translate_with_madlad,
            'google': translation_service.translate_with_google
        }
        
        results = {}
        
        # Run translations in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(models)) as executor:
            futures = {}
            for model in models:
                if model in model_functions:
                    futures[model] = executor.submit(model_functions[model], text, target_language)
            
            for model, future in futures.items():
                results[model] = future.result()
        
        translation_service.translation_count += len(models)
        
        # Calculate success rate
        successful_models = [model for model, result in results.items() if result['status'] == 'success']
        
        return jsonify({
            "source_text": text,
            "target_language": target_language,
            "selected_models": models,
            "results": results,
            "successful_models": successful_models,
            "success_rate": len(successful_models) / len(models)
        }), 200
        
    except Exception as e:
        logger.error(f"Custom model comparison error: {e}")
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
                "I would like to learn more about local culture."
            ]
        }
        
        test_texts = test_cases.get(test_case, test_cases["general"])
        results = []
        
        for text in test_texts:
            # Compare both models for each test case
            start_time = time.time()
            try:
                marian_result = translation_service.translate_with_marian(text, target_language)
                marian_translation = marian_result.get('translation', 'Failed')
                marian_time = marian_result.get('latency', 0)
            except Exception:
                marian_translation = "Failed"
                marian_time = 0
            
            start_time = time.time()
            try:
                google_result = translation_service.translate_with_google(text, target_language)
                google_translation = google_result.get('translation', 'Failed')
                google_time = google_result.get('latency', 0)
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

@app.route('/models', methods=['GET'])
def get_available_models():
    """Get list of available models"""
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
                "name": "madlad",
                "display_name": "MADLAD-400",
                "provider": "Google",
                "languages": list(translation_service.madlad_lang_codes.keys())
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
            "/translate-madlad",
            "/translate-google",
            "/translate-chatgpt",
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
    logger.info("   - MADLAD-400 (Google)")
    logger.info("   - Google Translate")
    logger.info("   - ChatGPT (OpenAI)")
    
    logger.info("🌐 Available Endpoints:")
    logger.info("   - /health - Health check")
    logger.info("   - /translate - Main translation (MarianMT/Google)")
    logger.info("   - /translate-m2m100 - M2M-100 translation")
    logger.info("   - /translate-madlad - MADLAD-400 translation") 
    logger.info("   - /translate-google - Google Translate")
    logger.info("   - /translate-chatgpt - ChatGPT translation")
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