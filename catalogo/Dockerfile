FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY db ./db
COPY scripts ./scripts
EXPOSE 8000
RUN useradd -r catalogo && chown -R catalogo /app
USER catalogo
CMD ["uvicorn", "app.main:app_produccion", "--factory", "--host", "0.0.0.0", "--port", "8000"]
