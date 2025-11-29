"""
==================================================
Marketing Analytics ETL Pipeline - Main Script
==================================================
Phase 4: Details - Error Handling & Logging Implementation

This script performs the ETL process with robust error handling:
1. Extract: Read GA and Ad CSV files with error isolation
2. Transform: Normalize dates, map channels, validate data
3. Load: Upload aggregated data to Firestore
4. Logging: Comprehensive logging of all operations

Author: Marketing Analytics Team
Date: 2025-11-29
Version: 0.4 (Phase 4 - Details)
==================================================
"""

import os
import sys
import shutil
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import pandas as pd
from google.cloud import firestore
import logging

# ==================================================
# SECTION 1: LOGGING CONFIGURATION
# ==================================================

def setup_logging():
    """
    로깅 시스템을 설정합니다.
    - logs/ 폴더에 날짜별 로그 파일 생성
    - INFO, WARNING, ERROR 레벨 구분
    - 콘솔과 파일에 동시 출력
    """
    # Ensure logs directory exists
    logs_dir = Path(__file__).parent.parent / 'logs'
    logs_dir.mkdir(exist_ok=True)
    
    # Create log filename with timestamp
    log_filename = f"etl_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_path = logs_dir / log_filename
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_path, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )
    
    return logging.getLogger(__name__)

# Initialize logger
logger = setup_logging()

# ==================================================
# SECTION 2: IMPORT CUSTOM MODULES
# ==================================================

sys.path.append(str(Path(__file__).parent))
from transformers import normalize_date, map_channel
from loaders import aggregate_data, upload_to_firestore

# ==================================================
# SECTION 3: ENVIRONMENT & CONFIGURATION
# ==================================================

def initialize_environment():
    """
    환경 변수를 로드하고 설정을 초기화합니다.
    """
    try:
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(dotenv_path=env_path)
        
        credentials_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
        project_id = os.getenv('PROJECT_ID', 'p_main')
        landing_id = os.getenv('LANDING_ID', 'landing_main')
        
        if not credentials_path:
            default_cred_path = Path(__file__).parent.parent / 'service-account-key.json'
            if default_cred_path.exists():
                credentials_path = str(default_cred_path)
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = credentials_path
            else:
                raise EnvironmentError("GOOGLE_APPLICATION_CREDENTIALS not set")
        
        config = {
            'credentials_path': credentials_path,
            'project_id': project_id,
            'landing_id': landing_id
        }
        
        logger.info("✓ Environment initialized successfully")
        return config
        
    except Exception as e:
        logger.error(f"✗ Error initializing environment: {str(e)}")
        raise

def initialize_firestore():
    """
    Firestore 클라이언트를 초기화합니다.
    """
    try:
        db = firestore.Client()
        logger.info("✓ Firestore client initialized successfully")
        return db
    except Exception as e:
        logger.error(f"✗ Error initializing Firestore: {str(e)}")
        raise

# ==================================================
# SECTION 4: ERROR HANDLING UTILITIES
# ==================================================

def move_to_error_folder(file_path, reason):
    """
    문제가 있는 파일을 error 폴더로 이동합니다.
    
    Args:
        file_path: 이동할 파일 경로
        reason: 에러 원인
    """
    try:
        error_dir = Path(__file__).parent.parent / 'data' / 'error'
        error_dir.mkdir(parents=True, exist_ok=True)
        
        filename = Path(file_path).name
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        new_filename = f"{timestamp}_{filename}"
        error_path = error_dir / new_filename
        
        shutil.move(str(file_path), str(error_path))
        logger.warning(f"⚠ Moved problematic file to error folder: {filename} (Reason: {reason})")
        
    except Exception as e:
        logger.error(f"✗ Failed to move file to error folder: {str(e)}")

# ==================================================
# SECTION 5: DATA PROCESSING WITH ERROR HANDLING
# ==================================================

def process_ga_data(file_path, project_id, landing_id):
    """
    GA 데이터를 로드하고 전처리합니다.
    에러 발생 시 빈 DataFrame을 반환합니다.
    """
    try:
        logger.info(f"Processing GA file: {Path(file_path).name}")
        
        # Load CSV with error handling
        try:
            df = pd.read_csv(file_path)
        except Exception as e:
            logger.error(f"✗ Failed to load CSV: {str(e)}")
            move_to_error_folder(file_path, f"CSV Load Error: {str(e)}")
            return pd.DataFrame()
        
        logger.info(f"✓ Loaded {len(df)} GA rows")
        
        # Process rows with error handling
        valid_rows = []
        skipped_rows = 0
        
        for idx, row in df.iterrows():
            try:
                # 1. 날짜 정규화
                row['date'] = normalize_date(row['date'])
                
                # 2. 채널 매핑
                row['channel_id'] = map_channel(row.get('source', ''), row.get('medium', ''))
                
                # 3. 메타데이터 추가
                row['project_id'] = project_id
                row['landing_id'] = landing_id
                
                valid_rows.append(row)
                
            except Exception as e:
                skipped_rows += 1
                logger.warning(f"⚠ Skipped row {idx}: {str(e)}")
        
        if skipped_rows > 0:
            logger.warning(f"⚠ Skipped {skipped_rows} invalid rows")
        
        result_df = pd.DataFrame(valid_rows)
        
        # 컬럼 매핑
        if 'conversions' in result_df.columns:
            result_df.rename(columns={'conversions': 'purchase_conversions'}, inplace=True)
        
        logger.info(f"✓ Processed {len(result_df)} valid GA rows")
        return result_df
        
    except Exception as e:
        logger.error(f"✗ Error processing GA data: {str(e)}")
        return pd.DataFrame()

