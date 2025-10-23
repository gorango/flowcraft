#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Azurite image
docker pull mcr.microsoft.com/azure-storage/azurite:3.35.0
if [ $? -eq 0 ]; then
	echo "Successfully pulled mcr.microsoft.com/azure-storage/azurite:3.35.0"
else
	echo "Failed to pull mcr.microsoft.com/azure-storage/azurite:3.35.0"
	exit 1
fi

# Pull Cosmos DB emulator image
docker pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator
if [ $? -eq 0 ]; then
	echo "Successfully pulled mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator"
else
	echo "Failed to pull mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator"
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

