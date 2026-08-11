import { isDefined } from 'twenty-shared/utils';

import { CALDAV_AUTHENTICATION_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-authentication-error-message-pattern.constant';
import { CALDAV_MISSING_COLLECTION_URL_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-missing-collection-url-error-message-pattern.constant';
import { CALDAV_INCOMPLETE_ACCOUNT_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-incomplete-account-error-message-pattern.constant';
import { CALDAV_HTTP_STATUS_ERROR_MESSAGE_PATTERN } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/constants/caldav-http-status-error-message-pattern.constant';
import { getCalDAVErrorCodeFromHttpStatus } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/utils/get-caldav-error-code-from-http-status.util';
import { CalendarEventImportDriverExceptionCode } from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';

export const getCalDAVErrorCodeFromInterpolatedMessage = (
  message: string,
): CalendarEventImportDriverExceptionCode | undefined => {
  const httpErrorMatch = message.match(
    CALDAV_HTTP_STATUS_ERROR_MESSAGE_PATTERN,
  );

  if (isDefined(httpErrorMatch)) {
    return getCalDAVErrorCodeFromHttpStatus(Number(httpErrorMatch[1]));
  }

  if (CALDAV_AUTHENTICATION_ERROR_MESSAGE_PATTERN.test(message)) {
    return CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS;
  }

  if (CALDAV_MISSING_COLLECTION_URL_ERROR_MESSAGE_PATTERN.test(message)) {
    return CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS;
  }

  if (CALDAV_INCOMPLETE_ACCOUNT_ERROR_MESSAGE_PATTERN.test(message)) {
    return CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR;
  }

  return undefined;
};
