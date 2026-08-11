import { CalendarEventImportDriverExceptionCode } from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';

export const getCalDAVErrorCodeFromHttpStatus = (
  status: number,
): CalendarEventImportDriverExceptionCode => {
  switch (status) {
    case 401:
    case 403:
      return CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS;

    case 404:
    case 410:
      return CalendarEventImportDriverExceptionCode.NOT_FOUND;

    case 408:
    case 429:
      return CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR;

    default:
      return status >= 500
        ? CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR
        : CalendarEventImportDriverExceptionCode.UNKNOWN;
  }
};
