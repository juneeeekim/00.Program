import pandas as pd
from google.cloud import firestore

def aggregate_data(df):
    """
    데이터프레임을 날짜/채널/프로젝트/랜딩 단위로 그룹핑하여 합산합니다.
    
    Args:
        df (pd.DataFrame): 통합된 데이터프레임
        
    Returns:
        pd.DataFrame: 집계된 데이터프레임
    """
    if df.empty:
        return df
        
    # 그룹핑 키
    group_keys = ['date', 'project_id', 'landing_id', 'channel_id']
    
    # 수치형 컬럼 (존재하는 것만)
    numeric_cols = ['sessions', 'impressions', 'clicks', 'cost', 'revenue', 'purchase_conversions']
    existing_numeric_cols = [col for col in numeric_cols if col in df.columns]
    
    # 그룹핑 및 합산
    # as_index=False로 하여 키를 컬럼으로 유지
    aggregated = df.groupby(group_keys, as_index=False)[existing_numeric_cols].sum()
    
    return aggregated

def upload_to_firestore(db, collection_name, df):
    """
    데이터프레임을 Firestore에 업로드합니다. (Batch 처리)
    
    Args:
        db (firestore.Client): Firestore 클라이언트
        collection_name (str): 컬렉션 이름
        df (pd.DataFrame): 업로드할 데이터프레임
        
    Returns:
        int: 성공 건수
    """
    if df.empty:
        print("No data to upload.")
        return 0
        
    batch = db.batch()
    batch_count = 0
    total_success = 0
    BATCH_LIMIT = 400 # Firestore limit is 500, keeping safety margin
    
    collection_ref = db.collection(collection_name)
    
    print(f"Starting batch upload for {len(df)} records...")
    
    for _, row in df.iterrows():
        # Document ID 생성
        doc_id = f"{row['date']}_{row['project_id']}_{row['landing_id']}_{row['channel_id']}"
        doc_ref = collection_ref.document(doc_id)
        
        # 데이터 딕셔너리 생성
        doc_data = {
            'id': doc_id,
            'date': row['date'],
            'project_id': row['project_id'],
            'landing_id': row['landing_id'],
            'channel_id': row['channel_id'],
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        # 수치 데이터 추가 (0이 아닌 경우에만 저장하거나, 기본값 0)
        if 'sessions' in row: doc_data['sessions'] = int(row['sessions'])
        if 'impressions' in row: doc_data['impressions'] = int(row['impressions'])
        if 'clicks' in row: doc_data['clicks'] = int(row['clicks'])
        if 'cost' in row: doc_data['cost'] = float(row['cost'])
        if 'revenue' in row: doc_data['revenue'] = float(row['revenue'])
        
        # Conversions Map 처리 (현재는 purchase만 있다고 가정)
        if 'purchase_conversions' in row:
            doc_data['conversions'] = {
                'purchase': int(row['purchase_conversions'])
            }
            
        # Batch에 추가 (set merge=True)
        batch.set(doc_ref, doc_data, merge=True)
        batch_count += 1
        
        # 배치 한도 도달 시 커밋
        if batch_count >= BATCH_LIMIT:
            try:
                batch.commit()
                total_success += batch_count
                print(f"  - Committed batch of {batch_count} records")
                batch = db.batch() # 새로운 배치 시작
                batch_count = 0
            except Exception as e:
                print(f"  ✗ Batch commit failed: {str(e)}")
                # 여기서 중단하거나 재시도 로직을 넣을 수 있음. MVP는 로그만 남김.
                
    # 남은 배치 커밋
    if batch_count > 0:
        try:
            batch.commit()
            total_success += batch_count
            print(f"  - Committed final batch of {batch_count} records")
        except Exception as e:
            print(f"  ✗ Final batch commit failed: {str(e)}")
            
    print(f"✓ Upload completed. Total success: {total_success}/{len(df)}")
    return total_success
