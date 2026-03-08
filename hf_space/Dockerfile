FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY agentforge_env /app/agentforge_env
COPY demo /app/demo
COPY data /app/data
COPY outputs /app/outputs
COPY among_us.png among_us_attack.png payment_api_impostor.png /app/
COPY app.py /app/app.py

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
