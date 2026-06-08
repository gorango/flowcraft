#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Redis image
docker pull redis:8.2.2
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:8.2.2"
else
	echo "Failed to pull redis:8.2.2"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."

