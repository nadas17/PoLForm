# core/minimax_extractor.py
"""
MiniMax (Global) ile akıllı belge çıkarma.

Aynı arayüzü sunar:
    extract_with_minimax(raw_text, field_map, api_key, group_id=None, model=...)
        → (mappings, missing_fields)

OpenAI uyumlu chat completion endpoint'ini kullanır:
    POST https://api.minimax.io/v1/text/chatcompletion_v2

Form-spesifik prompt zaten field_map'ten türetilen schema ile dinamik üretilir.
"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx

logger = logging.getLogger(__name__)

# Global endpoint (MiniMax International)
DEFAULT_ENDPOINT = "https://api.minimax.io/v1/text/chatcompletion_v2"
DEFAULT_MODEL = "MiniMax-M2.7"  # Reasoning modeli — <think> blokları otomatik sıyrılır
DEFAULT_TIMEOUT = 60.0
MAX_TOKENS = 8192
TEMPERATURE = 0.0
MAX_RETRIES = 2
RETRY_BASE_DELAY = 2  # seconds


class MinimaxError(Exception):
    """MiniMax API çağrısı hatası."""


# ───────────────────────── Helper'lar ─────────────────────────

def build_field_schema(field_map):
    """form_field_map'ten model'e gönderilecek alan şemasını oluşturur."""
    schema = []
    for f in field_map.get("form_fields", []):
        ft = f.get("field_type", "")
        if ft in ("photo_box", "info_box"):
            continue
        schema.append({
            "field_id": f["field_id"],
            "label": f.get("label", ""),
            "type": ft,
            "max_len": f.get("num_cells", 0),
        })
    return schema


def _clean_json_response(text: str) -> str:
    """
    Model yanıtından JSON objesini çıkarır.

    Sırasıyla temizlenir:
    1) <think>...</think> bloklarını (MiniMax M2.x reasoning chain-of-thought)
    2) ```json ... ``` markdown fence'lerini
    3) Yanıtın başındaki/sonundaki açıklayıcı metni — tek bir JSON objesi kalsın
    """
    text = text.strip()

    # 1) <think>...</think> bloklarını sıyır (MiniMax-M2.x reasoning)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    # Açık kalmış <think> tag'i (model thinking'i tamamlamadıysa)
    text = re.sub(r"^<think>.*$", "", text, flags=re.DOTALL).strip()

    # 2) Markdown code fence
    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    # 3) İlk { ... son } arasını al (JSON nesnesi kalsın)
    if text and text[0] != "{":
        first = text.find("{")
        last = text.rfind("}")
        if first >= 0 and last > first:
            text = text[first:last + 1]

    return text


SYSTEM_PROMPT_TEMPLATE = """\
You are an intelligent reasoning agent for document data extraction. Your task is to extract personal information from parsed document text and map it to specific form fields.

## Reasoning Approach
- Analyze the document holistically — understand context, infer relationships between data points.
- If a value appears in a different format or language, interpret and convert it appropriately.
- Use surrounding context clues to resolve ambiguities (e.g., if marital status says "BEKAR" and sex is male, use the male form "KAWALER").
- Think about what each piece of information means, not just what it literally says.

## Turkish → Polish Translation
Source documents may be in Turkish. ALL extracted values must be written in POLISH for the form.

