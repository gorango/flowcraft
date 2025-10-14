#!/bin/bash

echo "Pre-loading Testcontainers Docker images..."

# Pull Google Cloud CLI emulators image
docker pull gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
if [ $? -eq 0 ]; then
	echo "Successfully pulled gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators"
else
	echo "Failed to pull gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators"
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
