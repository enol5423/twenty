import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Brackets, type Repository } from 'typeorm';

import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingOngoingStaleCronJob } from 'src/modules/messaging/message-import-manager/crons/jobs/messaging-ongoing-stale.cron.job';
import { MESSAGING_ONGOING_STALE_SYNC_STAGES } from 'src/modules/messaging/message-import-manager/constants/messaging-ongoing-stale-sync-stages.constant';
import { MESSAGING_PENDING_STALE_SYNC_STAGES } from 'src/modules/messaging/message-import-manager/constants/messaging-pending-stale-sync-stages.constant';
import { MessagingOngoingStaleJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-ongoing-stale.job';

type NestedWhereCall = {
  method: 'where' | 'orWhere';
  sql: string;
  params?: unknown;
};

const createQueryBuilderMock = (rawResult: Array<{ workspaceId: string }>) => ({
  select: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(rawResult),
});

describe('MessagingOngoingStaleCronJob', () => {
  let messageChannelRepository: { createQueryBuilder: jest.Mock };
  let messageQueueService: { add: jest.Mock };
  let job: MessagingOngoingStaleCronJob;

  const mockQueryResult = (rawResult: Array<{ workspaceId: string }>) => {
    const queryBuilder = createQueryBuilderMock(rawResult);

    messageChannelRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    return queryBuilder;
  };

  beforeEach(() => {
    messageChannelRepository = { createQueryBuilder: jest.fn() };
    mockQueryResult([
      { workspaceId: 'workspace-1' },
      { workspaceId: 'workspace-1' },
      { workspaceId: 'workspace-2' },
    ]);
    messageQueueService = { add: jest.fn() };
    job = new MessagingOngoingStaleCronJob(
      messageChannelRepository as unknown as Repository<MessageChannelEntity>,
      messageQueueService as unknown as MessageQueueService,
      {
        captureExceptions: jest.fn(),
      } as unknown as ExceptionHandlerService,
    );
  });

  it('enqueues recovery once per workspace with a stale channel', async () => {
    await job.handle();

    expect(messageQueueService.add).toHaveBeenCalledTimes(2);
    expect(messageQueueService.add).toHaveBeenNthCalledWith(
      1,
      MessagingOngoingStaleJob.name,
      {
        workspaceId: 'workspace-1',
      },
    );
    expect(messageQueueService.add).toHaveBeenNthCalledWith(
      2,
      MessagingOngoingStaleJob.name,
      {
        workspaceId: 'workspace-2',
      },
    );
  });

  it('does not enqueue recovery when no workspace has a stale channel', async () => {
    mockQueryResult([]);

    await job.handle();

    expect(messageQueueService.add).not.toHaveBeenCalled();
  });

  it('restricts the query to non-deleted, active workspaces', async () => {
    const queryBuilder = mockQueryResult([]);

    await job.handle();

    expect(messageChannelRepository.createQueryBuilder).toHaveBeenCalledWith(
      'messageChannel',
    );
    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'messageChannel.workspace',
      'workspace',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'workspace.deletedAt IS NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'workspace.activationStatus = :activationStatus',
      { activationStatus: WorkspaceActivationStatus.ACTIVE },
    );
  });

  it('applies the ongoing/scheduled and pending staleness conditions inside the brackets', async () => {
    const queryBuilder = mockQueryResult([]);

    await job.handle();

    const bracketsCall = queryBuilder.andWhere.mock.calls.find(
      ([arg]: [unknown]) => arg instanceof Brackets,
    );

    expect(bracketsCall).toBeDefined();

    const brackets = bracketsCall[0] as Brackets & {
      whereFactory: (queryBuilder: unknown) => void;
    };

    const nestedCalls: NestedWhereCall[] = [];
    const nestedQueryBuilder = {
      where: (sql: string, params?: unknown) => {
        nestedCalls.push({ method: 'where', sql, params });

        return nestedQueryBuilder;
      },
      orWhere: (sql: string, params?: unknown) => {
        nestedCalls.push({ method: 'orWhere', sql, params });

        return nestedQueryBuilder;
      },
    };

    brackets.whereFactory(nestedQueryBuilder);

    expect(nestedCalls).toEqual([
      {
        method: 'where',
        sql: 'messageChannel.syncStage IN (:...ongoingStages) AND (messageChannel.syncStageStartedAt IS NULL OR messageChannel.syncStageStartedAt < :staleBefore)',
        params: {
          ongoingStages: MESSAGING_ONGOING_STALE_SYNC_STAGES,
          staleBefore: expect.any(Date),
        },
      },
      {
        method: 'orWhere',
        sql: 'messageChannel.syncStage IN (:...pendingStages) AND messageChannel.syncStageStartedAt < :staleBefore',
        params: {
          pendingStages: MESSAGING_PENDING_STALE_SYNC_STAGES,
          staleBefore: expect.any(Date),
        },
      },
    ]);
  });
});
