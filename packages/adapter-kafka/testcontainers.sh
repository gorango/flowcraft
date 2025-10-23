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
docker pull cassandra:5.0.5
if [ $? -eq 0 ]; then
	echo "Successfully pulled cassandra:5.0.5"
else
	echo "Failed to pull cassandra:5.0.5"
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
