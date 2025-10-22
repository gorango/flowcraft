#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull LocalStack image
docker pull localstack/localstack:3.8.1
if [ $? -eq 0 ]; then
	echo "Successfully pulled localstack/localstack:3.8.1"
else
	echo "Failed to pull localstack/localstack:3.8.1"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
