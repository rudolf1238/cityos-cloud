export interface ESSensorRawHit {
  _id: string;
  _index: string;
  _score: number;
  _source: {
    deviceId: string;
    time: number;
    value: number;
  };
  _type: string;
}

export interface ESSensorRaw {
  hits: ESSensorRawHit[];
  max_score: number;
  total: {
    value: number;
    relation: string;
  };
}
