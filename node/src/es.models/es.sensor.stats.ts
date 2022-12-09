export interface ESSensorStatsAggregations {
  latest: {
    buckets: Array<{
      key_as_string: string;
      key: number;
      doc_count: number;
      result: {
        count: number;
        min: number;
        max: number;
        sum: number;
        avg: number;
      };
    }>;
  };
}
