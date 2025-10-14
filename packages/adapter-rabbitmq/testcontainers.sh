#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull RabbitMQ image
docker pull rabbitmq:management-alpine
if [ $? -eq 0 ]; then
	echo "Successfully pulled rabbitmq:management-alpine"
else
	echo "Failed to pull rabbitmq:management-alpine"
	exit 1
fi

# Pull PostgreSQL image
docker pull postgres:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled postgres:latest"
else
	echo "Failed to pull postgres:latest"
	exit 1
fi

# Pull Redis image
docker pull redis:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:latest"
else
	echo "Failed to pull redis:latest"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
