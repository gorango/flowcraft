#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull LocalStack image
docker pull localstack/localstack:4.9.3.dev51
if [ $? -eq 0 ]; then
	echo "Successfully pulled localstack/localstack:4.9.3.dev51"
else
	echo "Failed to pull localstack/localstack:4.9.3.dev51"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
