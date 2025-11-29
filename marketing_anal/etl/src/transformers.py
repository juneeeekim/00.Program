"""
==================================================
Data Transformers Module
==================================================
Phase 4: Details - Data Validation Implementation

Functions for data transformation and validation:
- normalize_date: Convert various date formats to YYYY-MM-DD
- validate_required_fields: Check for required columns
- validate_numeric: Safely convert to numeric types
- get_traffic_type: Classify traffic as paid/organic
- map_channel: Map source/medium to channel_id

Author: Marketing Analytics Team
Date: 2025-11-29
Version: 0.4 (Phase 4 - Details)
==================================================
"""

import pandas as pd
from datetime import datetime
import re
import logging

# Get logger
logger = logging.getLogger(__name__)

# ==================================================
# SECTION 1: DATA VALIDATION FUNCTIONS
# ==================================================

def validate_required_fields(row, required_fields):
    """
    필수 필드의 존재 여부를 검증합니다.
    
    Args:
        row: DataFrame row
        required_fields: List of required column names
        
    Returns:
        tuple: (is_valid, missing_fields)
    """
    missing_fields = []
    for field in required_fields:
        if field not in row or pd.isna(row[field]) or str(row[field]).strip() == '':
            missing_fields.append(field)
    
    return len(missing_fields) == 0, missing_fields

def validate_numeric(value, field_name, default=0):
    """
    숫자 필드를 안전하게 변환합니다.
    
    Args:
        value: Input value
        field_name: Name of the field (for logging)
        default: Default value if conversion fails
        
    Returns:
        float or int: Converted numeric value
    """
    if pd.isna(value):
        return default
    
    try:
        # Try to convert to numeric
        numeric_value = pd.to_numeric(value)
        return numeric_value if numeric_value >= 0 else default
    except (ValueError, TypeError):
        logger.warning(f"⚠ Invalid numeric value for {field_name}: {value}, using default {default}")
        return default

# ==================================================
# SECTION 2: DATE NORMALIZATION
# ==================================================

def normalize_date(date_input):
    """
    다양한 날짜 포맷을 YYYY-MM-DD 표준 포맷으로 변환합니다.
    
    Args:
        date_input (str or int): 입력 날짜 (예: '20251128', '28/11/2025', 20251128)
        
    Returns:
        str: 'YYYY-MM-DD' 형식의 날짜 문자열
        
    Raises:
        ValueError: 날짜 변환 실패 시
    """
    if pd.isna(date_input):
        raise ValueError("Date is missing")
        
    date_str = str(date_input).strip()
    
    # 포맷 시도 목록
    formats = [
        '%Y%m%d',       # 20251128
        '%Y-%m-%d',     # 2025-11-28
        '%d/%m/%Y',     # 28/11/2025
        '%m/%d/%Y',     # 11/28/2025
        '%Y.%m.%d'      # 2025.11.28
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            # 유효성 검증 (예: 1900년 이전이나 먼 미래는 제외)
            if dt.year < 1900 or dt.year > 2100:
                raise ValueError(f"Date out of range: {date_str}")
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
            
    raise ValueError(f"Unknown date format: {date_str}")

def get_traffic_type(medium):
    """
    utm_medium을 기반으로 traffic_type(paid/organic)을 분류합니다.
    
    Args:
        medium (str): utm_medium 값
        
    Returns:
        str: 'paid' or 'organic' or 'unknown'
    """
    if not medium:
        return 'unknown'
        
    medium = medium.lower().strip()
    
    paid_mediums = ['cpc', 'display', 'sns_ad', 'video_ad', 'paid']
    organic_mediums = ['sns', 'blog', 'social', 'qr', 'organic', 'referral', 'email']
    
    if medium in paid_mediums:
        return 'paid'
    elif medium in organic_mediums:
        return 'organic'
    else:
        # 기본 규칙: _ad가 붙으면 paid, 아니면 organic으로 추정하되 보수적으로 unknown 처리할 수도 있음
        # 여기서는 명시된 것 외에는 unknown으로 처리
        return 'unknown'

def map_channel(source, medium):
    """
    Source/Medium을 기반으로 Channel ID를 매핑합니다.
    실제 구현에서는 Firestore의 channels 컬렉션을 참조해야 하지만,
    MVP 단계에서는 규칙 기반으로 처리합니다.
    
    Args:
        source (str): utm_source
        medium (str): utm_medium
        
    Returns:
        str: channel_id
    """
    if not source or not medium:
        return 'unknown_channel'
        
    s = source.lower().strip()
    m = medium.lower().strip()
    
    # 규칙 기반 매핑 (utm-rules-v0.2.md 참조)
    if s == 'naver' and m == 'cpc':
        return 'naver_sa' # 네이버 검색광고
    elif s == 'google' and m == 'cpc':
        return 'google_sa' # 구글 검색광고
    elif s == 'google' and m == 'display':
        return 'google_da' # 구글 배너광고
    elif s == 'meta' and m == 'sns_ad':
        return 'meta_ad' # 인스타/페북 광고
    elif s == 'youtube' and m == 'video_ad':
        return 'youtube_ad' # 유튜브 광고
        
    elif s == 'instagram' and m == 'sns':
        return 'instagram_organic' # 인스타 프로필
    elif s == 'naver_blog' and m == 'blog':
        return 'naver_blog' # 블로그 포스팅
    elif s == 'youtube' and m == 'social':
        return 'youtube_organic' # 유튜브 설명란
    elif s == 'offline' and m == 'qr':
        return 'offline_qr' # 오프라인 QR
        
    # 매핑 실패 시 조합하여 반환 (추후 DB 등록을 위해)
    return f"{s}_{m}"
