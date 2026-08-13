import { type Repository } from 'typeorm';

import { MessageChannelSyncStage } from 'twenty-shared/types';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { MESSAGING_IMPORT_ONGOING_SYNC_TIMEOUT } from 'src/modules/messaging/message-import-manager/constants/messaging-import-ongoing-sync-timeout.constant';
import { MessagingOngoingStaleJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-ongoing-stale.job';

jest.useFakeTimers().setSystemTime(new Date('2024-01-01T01:00:00.000Z'));

const STALE_TIMESTAMP = new Date(
  Date.now() - MESSAGING_IMPORT_ONGOING_SYNC_TIMEOUT - 1,
).toISOString();
const FRESH_TIMESTAMP = new Date(
  Date.now() - MESSAGING_IMPORT_ONGOING_SYNC_TIMEOUT + 1,
).toISOString();

describe('MessagingOngoingStaleJob', () => {
  let messageChannelRepository: { find: jest.Mock; update: jest.Mock };
  let messageChannelSyncStatusService: {
    markAsMessagesListFetchPending: jest.Mock;
    markAsMessagesImportPending: jest.Mock;
  };
  let job: MessagingOngoingStaleJob;

  const runWithChannels = async (
    channels: Array<{
      id: string;
      syncStage: MessageChannelSyncStage;
      syncStageStartedAt: string | null;
    }>,
  ) => {
    messageChannelRepository.find.mockResolvedValue(channels);

    await job.handle({ workspaceId: 'workspace-1' });
  };

  beforeEach(() => {
    messageChannelRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    messageChannelSyncStatusService = {
      markAsMessagesListFetchPending: jest.fn(),
      markAsMessagesImportPending: jest.fn(),
    };

    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((fn: () => unknown) => fn()),
    };

    job = new MessagingOngoingStaleJob(
      globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
      messageChannelRepository as unknown as Repository<MessageChannelEntity>,
      messageChannelSyncStatusService as unknown as MessageChannelSyncStatusService,
    );
  });

  it('demotes a stale ongoing channel back to pending (existing behavior)', async () => {
    await runWithChannels([
      {
        id: 'channel-ongoing',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
        syncStageStartedAt: STALE_TIMESTAMP,
      },
    ]);

    expect(messageChannelRepository.update).toHaveBeenCalledWith(
      {
        id: 'channel-ongoing',
        workspaceId: 'workspace-1',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
      },
      { syncStageStartedAt: null },
    );
    expect(
      messageChannelSyncStatusService.markAsMessagesImportPending,
    ).toHaveBeenCalledWith(['channel-ongoing'], 'workspace-1');
  });

  it('leaves a freshly pending channel alone (null syncStageStartedAt is healthy)', async () => {
    await runWithChannels([
      {
        id: 'channel-pending-fresh',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_PENDING,
        syncStageStartedAt: null,
      },
    ]);

    expect(messageChannelRepository.update).not.toHaveBeenCalled();
  });

  it('leaves a recently-throttled pending channel alone (within timeout)', async () => {
    await runWithChannels([
      {
        id: 'channel-pending-recent',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_PENDING,
        syncStageStartedAt: FRESH_TIMESTAMP,
      },
    ]);

    expect(messageChannelRepository.update).not.toHaveBeenCalled();
  });

  it('recovers a pending channel stuck past the timeout with a preserved timestamp', async () => {
    await runWithChannels([
      {
        id: 'channel-pending-stuck',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_PENDING,
        syncStageStartedAt: STALE_TIMESTAMP,
      },
    ]);

    expect(messageChannelRepository.update).toHaveBeenCalledWith(
      {
        id: 'channel-pending-stuck',
        workspaceId: 'workspace-1',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_PENDING,
      },
      { syncStageStartedAt: null },
    );
    expect(
      messageChannelSyncStatusService.markAsMessagesImportPending,
    ).not.toHaveBeenCalled();
    expect(
      messageChannelSyncStatusService.markAsMessagesListFetchPending,
    ).not.toHaveBeenCalled();
  });

  it('recovers a stuck list-fetch-pending channel the same way', async () => {
    await runWithChannels([
      {
        id: 'channel-list-fetch-pending-stuck',
        syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
        syncStageStartedAt: STALE_TIMESTAMP,
      },
    ]);

    expect(messageChannelRepository.update).toHaveBeenCalledWith(
      {
        id: 'channel-list-fetch-pending-stuck',
        workspaceId: 'workspace-1',
        syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      },
      { syncStageStartedAt: null },
    );
    expect(
      messageChannelSyncStatusService.markAsMessagesListFetchPending,
    ).not.toHaveBeenCalled();
  });

  it('does not demote a channel that already moved on before the guarded update ran', async () => {
    // Simulates a fast cron having already advanced this channel out of the
    // stage we snapshotted, between our read and our conditional update.
    messageChannelRepository.update.mockResolvedValue({ affected: 0 });

    await runWithChannels([
      {
        id: 'channel-raced',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
        syncStageStartedAt: STALE_TIMESTAMP,
      },
    ]);

    expect(messageChannelRepository.update).toHaveBeenCalledWith(
      {
        id: 'channel-raced',
        workspaceId: 'workspace-1',
        syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
      },
      { syncStageStartedAt: null },
    );
    expect(
      messageChannelSyncStatusService.markAsMessagesImportPending,
    ).not.toHaveBeenCalled();
    expect(
      messageChannelSyncStatusService.markAsMessagesListFetchPending,
    ).not.toHaveBeenCalled();
  });
});
