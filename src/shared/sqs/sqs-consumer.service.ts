import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import { SQS_CLIENT } from './sqs.constants';

@Injectable()
export abstract class SqsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  protected abstract readonly queueUrl: string;
  protected readonly logger = new Logger(this.constructor.name);

  private polling = false;
  private loop: Promise<void> | null = null;

  constructor(@Inject(SQS_CLIENT) protected readonly client: SQSClient) {}

  onModuleInit(): void {
    this.polling = true;
    this.loop = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.polling = false;
    await this.loop;
  }

  protected abstract handleMessage(message: Message): Promise<void>;

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const { Messages } = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5,
          }),
        );

        for (const message of Messages ?? []) {
          await this.processMessage(message);
        }
      } catch (error) {
        this.logger.error(
          'Error polling SQS queue',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async processMessage(message: Message): Promise<void> {
    try {
      await this.handleMessage(message);
      if (message.ReceiptHandle) {
        await this.client.send(
          new DeleteMessageCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process message ${message.MessageId ?? '(unknown)'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
