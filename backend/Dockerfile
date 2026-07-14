# Backend image for the Ivory Digital multi-tenant booking platform
FROM python:3.11-slim

WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps (bcrypt etc. build fine on slim with these)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python deps from the docker-specific requirements file
COPY requirements-docker.txt ./
RUN pip install --upgrade pip && pip install -r requirements-docker.txt

# App code
COPY . .

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
