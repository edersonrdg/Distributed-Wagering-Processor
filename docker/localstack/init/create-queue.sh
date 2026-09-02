#!/usr/bin/env bash
# Bootstraps the SQS queues LocalStack needs for local development/tests.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
MAIN_QUEUE="wager-events"
DLQ="wager-events-dlq"

dlq_arn=$(awslocal sqs create-queue \
  --region "$REGION" \
  --queue-name "$DLQ" \
  --query 'QueueUrl' --output text)
dlq_arn=$(awslocal sqs get-queue-attributes \
  --region "$REGION" \
  --queue-url "$dlq_arn" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --region "$REGION" \
  --queue-name "$MAIN_QUEUE" \
  --attributes "{
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\",
    \"VisibilityTimeout\": \"30\"
  }"

echo "LocalStack SQS ready: ${MAIN_QUEUE} (+ DLQ ${DLQ})"
