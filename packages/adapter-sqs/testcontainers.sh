#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull LocalStack image
docker pull localstack/localstack:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled localstack/localstack:latest"
else
	echo "Failed to pull localstack/localstack:latest"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
