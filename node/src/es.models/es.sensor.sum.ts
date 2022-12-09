export interface ESSensorSumAggregations {
  latest: {
    buckets: Array<{
      key_as_string: string;
      key: number;
      doc_count: number;
      result: {
        value: number;
      };
    }>;
  };
}
