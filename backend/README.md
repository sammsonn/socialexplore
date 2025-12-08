# SocialExplore Backend

Backend API pentru platforma SocialExplore, construit cu FastAPI.

## Setup

1. Creează un fișier `.env` bazat pe `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. Instalează dependențele:
   ```bash
   pip install -r requirements.txt
   ```

3. Asigură-te că PostgreSQL cu PostGIS rulează (folosește Docker Compose din root):
   ```bash
   docker-compose up -d postgres
   ```

4. Rulează migrațiile:
   ```bash
   alembic upgrade head
   ```

5. Pornește serverul:
   ```bash
   uvicorn main:app --reload
   ```

API-ul va fi disponibil la `http://localhost:8000`

Documentația API (Swagger) este disponibilă la `http://localhost:8000/docs`

## Structura

- `app/models.py` - Modele SQLAlchemy pentru baza de date
- `app/schemas.py` - Scheme Pydantic pentru validare
- `app/routers/` - Router-e pentru endpoint-uri
- `app/auth.py` - Funcții de autentificare JWT
- `app/database.py` - Configurare baza de date
- `alembic/` - Migrații baza de date

