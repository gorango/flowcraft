#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Kafka image
docker pull confluentinc/cp-kafka:7.9.4
if [ $? -eq 0 ]; then
	echo "Successfully pulled confluentinc/cp-kafka:7.9.4"
else
	echo "Failed to pull confluentinc/cp-kafka:7.9.4"
	exit 1
fi

# Pull Cassandra image
docker pull cassandra:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled cassandra:latest"
else
	echo "Failed to pull cassandra:latest"
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
