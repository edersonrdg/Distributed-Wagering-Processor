#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
MAIN_QUEUE="wager-transactions.fifo"
DLQ="wager-transactions-dlq.fifo"
OUTBOUND_QUEUE="outbound-events.fifo"

dlq_url=$(awslocal sqs create-queue \
  --region "$REGION" \
  --queue-name "$DLQ" \
  --attributes "{\"FifoQueue\": \"true\"}" \
  --query 'QueueUrl' --output text)

dlq_arn=$(awslocal sqs get-queue-attributes \
  --region "$REGION" \
  --queue-url "$dlq_url" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

awslocal sqs create-queue \
  --region "$REGION" \
  --queue-name "$MAIN_QUEUE" \
  --attributes "{
    \"FifoQueue\": \"true\",
    \"ContentBasedDeduplication\": \"false\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\",
    \"VisibilityTimeout\": \"30\"
  }"

awslocal sqs create-queue \
  --region "$REGION" \
  --queue-name "$OUTBOUND_QUEUE" \
  --attributes "{\"FifoQueue\": \"true\", \"ContentBasedDeduplication\": \"false\"}"

echo "LocalStack SQS ready: ${MAIN_QUEUE} (+ DLQ ${DLQ})"
echo "LocalStack SQS Outbound ready: ${OUTBOUND_QUEUE}"