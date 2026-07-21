# Start from the official Python 3.10 slim image.
# "slim" means it has Python but not extra tools.
# Smaller image = faster build on GitHub runner.
FROM python:3.10-slim

# Set the working directory inside the container.
# All subsequent commands run from this folder.
# COPY puts files here. The script runs from here.
WORKDIR /app

# Copy requirements.txt first.
# Docker caches each line. If requirements don't change,
# Docker skips the pip install step next time.
# This makes rebuilds much faster.
COPY requirements.txt .

# Install Python dependencies.
# --no-cache-dir keeps the image smaller.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the script into the container.
COPY run.py .

# Define the command that runs when the container starts.
# "python run.py" is what executes when GitHub runs this.
CMD ["python", "run.py"]