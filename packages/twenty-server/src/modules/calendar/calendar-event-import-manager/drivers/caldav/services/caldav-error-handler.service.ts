import { Injectable, Logger } from '@nestjs/common';

import { getCalDAVErrorCodeFromLiteralMessage } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/utils/get-caldav-error-code-from-literal-message.util';
import { getCalDAVErrorCodeFromInterpolatedMessage } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/utils/get-caldav-error-code-from-interpolated-message.util';
import { CalendarEventImportDriverException } from 'src/modules/calendar/calendar-event-import-manager/drivers/exceptions/calendar-event-import-driver.exception';
import { CustomException } from 'src/utils/custom-exception';

@Injectable()
export class CalDavErrorHandler {
  private readonly logger = new Logger(CalDavErrorHandler.name);

  public handleError(error: unknown, operation: string): never {
    this.logger.error(
      `CalDAV: Error during ${operation}: ${error instanceof Error ? error.message : String(error)}`,
    );

    if (error instanceof CustomException) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : `Unknown CalDAV error: ${error}`;

    throw new CalendarEventImportDriverException(
      message,
      getCalDAVErrorCodeFromInterpolatedMessage(message) ??
        getCalDAVErrorCodeFromLiteralMessage(message),
    );
  }
}
