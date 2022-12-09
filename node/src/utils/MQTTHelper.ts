import { Logger } from '@nestjs/common';
import { MqttClient } from 'mqtt';

export default class MQTTHelper {
  private static logger = new Logger(MQTTHelper.name);

  static subscribeMultipleTopics(client: MqttClient, topics: string[]) {
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // subscribe the 50 MQTT topics at once due to limitation
    const batch = 50;
    client.on('connect', () => {
      void (async () => {
        const numberOfBatch = Math.floor(topics.length / batch);
        for (let i = 0; i <= numberOfBatch; i++) {
          let subTopics: string[] = [];
          if (i === numberOfBatch / batch) {
            subTopics = topics.slice(batch * i);
          } else {
            subTopics = topics.slice(batch * i, batch * (i + 1));
          }

          if (subTopics.length === 0) continue;
          client.subscribe(subTopics, { qos: 0 }, (error?: Error) => {
            if (error) {
              MQTTHelper.logger.error(`[MQTT][ERROR]: ${error.message}`);
            }
          });

          await delay(200);
        }
      })();
    });
  }
}