Key translations you MUST apply:
- Sex: ERKEK/BAY → M, KADIN/BAYAN → K
- Marital status: BEKAR → KAWALER (male) / PANNA (female), EVLİ → ŻONATY (male) / ZAMĘŻNA (female), BOŞANMIŞ → ROZWIEDZIONY (male) / ROZWIEDZIONA (female), DUL → WDOWIEC (male) / WDOWA (female)
- Country names: TÜRKİYE → TURCJA, ALMANYA → NIEMCY, FRANSA → FRANCJA, İNGİLTERE → WIELKA BRYTANIA, İTALYA → WŁOCHY, İSPANYA → HISZPANIA, HOLLANDA → HOLANDIA, BELÇİKA → BELGIA, AVUSTURYA → AUSTRIA, İSVİÇRE → SZWAJCARIA, YUNANISTAN → GRECJA, BULGARISTAN → BUŁGARIA, ROMANYA → RUMUNIA, UKRAYNA → UKRAINA, RUSYA → ROSJA, İRAN → IRAN, IRAK → IRAK, SURİYE → SYRIA, MISIR → EGIPT, ABD/AMERİKA → USA, KANADA → KANADA, ÇİN → CHINY, JAPONYA → JAPONIA, GÜNEY KORE → KOREA POŁUDNIOWA, HİNDİSTAN → INDIE, PAKİSTAN → PAKISTAN, BANGLADEŞ → BANGLADESZ, AFGANISTAN → AFGANISTAN, NEPAL → NEPAL, SRİ LANKA → SRI LANKA, GÜRCÜSTAN → GRUZJA, AZERBAYCAN → AZERBEJDŻAN, ÖZBEKİSTAN → UZBEKISTAN, TÜRKMENİSTAN → TURKMENISTAN, KAZAKISTAN → KAZACHSTAN, KIRGIZISTAN → KIRGISTAN, TAYİKİSTAN → TADŻYKISTAN, BREZİLYA → BRAZYLIA, ARJANTİN → ARGENTYNA, POLONYA → POLSKA
- Month names (Turkish → Polish): OCAK → STYCZEŃ, ŞUBAT → LUTY, MART → MARZEC, NİSAN → KWIECIEŃ, MAYIS → MAJ, HAZİRAN → CZERWIEC, TEMMUZ → LIPIEC, AĞUSTOS → SIERPIEŃ, EYLÜL → WRZESIEŃ, EKİM → PAŹDZIERNIK, KASIM → LISTOPAD, ARALIK → GRUDZIEŃ
- Citizenship/nationality: TÜRK → TURECKIE (neuter) / TURECKA (female) / TURECKI (male)
- Kinship: EŞ → MAŁŻONEK (male) / MAŁŻONKA (female), OĞUL → SYN, KIZ → CÓRKA, ANNE → MATKA, BABA → OJCIEC
- Education: İLKOKUL → PODSTAWOWE, ORTAOKUL → GIMNAZJALNE, LİSE → ŚREDNIE, ÜNİVERSİTE → WYŻSZE
- Yes/No: EVET → TAK, HAYIR → NIE
- Permit/residence: VİZE → WIZA, OTURMA İZNİ → ZEZWOLENIE NA POBYT CZASOWY, ÇALIŞMA İZNİ → ZEZWOLENIE NA PRACĘ, SÜRESIZ OTURMA → ZEZWOLENIE NA POBYT STAŁY
- City names in Poland should remain in Polish (WARSZAWA, KRAKÓW, etc.)
- Turkish city names should be transliterated: İSTANBUL → STAMBUŁ, ANKARA → ANKARA, İZMİR → IZMIR, etc.

## Voivodeship Inference (MANDATORY)
CRITICAL: When you find a Polish city in the address, you MUST ALWAYS infer and fill BOTH `addr_1_voivodeship` AND `do_authority` with the correct voivodeship name. NEVER leave these empty if a Polish city is found in the document. Use this mapping:
- WARSZAWA, RADOM, PŁOCK, SIEDLCE, OSTROŁĘKA → MAZOWIECKIE
- KRAKÓW, TARNÓW, NOWY SĄCZ, OŚWIĘCIM → MAŁOPOLSKIE
- GDAŃSK, GDYNIA, SOPOT, SŁUPSK, TCZEW → POMORSKIE
- WROCŁAW, WAŁBRZYCH, LEGNICA, JELENIA GÓRA → DOLNOŚLĄSKIE
- POZNAŃ, KALISZ, KONIN, PIŁA, LESZNO → WIELKOPOLSKIE
- ŁÓDŹ, PIOTRKÓW TRYBUNALSKI, SKIERNIEWICE → ŁÓDZKIE
- KATOWICE, CZĘSTOCHOWA, GLIWICE, ZABRZE, BIELSKO-BIAŁA, SOSNOWIEC, BYTOM, TYCHY, RYBNIK → ŚLĄSKIE
- LUBLIN, ZAMOŚĆ, CHEŁM, BIAŁA PODLASKA → LUBELSKIE
- BIAŁYSTOK, ŁOMŻA, SUWAŁKI → PODLASKIE
- SZCZECIN, KOSZALIN, STARGARD → ZACHODNIOPOMORSKIE
- RZESZÓW, PRZEMYŚL, KROSNO, STALOWA WOLA → PODKARPACKIE
- BYDGOSZCZ, TORUŃ, WŁOCŁAWEK, GRUDZIĄDZ, INOWROCŁAW → KUJAWSKO-POMORSKIE
- KIELCE, RADOM, OSTROWIEC ŚWIĘTOKRZYSKI → ŚWIĘTOKRZYSKIE
- OLSZTYN, ELBLĄG, EŁK → WARMIŃSKO-MAZURSKIE
- ZIELONA GÓRA, GORZÓW WIELKOPOLSKI → LUBUSKIE
- OPOLE, NYSA, KĘDZIERZYN-KOŹLE → OPOLSKIE
If the city is not listed above, use your knowledge of Polish geography to determine the correct voivodeship.

