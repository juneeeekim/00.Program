# Marketing Analytics ETL Pipeline

## 📋 개요

이 ETL 파이프라인은 CSV 파일에서 마케팅 데이터를 읽어 Firebase Firestore에 적재합니다.

## 🚀 빠른 시작 가이드

### 1. Python 가상환경 생성 및 활성화

```powershell
# 가상환경 생성
python -m venv venv

# 가상환경 활성화 (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# 가상환경 활성화 (Windows CMD)
venv\Scripts\activate.bat
```

### 2. 필수 패키지 설치

```powershell
pip install -r requirements.txt
```

### 3. 환경 변수 설정

1. `.env.example` 파일을 복사하여 `.env` 파일 생성:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Firebase Console에서 서비스 계정 키 다운로드:

   - Firebase Console → 프로젝트 설정 → 서비스 계정
   - "새 비공개 키 생성" 클릭
   - 다운로드한 JSON 파일을 `service-account-key.json`으로 저장

3. `.env` 파일 수정:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   PROJECT_ID=p_main
   LANDING_ID=landing_main
   ```

### 4. ETL 실행

```powershell
python src/main.py
```

## 📁 디렉터리 구조

```
etl/
├── data/
│   ├── input/          # 원본 CSV 파일 위치
│   ├── processed/      # 처리 완료된 파일 (추후 구현)
│   └── error/          # 처리 실패한 파일 (추후 구현)
├── src/
│   └── main.py         # ETL 메인 스크립트
├── .env                # 환경 변수 (Git 제외)
├── .env.example        # 환경 변수 템플릿
├── .gitignore          # Git 제외 파일 목록
├── requirements.txt    # Python 패키지 목록
└── README.md           # 이 파일
```

## ✅ 체크리스트

### 설정 확인

- [ ] Python 3.9+ 설치 확인
- [ ] 가상환경 생성 및 활성화
- [ ] requirements.txt 패키지 설치
- [ ] Firebase 서비스 계정 키 다운로드
- [ ] .env 파일 설정

### 데이터 확인

- [ ] `data/input/` 폴더에 CSV 파일 존재
- [ ] CSV 파일 형식 확인 (헤더 포함)

### 실행 확인

- [ ] `python src/main.py` 실행 성공
- [ ] Firestore Console에서 데이터 확인

## 🔧 문제 해결

### 가상환경 활성화 오류

PowerShell 실행 정책 오류가 발생하면:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Firestore 연결 오류

- 서비스 계정 키 파일 경로 확인
- Firebase 프로젝트 ID 확인
- 인터넷 연결 확인

## 📝 버전 정보

- Version: 0.1 (Phase 1 - Skeleton)
- Date: 2025-11-29
