# Railway: sirve la página de etiquetas de precio y la búsqueda en Bsale.
# Solo usa la biblioteca estándar de Python (sin dependencias).
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY servidor.py bsale.py ./
COPY web ./web
EXPOSE 8080
CMD ["python", "servidor.py"]