def process_ad_data(file_path, project_id, landing_id):
    """
    광고 데이터를 로드하고 전처리합니다.
    에러 발생 시 빈 DataFrame을 반환합니다.
    """
    try:
        logger.info(f"Processing Ad file: {Path(file_path).name}")
        
        # Load CSV with error handling
        try:
            df = pd.read_csv(file_path)
        except Exception as e:
            logger.error(f"✗ Failed to load CSV: {str(e)}")
            move_to_error_folder(file_path, f"CSV Load Error: {str(e)}")
            return pd.DataFrame()
        
        logger.info(f"✓ Loaded {len(df)} Ad rows")
        
        # Process rows with error handling
        valid_rows = []
        skipped_rows = 0
        
        for idx, row in df.iterrows():
            try:
                # 1. 날짜 정규화
                row['date'] = normalize_date(row['date'])
                
                # 2. Source/Medium 추론
                platform = str(row.get('platform', '')).lower()
                if 'naver' in platform:
                    row['source'], row['medium'] = 'naver', 'cpc'
                elif 'google' in platform:
                    row['source'], row['medium'] = 'google', 'cpc'
                elif 'meta' in platform or 'facebook' in platform or 'instagram' in platform:
                    row['source'], row['medium'] = 'meta', 'sns_ad'
                else:
                    row['source'], row['medium'] = 'unknown', 'unknown'
                
                # 3. 채널 매핑
                row['channel_id'] = map_channel(row['source'], row['medium'])
                
                # 4. 메타데이터 추가
                row['project_id'] = project_id
                row['landing_id'] = landing_id
                
                valid_rows.append(row)
                
            except Exception as e:
                skipped_rows += 1
                logger.warning(f"⚠ Skipped row {idx}: {str(e)}")
        
        if skipped_rows > 0:
            logger.warning(f"⚠ Skipped {skipped_rows} invalid rows")
        
        result_df = pd.DataFrame(valid_rows)
        logger.info(f"✓ Processed {len(result_df)} valid Ad rows")
        return result_df
        
    except Exception as e:
        logger.error(f"✗ Error processing Ad data: {str(e)}")
        return pd.DataFrame()

# ==================================================
# SECTION 6: MAIN ETL EXECUTION
# ==================================================

def main():
    """
    메인 ETL 파이프라인 실행
    """
    logger.info("="*50)
    logger.info("ETL Pipeline Started")
    logger.info("="*50)
    
    start_time = datetime.now()
    
    # Statistics tracking
    stats = {
        'files_processed': 0,
        'files_failed': 0,
        'rows_processed': 0,
        'rows_uploaded': 0
    }
    
    try:
        # 1. Initialize
        config = initialize_environment()
        db = initialize_firestore()
        
        # 2. Load CSV files
        data_dir = Path(__file__).parent.parent / 'data' / 'input'
        ga_files = list(data_dir.glob('ga_*.csv'))
        ad_files = list(data_dir.glob('ad_*.csv'))
        
        logger.info(f"Found {len(ga_files)} GA files and {len(ad_files)} Ad files")
        
        all_data = []
        
        # 3. Process GA files
        for ga_file in ga_files:
            try:
                df = process_ga_data(ga_file, config['project_id'], config['landing_id'])
                if not df.empty:
                    all_data.append(df)
                    stats['files_processed'] += 1
                    stats['rows_processed'] += len(df)
                else:
                    stats['files_failed'] += 1
            except Exception as e:
                logger.error(f"✗ Failed to process GA file {ga_file.name}: {str(e)}")
                stats['files_failed'] += 1
        
        # 4. Process Ad files
        for ad_file in ad_files:
            try:
                df = process_ad_data(ad_file, config['project_id'], config['landing_id'])
                if not df.empty:
                    all_data.append(df)
                    stats['files_processed'] += 1
                    stats['rows_processed'] += len(df)
                else:
                    stats['files_failed'] += 1
            except Exception as e:
                logger.error(f"✗ Failed to process Ad file {ad_file.name}: {str(e)}")
                stats['files_failed'] += 1
        
        # 5. Merge and aggregate
        if all_data:
            combined_df = pd.concat(all_data, ignore_index=True)
            logger.info(f"✓ Combined {len(combined_df)} total rows")
            
            aggregated_df = aggregate_data(combined_df)
            logger.info(f"✓ Aggregated to {len(aggregated_df)} unique records")
            
            # 6. Upload to Firestore
            uploaded_count = upload_to_firestore(db, 'metrics_daily', aggregated_df)
            stats['rows_uploaded'] = uploaded_count
            logger.info(f"✓ Uploaded {uploaded_count} records to Firestore")
        else:
            logger.warning("⚠ No valid data to process")
        
        # 7. Final summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        logger.info("="*50)
        logger.info("ETL Pipeline Completed Successfully")
        logger.info("="*50)
        logger.info(f"Duration: {duration:.2f} seconds")
        logger.info(f"Files Processed: {stats['files_processed']}")
        logger.info(f"Files Failed: {stats['files_failed']}")
        logger.info(f"Rows Processed: {stats['rows_processed']}")
        logger.info(f"Rows Uploaded: {stats['rows_uploaded']}")
        logger.info("="*50)
        
    except Exception as e:
        logger.error(f"✗ ETL Pipeline failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise

if __name__ == '__main__':
    main()
