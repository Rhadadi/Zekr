FROM python:3.12-slim
RUN pip install --no-cache-dir pillow==11.3.0 tzdata==2025.2
WORKDIR /app
COPY app.py ./
COPY logo ./logo
ENV STATE_DIR=/data PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8090
CMD ["python3", "app.py", "serve"]
