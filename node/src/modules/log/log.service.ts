import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument } from 'src/models/log';

@Injectable()
export class LogService {
  constructor(
    @InjectModel(Log.name)
    private readonly logModel: Model<LogDocument>,
  ) {}

  async insertEvent(log: Log): Promise<Log> {
    return this.logModel.create(log);
  }
}
