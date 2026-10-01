# Imagen para Railway: sirve solo la interfaz (modo nube). La impresión la hace
# servidor.py corriendo en la laptop conectada por USB a la Zebra.
FROM python:3.12-slim
WORKDIR /app
COPY servidor.py ./
COPY web ./web
ENV PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "servidor.py", "--nube"]
