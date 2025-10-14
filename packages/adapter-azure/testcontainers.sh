#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Azurite image
docker pull mcr.microsoft.com/azure-storage/azurite:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled mcr.microsoft.com/azure-storage/azurite:latest"
else
	echo "Failed to pull mcr.microsoft.com/azure-storage/azurite:latest"
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
docker pull redis:latest
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:latest"
else
	echo "Failed to pull redis:latest"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."

