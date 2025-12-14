FROM python:3.10-slim

WORKDIR /app

# Instalează dependențele sistem
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copiază și instalează dependențele Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiază codul aplicației
COPY . .

# Expune portul
EXPOSE 8000

# Comandă default
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]




