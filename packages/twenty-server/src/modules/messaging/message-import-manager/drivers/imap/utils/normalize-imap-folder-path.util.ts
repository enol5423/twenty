import { type ImapFlow } from 'imapflow';

// RFC 6855 §3 + RFC 5198 §2: UTF-8 mailbox names must be NFC-normalized.
// Legacy modified-UTF-7 sessions have no such rule, so they stay byte-exact.
export const normalizeImapFolderPath = (
  client: ImapFlow,
  folderPath: string,
): string =>
  client.enabled.has('UTF8=ACCEPT') ? folderPath.normalize('NFC') : folderPath;
