import { isNonEmptyArray, isNonEmptyString } from '@sniptt/guards';
import { MessageParticipantRole } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';
import { isUnsubscribeEmail } from 'src/modules/messaging/message-import-manager/utils/is-unsubscribe-email.util';

const UNSUBSCRIBE_COMMAND_SUBJECT = 'unsubscribe';

const RECIPIENT_ROLES: MessageParticipantRole[] = [
  MessageParticipantRole.TO,
  MessageParticipantRole.CC,
  MessageParticipantRole.BCC,
];

export const filterOutUnsubscribeRequests = (
  messageChannelHandles: string[],
  messages: MessageWithParticipants[],
) => {
  const ownHandles = messageChannelHandles.map((handle) =>
    handle.toLowerCase(),
  );

  return messages.filter((message) => {
    if (!isDefined(message.participants)) {
      return true;
    }

    const counterpartyHandles = message.participants
      .map((participant) => participant.handle?.toLowerCase())
      .filter(isNonEmptyString)
      .filter((handle) => !ownHandles.includes(handle));

    if (!isNonEmptyArray(counterpartyHandles)) {
      return true;
    }

    if (counterpartyHandles.every(isUnsubscribeEmail)) {
      return false;
    }

    const counterpartyRecipients = message.participants.filter(
      (participant) =>
        RECIPIENT_ROLES.includes(participant.role) &&
        isNonEmptyString(participant.handle) &&
        !ownHandles.includes(participant.handle.toLowerCase()),
    );

    const counterpartyRecipientHandles = new Set(
      counterpartyRecipients
        .map((participant) => participant.handle?.toLowerCase())
        .filter(isNonEmptyString),
    );

    const isUnsubscribeCommandToSingleAutomatedRecipient =
      message.direction === MessageDirection.OUTGOING &&
      counterpartyRecipientHandles.size === 1 &&
      counterpartyRecipients.every(
        (participant) => !isNonEmptyString(participant.displayName),
      ) &&
      message.subject?.trim().toLowerCase() === UNSUBSCRIBE_COMMAND_SUBJECT;

    return !isUnsubscribeCommandToSingleAutomatedRecipient;
  });
};
