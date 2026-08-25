type RetryAttemptState = {
  status: string;
  attempt?: number;
  startedAt?: string;
  completedAt?: string;
  jobId?: string;
};

export function attemptAfterRetryInvalidation(block: RetryAttemptState) {
  const hasExistingAttempt =
    block.status !== "pending" || Boolean(block.startedAt || block.completedAt || block.jobId);
  return hasExistingAttempt ? (block.attempt ?? 1) + 1 : block.attempt;
}
