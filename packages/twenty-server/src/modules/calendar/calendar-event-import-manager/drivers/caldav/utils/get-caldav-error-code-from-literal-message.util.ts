import { CalendarEventImportDriverExceptionCode } from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';

export const getCalDAVErrorCodeFromLiteralMessage = (
  message: string,
): CalendarEventImportDriverExceptionCode => {
  switch (message) {
    case 'Invalid auth method':
    case 'Basic auth header was not encoded correctly':
    case "authMethod 'Custom' requires an authFunction to produce request headers":
      return CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS;

    case 'Collection does not exist on server':
    case 'Calendar object to delete was not found':
    case 'Calendar object to update was not found':
    case 'Created calendar object was not found':
      return CalendarEventImportDriverExceptionCode.NOT_FOUND;

    case 'cannot find principalUrl':
    case 'cannot find homeUrl':
    case 'cannot find calendarUserAddresses':
    case 'no account for fetchCalendars':
    case 'no account for fetchAddressBooks':
    case 'no account for smartCollectionSync':
    case 'Must have account before syncCalendars':
      return CalendarEventImportDriverExceptionCode.TEMPORARY_ERROR;

    case 'cannot fetchCalendarObjects for undefined calendar':
    case 'cannot fetchVCards for undefined addressBook':
    case 'collection.fetchObjects is required for basic sync changes':
    case 'collection.objectMultiGet is required for webdav sync changes':
    case 'timeRange is required':
    case 'invalid timeRange format, not in ISO8601':
    case 'invalid timeRange: start must be before end':
    case 'invalid timeRange: start or end is not a valid date':
    case 'freeBusyQuery returned no response':
    case 'DAVClient not exported from built ESM bundle':
      return CalendarEventImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS;

    default:
      return CalendarEventImportDriverExceptionCode.UNKNOWN;
  }
};
