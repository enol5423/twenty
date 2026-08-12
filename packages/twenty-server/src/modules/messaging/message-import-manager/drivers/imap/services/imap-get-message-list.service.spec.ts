import { Test, type TestingModule } from '@nestjs/testing';

import {
  ConnectedAccountProvider,
  MessageFolderImportPolicy,
  MessageFolderPendingSyncAction,
} from 'twenty-shared/types';

import { type MessageFolder } from 'src/modules/messaging/message-folder-manager/interfaces/message-folder-driver.interface';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { ImapGetMessageListService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-get-message-list.service';
import { ImapMessageListFetchErrorHandler } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-message-list-fetch-error-handler.service';
import { ImapSyncService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-sync.service';

const createMockFolder = (
  overrides: Partial<MessageFolder> &
    Pick<MessageFolder, 'name' | 'externalId' | 'isSynced'>,
): MessageFolder => ({
  id: `folder-${overrides.externalId}`,
  syncCursor: null,
  isSentFolder: false,
  parentFolderId: null,
  pendingSyncAction: MessageFolderPendingSyncAction.NONE,
  ...overrides,
});

describe('ImapGetMessageListService', () => {
  let service: ImapGetMessageListService;
  let imapClientProvider: ImapClientProvider;
  let imapSyncService: ImapSyncService;
  let errorHandler: ImapMessageListFetchErrorHandler;

  const mockConnectedAccount: Pick<
    ConnectedAccountEntity,
    | 'provider'
    | 'accessToken'
    | 'refreshToken'
    | 'id'
    | 'handle'
    | 'connectionParameters'
    | 'workspaceId'
  > = {
    id: 'connected-account-id',
    provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    accessToken: 'access-token' as EncryptedString,
    refreshToken: 'refresh-token' as EncryptedString,
    handle: 'test@example.com',
    connectionParameters: {},
    workspaceId: 'workspace-id',
  };

  const mockImapClient = {
    getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
    mailbox: {
      uidValidity: 12345,
      uidNext: 100,
      highestModseq: '1000',
    },
    capabilities: new Set(['CONDSTORE']),
    enabled: new Set(['UTF8=ACCEPT']),
    status: jest.fn().mockResolvedValue({
      uidValidity: 12345,
      uidNext: 100,
      highestModseq: '1000',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapGetMessageListService,
        {
          provide: ImapClientProvider,
          useValue: {
            getClient: jest.fn().mockResolvedValue(mockImapClient),
            closeClient: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ImapSyncService,
          useValue: {
            syncFolder: jest.fn().mockResolvedValue({ messageUids: [1, 2, 3] }),
          },
        },
        {
          provide: ImapMessageListFetchErrorHandler,
          useValue: {
            handleError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ImapGetMessageListService>(ImapGetMessageListService);
    imapClientProvider = module.get<ImapClientProvider>(ImapClientProvider);
    imapSyncService = module.get<ImapSyncService>(ImapSyncService);
    errorHandler = module.get<ImapMessageListFetchErrorHandler>(
      ImapMessageListFetchErrorHandler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('folder filtering based on import policy', () => {
    it('should only process synced folders when SELECTED_FOLDERS policy is set', async () => {
      const syncedFolder = createMockFolder({
        name: 'INBOX',
        externalId: 'INBOX:1',
        isSynced: true,
      });

      const nonSyncedFolder = createMockFolder({
        name: 'Personal',
        externalId: 'Personal:1',
        isSynced: false,
      });

      const result = await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        messageFolders: [syncedFolder, nonSyncedFolder],
      });

      expect(result).toHaveLength(1);
      expect(result[0].folderId).toBe(syncedFolder.id);
    });

    it('should process all folders when ALL_FOLDERS policy is set', async () => {
      const syncedFolder = createMockFolder({
        name: 'INBOX',
        externalId: 'INBOX:1',
        isSynced: true,
      });

      const nonSyncedFolder = createMockFolder({
        name: 'Personal',
        externalId: 'Personal:1',
        isSynced: false,
      });

      const result = await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [syncedFolder, nonSyncedFolder],
      });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.folderId)).toEqual([
        syncedFolder.id,
        nonSyncedFolder.id,
      ]);
    });

    it('should return empty array when SELECTED_FOLDERS policy and no folders are synced', async () => {
      const nonSyncedFolder1 = createMockFolder({
        name: 'Personal',
        externalId: 'Personal:1',
        isSynced: false,
      });

      const nonSyncedFolder2 = createMockFolder({
        name: 'Work',
        externalId: 'Work:1',
        isSynced: false,
      });

      const result = await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.SELECTED_FOLDERS,
        },
        messageFolders: [nonSyncedFolder1, nonSyncedFolder2],
      });

      expect(result).toHaveLength(0);
    });

    it('should process all non-synced folders when ALL_FOLDERS policy is set', async () => {
      const nonSyncedFolder1 = createMockFolder({
        name: 'Personal',
        externalId: 'Personal:1',
        isSynced: false,
      });

      const nonSyncedFolder2 = createMockFolder({
        name: 'Work',
        externalId: 'Work:1',
        isSynced: false,
      });

      const result = await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [nonSyncedFolder1, nonSyncedFolder2],
      });

      expect(result).toHaveLength(2);
    });

    it('should always close the IMAP client regardless of policy', async () => {
      const folder = createMockFolder({
        name: 'INBOX',
        externalId: 'INBOX:1',
        isSynced: true,
      });

      await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [folder],
      });

      expect(imapClientProvider.closeClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('incremental sync skip', () => {
    const syncedFolder = createMockFolder({
      name: 'INBOX',
      externalId: 'INBOX:12345',
      isSynced: true,
      syncCursor: JSON.stringify({
        highestUid: 99,
        uidValidity: 12345,
        modSeq: '1000',
      }),
    });

    const runSync = () =>
      service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [syncedFolder],
      });

    it('skips folders whose cursor already covers the latest UID', async () => {
      const [result] = await runSync();

      expect(imapSyncService.syncFolder).not.toHaveBeenCalled();
      expect(result.messageExternalIds).toEqual([]);
    });

    it('does not skip when the server omits UIDNEXT on STATUS', async () => {
      mockImapClient.status.mockResolvedValueOnce({
        uidValidity: 12345,
        highestModseq: '1000',
      });

      const [result] = await runSync();

      expect(imapSyncService.syncFolder).toHaveBeenCalledTimes(1);
      expect(result.messageExternalIds).not.toEqual([]);
    });
  });

  describe('per-folder error isolation', () => {
    const ghostFolder = createMockFolder({
      name: 'Anémo+',
      externalId: 'Parent/Subfolder/Anémo+:1',
      isSynced: true,
    });

    const healthyFolder = createMockFolder({
      name: 'INBOX',
      externalId: 'INBOX:1',
      isSynced: true,
    });

    const missingMailboxError = Object.assign(new Error('Command failed'), {
      response: 'NO Mailbox does not exist',
      responseStatus: 'NO',
      responseText: 'Mailbox does not exist',
      executedCommand: 'SELECT "Parent/Subfolder/Anémo+"',
    });

    const runSync = () =>
      service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [ghostFolder, healthyFolder],
      });

    afterEach(() => {
      mockImapClient.getMailboxLock.mockResolvedValue({ release: jest.fn() });
    });

    it('skips a folder whose mailbox no longer exists and syncs the remaining folders', async () => {
      mockImapClient.getMailboxLock.mockImplementation((path: string) =>
        path === 'INBOX'
          ? Promise.resolve({ release: jest.fn() })
          : Promise.reject(missingMailboxError),
      );

      const result = await runSync();

      expect(result).toHaveLength(1);
      expect(result[0].folderId).toBe(healthyFolder.id);
      expect(errorHandler.handleError).not.toHaveBeenCalled();
      expect(imapClientProvider.closeClient).toHaveBeenCalledTimes(1);
    });

    it('still fails the whole sync on errors that are not folder-local', async () => {
      const serverError = Object.assign(new Error('Command failed'), {
        responseStatus: 'NO',
        responseText: 'Server busy, try again later',
      });

      mockImapClient.getMailboxLock.mockRejectedValue(serverError);
      (errorHandler.handleError as jest.Mock).mockImplementation(() => {
        throw new MessageImportDriverException(
          'Unknown IMAP message list fetch error',
          MessageImportDriverExceptionCode.UNKNOWN,
        );
      });

      await expect(runSync()).rejects.toBeInstanceOf(
        MessageImportDriverException,
      );
      expect(errorHandler.handleError).toHaveBeenCalledWith(serverError);
      expect(imapClientProvider.closeClient).toHaveBeenCalledTimes(1);
    });

    it('skips a folder whose externalId has no path instead of failing the sync', async () => {
      const pathlessFolder = createMockFolder({
        name: 'Broken',
        externalId: '',
        isSynced: true,
      });

      const result = await service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [pathlessFolder, healthyFolder],
      });

      expect(result).toHaveLength(1);
      expect(result[0].folderId).toBe(healthyFolder.id);
    });
  });

  describe('unicode folder path normalization', () => {
    const nfdPath = 'Parent/Ane\u0301mo+';
    const nfcPath = 'Parent/An\u00e9mo+';

    const decomposedFolder = createMockFolder({
      name: 'Anémo+',
      externalId: `${nfdPath}:1`,
      isSynced: true,
    });

    const runSync = () =>
      service.getMessageLists({
        connectedAccount: mockConnectedAccount,
        messageChannel: {
          syncCursor: '',
          id: 'channel-1',
          messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
        },
        messageFolders: [decomposedFolder],
      });

    it('selects the NFC form of a stored decomposed path on a UTF8=ACCEPT session', async () => {
      const result = await runSync();

      expect(mockImapClient.getMailboxLock).toHaveBeenCalledWith(nfcPath);
      expect(result[0].messageExternalIds[0]).toBe(`${nfcPath}:3`);
    });
  });
});
