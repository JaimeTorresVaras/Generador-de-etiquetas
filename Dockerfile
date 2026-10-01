# Imagen para Railway: sirve la interfaz y el catálogo (PostgreSQL). La impresión
# la hace servidor.py corriendo en la laptop conectada por USB a la Zebra.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements-nube.txt ./
RUN pip install -r requirements-nube.txt
COPY servidor.py catalogo.py ./
COPY web ./web
EXPOSE 8080
CMD ["python", "servidor.py", "--nube"]
