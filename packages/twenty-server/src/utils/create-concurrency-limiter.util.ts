export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>;

// Caps how many async tasks run at once instead of firing every task with
// Promise.all(), which can overwhelm a downstream provider's rate limit
// (e.g. a large batch of external API calls fired all at once).
export const createConcurrencyLimiter = (
  maxConcurrency: number,
): ConcurrencyLimiter => {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error('Maximum concurrency must be a positive integer');
  }

  let activeTaskCount = 0;
  const waitingTaskResolvers: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (activeTaskCount < maxConcurrency) {
      activeTaskCount++;

      return Promise.resolve();
    }

    return new Promise((resolve) => {
      waitingTaskResolvers.push(resolve);
    });
  };

  const release = () => {
    const nextTaskResolver = waitingTaskResolvers.shift();

    if (nextTaskResolver) {
      nextTaskResolver();

      return;
    }

    activeTaskCount--;
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();

    try {
      return await task();
    } finally {
      release();
    }
  };
};
