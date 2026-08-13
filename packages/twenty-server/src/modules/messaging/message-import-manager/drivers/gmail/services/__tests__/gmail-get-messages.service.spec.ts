import { GmailGetMessagesService } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-get-messages.service';
import { type GmailMessagesImportErrorHandler } from 'src/modules/messaging/message-import-manager/drivers/gmail/services/gmail-messages-import-error-handler.service';
import { type GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

type MockGmailMessageResponse = {
  data: {
    id: string;
    threadId: string;
    historyId: string;
    internalDate: string;
    labelIds: string[];
  };
};

const createDeferred = () => {
  let resolve: (value: MockGmailMessageResponse) => void;
  const promise = new Promise<MockGmailMessageResponse>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: resolve! };
};

const mockMessageResponse = (messageId: string): MockGmailMessageResponse => ({
  data: {
    id: messageId,
    threadId: `thread-${messageId}`,
    historyId: '1',
    internalDate: '1700000000000',
    labelIds: [],
  },
});

describe('GmailGetMessagesService fetchMessages batching', () => {
  it('keeps full-sized batches instead of limiting concurrency down to one message per slot', async () => {
    const service = new GmailGetMessagesService(
      {} as GoogleOAuth2ClientProvider,
      { handleError: jest.fn() } as unknown as GmailMessagesImportErrorHandler,
    );

    const deferredsByMessageId = new Map<
      string,
      ReturnType<typeof createDeferred>
    >();
    const messageIds = Array.from({ length: 250 }, (_, i) => `msg-${i}`);

    for (const messageId of messageIds) {
      deferredsByMessageId.set(messageId, createDeferred());
    }

    const get = jest.fn(
      ({ id }: { id: string }) => deferredsByMessageId.get(id)!.promise,
    );

    const gmailClient = {
      users: { messages: { get } },
    };

    const fetchMessagesPromise = (
      service as unknown as {
        fetchMessages: (
          gmailClient: unknown,
          messageIds: string[],
          connectedAccount: { handle: string; handleAliases: string[] },
        ) => Promise<unknown>;
      }
    ).fetchMessages(gmailClient, messageIds, {
      handle: 'me@example.com',
      handleAliases: [],
    });

    await flushMicrotasks();

    // 250 messages chunked into 5 batches of 50, with only 4 batches allowed
    // to run concurrently: exactly 4 * 50 = 200 individual .get() calls
    // should be in flight, not 4 (the old, message-level-limited behavior)
    // and not all 250 (which would mean no concurrency cap at all).
    expect(get).toHaveBeenCalledTimes(200);

    // Resolving one full batch (50 messages) should free a concurrency slot
    // and let the 5th batch start.
    const firstBatchIds = messageIds.slice(0, 50);

    for (const messageId of firstBatchIds) {
      deferredsByMessageId
        .get(messageId)!
        .resolve(mockMessageResponse(messageId));
    }
    await flushMicrotasks();

    expect(get).toHaveBeenCalledTimes(250);

    for (const messageId of messageIds.slice(50)) {
      deferredsByMessageId
        .get(messageId)!
        .resolve(mockMessageResponse(messageId));
    }

    await fetchMessagesPromise;
  });
});
