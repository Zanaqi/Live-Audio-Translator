import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import BertTokenizer, MarianMTModel, MarianTokenizer
import warnings
import json
from functools import lru_cache

# Suppress warnings
warnings.filterwarnings('ignore')

class AttentionLayer(nn.Module):
    def __init__(self, hidden_size):
        super().__init__()
        self.attention = nn.MultiheadAttention(hidden_size, num_heads=8)
        
    def forward(self, query, key, value, mask=None):
        return self.attention(query, key, value, key_padding_mask=mask)[0]

class EncoderLayer(nn.Module):
    def __init__(self, hidden_size, ff_size):
        super().__init__()
        self.self_attention = AttentionLayer(hidden_size)
        self.feed_forward = nn.Sequential(
            nn.Linear(hidden_size, ff_size),
            nn.ReLU(),
            nn.Linear(ff_size, hidden_size)
        )
        self.norm1 = nn.LayerNorm(hidden_size)
        self.norm2 = nn.LayerNorm(hidden_size)
        
    def forward(self, x, mask):
        x = self.norm1(x + self.self_attention(x, x, x, mask))
        x = self.norm2(x + self.feed_forward(x))
        return x

class DecoderLayer(nn.Module):
    def __init__(self, hidden_size, ff_size):
        super().__init__()
        self.self_attention = AttentionLayer(hidden_size)
        self.cross_attention = AttentionLayer(hidden_size)
        self.feed_forward = nn.Sequential(
            nn.Linear(hidden_size, ff_size),
            nn.ReLU(),
            nn.Linear(ff_size, hidden_size)
        )
        self.norm1 = nn.LayerNorm(hidden_size)
        self.norm2 = nn.LayerNorm(hidden_size)
        self.norm3 = nn.LayerNorm(hidden_size)
        
    def forward(self, x, enc_output, src_mask, tgt_mask):
        x = self.norm1(x + self.self_attention(x, x, x, tgt_mask))
        x = self.norm2(x + self.cross_attention(x, enc_output, enc_output, src_mask))
        x = self.norm3(x + self.feed_forward(x))
        return x

class AdvancedTranslationModel(nn.Module):
    def __init__(self, src_vocab_size, tgt_vocab_size, hidden_size=512, ff_size=2048, num_layers=6):
        super().__init__()
        self.encoder_embedding = nn.Embedding(src_vocab_size, hidden_size)
        self.decoder_embedding = nn.Embedding(tgt_vocab_size, hidden_size)
        self.encoder_layers = nn.ModuleList([EncoderLayer(hidden_size, ff_size) for _ in range(num_layers)])
        self.decoder_layers = nn.ModuleList([DecoderLayer(hidden_size, ff_size) for _ in range(num_layers)])
        self.fc_out = nn.Linear(hidden_size, tgt_vocab_size)
        
    def encode(self, src, src_mask):
        x = self.encoder_embedding(src)
        for layer in self.encoder_layers:
            x = layer(x, src_mask)
        return x
    
    def decode(self, tgt, memory, src_mask, tgt_mask):
        x = self.decoder_embedding(tgt)
        for layer in self.decoder_layers:
            x = layer(x, memory, src_mask, tgt_mask)
        return x
    
    def forward(self, src, tgt, src_mask, tgt_mask):
        enc_output = self.encode(src, src_mask)
        dec_output = self.decode(tgt, enc_output, src_mask, tgt_mask)
        return self.fc_out(dec_output)

# Global variables for model and tokenizer
src_tokenizer = None
tgt_tokenizer = None
model = None
current_lang_pair = None

def get_tokenizer_name(lang):
    lang_to_model = {
        'en': 'bert-base-uncased',
        'fr': 'camembert-base',
        'es': 'dccuchile/bert-base-spanish-wwm-uncased',
        'de': 'dbmdz/bert-base-german-uncased',
        'it': 'dbmdz/bert-base-italian-uncased',
        'ja': 'cl-tohoku/bert-base-japanese'
    }
    return lang_to_model.get(lang, 'bert-base-multilingual-uncased')