For any Turkish word not listed above, translate it to Polish using your knowledge.

## Form Fields Schema
The following JSON array describes all form fields you need to fill:
```json
{field_schema_json}
```

## Rules
1. **Output format:** Return ONLY a JSON object with two keys: "fields" and "missing_fields". No markdown, no explanations, no code fences.
   Example:
   {{
     "fields": {{"field_01_surname": "YILMAZ", "field_09_dob": "1990/05/15"}},
     "missing_fields": [{{"field_id": "field_19_phone", "label": "Numer telefonu", "reason": "Belgede telefon bilgisi bulunamadı"}}]
   }}

2. **Text cleaning:** Remove ALL markdown artifacts from values: no `**`, `*`, `#`, `|`, `---`, backticks, or other formatting characters. Return clean plain text only.

3. **Uppercase:** All text values must be UPPERCASE.

4. **Date format:** All dates must be in YYYY/MM/DD format. If only year is available, use YYYY. If year+month, use YYYY/MM.

5. **max_len:** If a field has max_len > 0, the value must not exceed that character count. Truncate if necessary.

6. **Checkbox fields:** For checkbox/boolean fields, use string "true" or "false".

7. **Family table:** Family members use pattern `family_N_column` where N=1-6 and columns are: name, sex, dob, kinship, citizenship, residence, temp_permit, dependent.
   - sex: "M" or "K" (male/female in Polish)
   - temp_permit and dependent: "TAK" or "NIE"

8. **Previous residences (section 3a):** Use `p3a_r{{i}}_period` and `p3a_r{{i}}_basis` where i=1-6.
   - period format: "YYYY/MM-YYYY/MM"

9. **Previous stays abroad (section 5b):** Use `p5b_r{{j}}_period` and `p5b_r{{j}}_basis` where j=1-4.
   - IMPORTANT: Translate month names and country names to Polish. Example: "EKIM 2024 – ŞUBAT 2025" → "PAŹDZIERNIK 2024 – LUTY 2025", "TURCJA" not "TÜRKİYE".

10. **Financial means (section V):** Use `p5_finance_r1` to `p5_finance_r4` for information about financial resources (employment, salary, savings, etc.). Write in Polish.

11. **Health insurance (section VI):** Use `p5_insurance_r1` to `p5_insurance_r4` for health insurance information (ZUS/NFZ, policy number, etc.). Write in Polish.

12. **Only include fields where you found a matching value in the document.** Do not guess or fabricate values. If a field has no corresponding data in the document, omit it from the output.

13. **Address fields:** addr_1_voivodeship, addr_2_city, addr_3_street, addr_4_house_no, addr_5_flat_no, addr_6_postal_code.
   - CRITICAL: You MUST ALWAYS fill `addr_1_voivodeship` by inferring from `addr_2_city` using the Voivodeship Inference table above. For example, if city is GDAŃSK → voivodeship is POMORSKIE. Never leave voivodeship empty if a city is found.

14. **Application metadata:** do_authority (voivodeship — infer from address city, same as addr_1_voivodeship), date_year, date_month, date_day.

## Missing Fields Detection
After extraction, identify CRITICAL fields that could not be found in the document. Only report truly important missing fields from these categories:
- Personal info: surname, name, date of birth, sex, citizenship, nationality, birthplace, birth country
- Parent info: father's name, mother's name, mother's maiden name
- Marital status, education
- Contact: phone, email
- Address fields (if no address info at all was found)

