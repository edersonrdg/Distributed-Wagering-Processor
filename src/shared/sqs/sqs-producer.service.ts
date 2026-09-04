import { Inject, Injectable, Logger } from '@nestjs/common';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SQS_CLIENT } from './sqs.constants';

export interface SendMessageOptions {
  deduplicationId?: string;
  groupId?: string;
}

@Injectable()
export class SqsProducerService {
  private readonly logger = new Logger(SqsProducerService.name);

  constructor(@Inject(SQS_CLIENT) private readonly client: SQSClient) {}

  async send(
    queueUrl: string,
    body: unknown,
    options?: SendMessageOptions,
  ): Promise<string> {
    const result = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(body),
        MessageDeduplicationId: options?.deduplicationId,
        MessageGroupId: options?.groupId,
      }),
    );

    if (!result.MessageId) {
      throw new Error(`SQS did not return a MessageId for queue ${queueUrl}`);
    }

    this.logger.debug(`Message ${result.MessageId} sent to ${queueUrl}`);
    return result.MessageId;
  }
}