def initialize_model(source_lang, target_lang, token):
    global src_tokenizer, tgt_tokenizer, model, current_lang_pair
    
    if current_lang_pair != f"{source_lang}-{target_lang}":
        # Initialize tokenizers
        src_tokenizer = BertTokenizer.from_pretrained(get_tokenizer_name(source_lang))
        tgt_tokenizer = BertTokenizer.from_pretrained(get_tokenizer_name(target_lang))
        
        # Initialize the advanced model
        model = AdvancedTranslationModel(len(src_tokenizer), len(tgt_tokenizer))
        
        # Load pre-trained weights if available
        try:
            state_dict = torch.load(f'pretrained_weights_{source_lang}_{target_lang}.pth')
            model.load_state_dict(state_dict)
            print(f"Loaded pre-trained weights for {source_lang}-{target_lang}")
        except FileNotFoundError:
            print(f"No pre-trained weights found for {source_lang}-{target_lang}. Initializing from scratch.")
        
        model.eval()
        current_lang_pair = f"{source_lang}-{target_lang}"

@lru_cache(maxsize=1000)
def cached_translate(text, source_lang, target_lang):
    src_tokens = src_tokenizer.encode(text, return_tensors='pt', padding=True, truncation=True)
    src_mask = (src_tokens != src_tokenizer.pad_token_id).unsqueeze(-2)
    
    with torch.no_grad():
        memory = model.encode(src_tokens, src_mask)
        ys = torch.ones(1, 1).fill_(tgt_tokenizer.cls_token_id).long()
        for i in range(100):
            tgt_mask = (ys != tgt_tokenizer.pad_token_id).unsqueeze(-2)
            out = model.decode(ys, memory, src_mask, tgt_mask)
            prob = model.fc_out(out[:, -1])
            _, next_word = torch.max(prob, dim=1)
            ys = torch.cat([ys, next_word.unsqueeze(0)], dim=1)
            if next_word.item() == tgt_tokenizer.sep_token_id:
                break
    
    return tgt_tokenizer.decode(ys[0], skip_special_tokens=True)

def translate(text, target_language, historical_context=None, token=None):
    try:
        source_lang = 'en'  # Assuming English as the source language
        target_lang = target_language.lower()

        # Map full language names to language codes
        lang_map = {
            'french': 'fr',
            'spanish': 'es',
            'german': 'de',
            'italian': 'it',
            'japanese': 'ja'
        }

        if target_lang in lang_map:
            target_lang = lang_map[target_lang]

        initialize_model(source_lang, target_lang, token)

        translated_text = cached_translate(text, source_lang, target_lang)
        return json.dumps({"translation": translated_text, "target_language": target_language})
    except Exception as e:
        return json.dumps({"error": str(e)})

def fine_tune_model(source_texts, target_texts, source_lang, target_lang, token, num_epochs=3):
    initialize_model(source_lang, target_lang, token)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0001)
    criterion = nn.CrossEntropyLoss(ignore_index=tgt_tokenizer.pad_token_id)
    
    model.train()
    for epoch in range(num_epochs):
        total_loss = 0
        for src_text, tgt_text in zip(source_texts, target_texts):
            src_tokens = src_tokenizer.encode(src_text, return_tensors='pt', padding=True, truncation=True)
            tgt_tokens = tgt_tokenizer.encode(tgt_text, return_tensors='pt', padding=True, truncation=True)
            
            src_mask = (src_tokens != src_tokenizer.pad_token_id).unsqueeze(-2)
            tgt_mask = (tgt_tokens != tgt_tokenizer.pad_token_id).unsqueeze(-2) & torch.triu(torch.ones(1, tgt_tokens.size(1), tgt_tokens.size(1)), diagonal=1).bool()
            
            output = model(src_tokens, tgt_tokens[:, :-1], src_mask, tgt_mask[:, :-1, :-1])
            loss = criterion(output.contiguous().view(-1, len(tgt_tokenizer)), tgt_tokens[:, 1:].contiguous().view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        print(f"Epoch {epoch+1}/{num_epochs}, Loss: {total_loss:.4f}")
    
    model.eval()
    torch.save(model.state_dict(), f'pretrained_weights_{source_lang}_{target_lang}.pth')
    print(f"Fine-tuning complete. Saved weights to pretrained_weights_{source_lang}_{target_lang}.pth")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: python custom_translation_model.py <text> <target_language> <token> [historical_context]"}))
        sys.exit(1)
    
    text = sys.argv[1]
    target_language = sys.argv[2]
    token = sys.argv[3]
    historical_context = sys.argv[4] if len(sys.argv) > 4 else None
    
    result = translate(text, target_language, historical_context, token)
    print(result)