Do NOT list every empty field — only the important ones that a human would expect to find in this type of document. Provide the reason in Turkish (the user's language).
"""


# ───────────────────────── Ana fonksiyon ─────────────────────────

def extract_with_minimax(
    raw_text: str,
    field_map: dict,
    api_key: str,
    group_id: str | None = None,
    model: str = DEFAULT_MODEL,
    endpoint: str = DEFAULT_ENDPOINT,
):
    """
    MiniMax API ile ham metinden form alanlarına eşleştirme yapar.

    Args:
        raw_text: LlamaParse'tan gelen ham metin
        field_map: form_field_map içeriği (build_field_schema() için)
        api_key: MINIMAX_API_KEY
        group_id: MINIMAX_GROUP_ID (opsiyonel)
        model: Model adı — default MiniMax-Text-01
        endpoint: Chat completion endpoint (default Global)

    Returns:
        (mappings, missing_fields)

    Raises:
        MinimaxError: API hatası, JSON parse hatası vb.
    """
    if not api_key:
        raise MinimaxError("MINIMAX_API_KEY boş olamaz")

    field_schema = build_field_schema(field_map)
    field_schema_json = json.dumps(field_schema, ensure_ascii=False, indent=2)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(field_schema_json=field_schema_json)

    user_message = (
        "Extract all personal information from the following parsed document text "
        "and map them to the form fields described in the system prompt.\n\n"
        "--- DOCUMENT TEXT START ---\n"
        f"{raw_text}\n"
        "--- DOCUMENT TEXT END ---"
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if group_id:
        headers["X-MiniMax-Group-Id"] = group_id

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "stream": False,
        # NOT: MiniMax-Text-01 "response_format" parametresini desteklemez
        # (status_code 2013 döner). JSON çıktısı sadece sistem prompt'undaki
        # talimat ile garanti edilir; _clean_json_response() markdown fence'leri temizler.
    }

    url = endpoint
    if group_id and "GroupId" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}GroupId={group_id}"

    response_data = None
    last_error: Exception | None = None

    for attempt in range(1 + MAX_RETRIES):
        try:
            with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
                resp = client.post(url, headers=headers, json=payload)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise MinimaxError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            if resp.status_code != 200:
                raise MinimaxError(f"HTTP {resp.status_code}: {resp.text[:500]}")
            response_data = resp.json()
            break
        except (httpx.TimeoutException, httpx.NetworkError, MinimaxError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "MiniMax API hatası (deneme %d/%d): %s — %ds sonra tekrar denenecek",
                    attempt + 1, 1 + MAX_RETRIES, exc, delay,
                )
                time.sleep(delay)
            else:
                logger.error("MiniMax API %d denemeden sonra başarısız: %s",
                             1 + MAX_RETRIES, exc)
                raise MinimaxError(f"MiniMax çağrısı başarısız: {exc}") from exc

    try:
        choices = response_data.get("choices", [])
        if not choices:
            raise MinimaxError(f"MiniMax 'choices' boş döndü: {response_data}")
        content = choices[0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise MinimaxError(f"MiniMax yanıt formatı beklenmedik: {response_data}") from exc

    if not content or not content.strip():
        raise MinimaxError("MiniMax boş içerik döndü")

    logger.debug("MiniMax raw response: %s", content[:500])

    cleaned = _clean_json_response(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("MiniMax JSON parse hatası: %s\nResponse: %s", exc, cleaned[:500])
        raise MinimaxError(f"MiniMax yanıtı JSON olarak ayrıştırılamadı: {exc}") from exc

    if "fields" in parsed and isinstance(parsed["fields"], dict):
        extracted = parsed["fields"]
        missing_fields = parsed.get("missing_fields", [])
    else:
        extracted = parsed
        missing_fields = []

    field_lookup = {f["field_id"]: f for f in field_map.get("form_fields", [])}

    mappings = []
    for field_id, value in extracted.items():
        field_info = field_lookup.get(field_id)
        if field_info is None:
            logger.warning("MiniMax bilinmeyen field_id döndü: %s", field_id)
            continue

        value_str = str(value) if not isinstance(value, str) else value
        max_length = field_info.get("num_cells", 0)
        value_fits = len(value_str) <= max_length if max_length > 0 else True

        mappings.append({
            "extracted_key": field_info.get("label", field_id),
            "extracted_value": value_str,
            "matched_field_id": field_id,
            "confidence": 0.93,
            "field_label": field_info.get("label", ""),
            "field_type": field_info.get("field_type", ""),
            "max_length": max_length,
            "value_fits": value_fits,
        })

    logger.info("MiniMax %d alan eşleştirdi, %d eksik alan tespit edildi",
                len(mappings), len(missing_fields))
    return mappings, missing_fields
