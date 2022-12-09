import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Log, LogSchema } from 'src/models/log';
import { LogService } from './log.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Log.name,
        schema: LogSchema,
        collection: 'logs',
      },
    ]),
  ],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
