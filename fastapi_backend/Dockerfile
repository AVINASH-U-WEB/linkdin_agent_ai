FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
# Install dependencies (no-cache-dir reduces image size)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Hugging Face Spaces exposes port 7860 by default for Docker spaces
EXPOSE 7860

# Command to run the FastAPI app on the correct port
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
