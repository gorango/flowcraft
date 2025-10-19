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
docker pull redis:8.2.2
if [ $? -eq 0 ]; then
	echo "Successfully pulled redis:8.2.2"
else
	echo "Failed to pull redis:8.2.2"
	exit 1
fi

echo "All specified Testcontainers images pre-loaded."
