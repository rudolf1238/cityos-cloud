export interface ESLatestAggregations<T> {
  latest: {
    buckets: Array<{
      key: string;
      doc_count: number;
      latest: {
        hits: {
          total: number;
          max_score: number;
          hits: Array<{
            _index: string;
            _type: string;
            _id: string;
            _score: number;
            _source: T;
            _version?: number;
            fields?: any;
            highlight?: any;
            inner_hits?: any;
            matched_queries?: string[];
            sort?: string[];
          }>;
        };
      };
    }>;
  };
}

export interface ESDeviceStatus {
  deviceId: string;
  time: number;
  status: string;
}
