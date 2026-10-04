FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Train the model during build so it's baked into the image.
# The .gitignore excludes *.joblib, so the trained model won't
# be in the repo — this step regenerates it deterministically.
RUN python -m app.model.train

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
