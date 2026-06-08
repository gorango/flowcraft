#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull RabbitMQ image
docker pull rabbitmq:3.13.0-management-alpine
if [ $? -eq 0 ]; then
	echo "Successfully pulled rabbitmq:3.13.0-management-alpine"
else
	echo "Failed to pull rabbitmq:3.13.0-management-alpine"
	exit 1
fi

# Pull PostgreSQL image
docker pull postgres:16.4
if [ $? -eq 0 ]; then
	echo "Successfully pulled postgres:16.4"
else
	echo "Failed to pull postgres:16.4"
	exit 1
fi

# Pull Redis image
docker pull redis:8.2.2
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:8.2.2"
else
	echo "Failed to pull redis:8.2.2"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
