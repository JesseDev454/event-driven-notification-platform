import { Repository } from 'typeorm';

import { DeliveryStatus, NotificationChannel } from '../../../types/notification';
import { DeliveryEntity } from '../entities/delivery.entity';

export interface CreateDeliveryInput {
  id: string;
  eventId: string;
  subscriptionId: string;
  channel: NotificationChannel;
  target: string;
}

export class DeliveryRepository {
  constructor(private readonly repository: Repository<DeliveryEntity>) {}

  async createMany(inputs: CreateDeliveryInput[]): Promise<DeliveryEntity[]> {
    const deliveries = inputs.map((input) =>
      this.repository.create({
        id: input.id,
        eventId: input.eventId,
        subscriptionId: input.subscriptionId,
        channel: input.channel,
        target: input.target,
        status: DeliveryStatus.PENDING,
        attemptCount: 0
      })
    );

    return this.repository.save(deliveries);
  }

  async findByEventId(eventId: string): Promise<DeliveryEntity[]> {
    return this.repository.find({
      where: { eventId },
      order: { createdAt: 'ASC' }
    });
  }

  async findById(deliveryId: string): Promise<DeliveryEntity | null> {
    return this.repository.findOne({ where: { id: deliveryId } });
  }

  async markProcessing(deliveryId: string): Promise<DeliveryEntity> {
    const delivery = await this.findById(deliveryId);

    if (!delivery) {
      throw new Error(`Unable to mark delivery ${deliveryId} as processing because it does not exist`);
    }

    delivery.status = DeliveryStatus.PROCESSING;

    return this.repository.save(delivery);
  }

  async markAttemptOutcome(
    deliveryId: string,
    status: DeliveryStatus.SUCCEEDED | DeliveryStatus.FAILED
  ): Promise<DeliveryEntity> {
    const delivery = await this.findById(deliveryId);

    if (!delivery) {
      throw new Error(`Unable to mark delivery ${deliveryId} with final outcome because it does not exist`);
    }

    delivery.status = status;
    delivery.attemptCount += 1;

    return this.repository.save(delivery);
  }
}
