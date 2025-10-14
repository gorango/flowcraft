#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Redis image
docker pull redis:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:latest"
else
	echo "Failed to pull redis:latest"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."

