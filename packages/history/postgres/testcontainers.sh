#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull PostgreSQL image
docker pull postgres:16.4
if [ $? -eq 0 ]; then
	echo "Successfully pulled postgres:16.4"
else
	echo "Failed to pull postgres:16.4"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."