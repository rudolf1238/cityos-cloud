export interface ESGenderAge {
  gender: {
    buckets: Array<{
      key: string;
      doc_count: number;
      age: {
        buckets: Array<{
          key: number;
          doc_count: number;
        }>;
      };
    }>;
  };
}
