"""
==================================================
Seed Data Script for Landings & Annotations
==================================================
Purpose: Populate Firestore with initial seed data for:
- landings collection (landing pages)
- annotations collection (marketing action logs)

This script uses google-cloud-firestore (already in requirements.txt)
instead of firebase-admin to avoid dependency conflicts.
==================================================
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from google.cloud import firestore
from google.oauth2 import service_account
from datetime import datetime

# ==================================================
# SECTION 1: Environment & Firebase Initialization
# ==================================================

def initialize_firestore():
    """
    Initialize Firestore client using service account credentials.
    Returns: Firestore client instance
    """
    # Load environment variables from .env file
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
    
    # Get credentials path
    cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    
    # Fallback to local file if env var is not absolute or missing
    if not cred_path or not os.path.isabs(cred_path):
        default_cred_path = Path(__file__).parent.parent / 'service-account-key.json'
        if default_cred_path.exists():
            cred_path = str(default_cred_path)
    
    if not cred_path:
        raise EnvironmentError("GOOGLE_APPLICATION_CREDENTIALS not found.")
    
    # Initialize Firestore with service account
    credentials = service_account.Credentials.from_service_account_file(cred_path)
    db = firestore.Client(credentials=credentials)
    
    return db

# ==================================================
# SECTION 2: Seed Landings Collection
# ==================================================

def seed_landings(db, project_id):
    """
    Populate 'landings' collection with initial landing page data.
    
    Args:
        db: Firestore client
        project_id: Project identifier (e.g., 'p_main')
    """
    landings = [
        {
            'landing_id': 'landing_main',
            'project_id': project_id,
            'name': 'Main Homepage',
            'url': 'https://mindbodylab.com',
            'is_active': True,
            'created_at': firestore.SERVER_TIMESTAMP
        },
        {
            'landing_id': 'landing_anxiety',
            'project_id': project_id,
            'name': 'Anxiety Program Landing',
            'url': 'https://mindbodylab.com/anxiety',
            'is_active': True,
            'created_at': firestore.SERVER_TIMESTAMP
        },
        {
            'landing_id': 'landing_self_esteem',
            'project_id': project_id,
            'name': 'Self-Esteem Program Landing',
            'url': 'https://mindbodylab.com/self-esteem',
            'is_active': True,
            'created_at': firestore.SERVER_TIMESTAMP
        }
    ]
    
    # Use batch for efficient writes
    batch = db.batch()
    collection_ref = db.collection('landings')
    
    print(f"📍 Seeding {len(landings)} landing pages...")
    for landing in landings:
        doc_ref = collection_ref.document(landing['landing_id'])
        batch.set(doc_ref, landing, merge=True)
        print(f"  - {landing['name']}")
        
    batch.commit()
    print("✓ Landings seeded successfully.\n")

# ==================================================
# SECTION 3: Seed Annotations Collection
# ==================================================

def seed_annotations(db, project_id):
    """
    Populate 'annotations' collection with marketing action logs.
    
    Args:
        db: Firestore client
        project_id: Project identifier (e.g., 'p_main')
    """
    annotations = [
        {
            'annotation_id': 'note_launch',
            'project_id': project_id,
            'date': '2025-11-01',
            'type': 'launch',
            'note': 'Service Official Launch',
            'created_at': firestore.SERVER_TIMESTAMP
        },
        {
            'annotation_id': 'note_ad_boost',
            'project_id': project_id,
            'date': '2025-11-15',
            'type': 'budget',
            'note': 'Increased Instagram Ad Budget by 50%',
            'created_at': firestore.SERVER_TIMESTAMP
        },
        {
            'annotation_id': 'note_black_friday',
            'project_id': project_id,
            'date': '2025-11-25',
            'type': 'promotion',
            'note': 'Black Friday Promotion Started',
            'created_at': firestore.SERVER_TIMESTAMP
        }
    ]
    
    # Use batch for efficient writes
    batch = db.batch()
    collection_ref = db.collection('annotations')
    
    print(f"📝 Seeding {len(annotations)} annotations...")
    for note in annotations:
        doc_ref = collection_ref.document(note['annotation_id'])
        batch.set(doc_ref, note, merge=True)
        print(f"  - {note['date']}: {note['note']}")
        
    batch.commit()
    print("✓ Annotations seeded successfully.\n")

# ==================================================
# SECTION 4: Main Execution
# ==================================================

def main():
    """
    Main execution function.
    Initializes Firestore and seeds both collections.
    """
    try:
        print("\n" + "="*50)
        print("Starting Seed Data Population")
        print("="*50 + "\n")
        
        # Initialize Firestore client
        db = initialize_firestore()
        project_id = os.getenv('PROJECT_ID', 'p_main')
        
        print(f"🎯 Target Project: {project_id}\n")
        
        # Seed collections
        seed_landings(db, project_id)
        seed_annotations(db, project_id)
        
        print("="*50)
        print("✅ All seed data populated successfully!")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"\n❌ Error seeding data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
