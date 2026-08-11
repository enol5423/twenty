import { Injectable, Logger } from '@nestjs/common';

import { CalDavClientProvider } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/providers/caldav-client.provider';
import { CalDavErrorHandler } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-error-handler.service';
import { CalDavFetchEventsService } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-fetch-events.service';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';

@Injectable()
export class CalDavImportEventsService {
  private readonly logger = new Logger(CalDavImportEventsService.name);

  constructor(
    private readonly calDavClientProvider: CalDavClientProvider,
    private readonly fetchEventsService: CalDavFetchEventsService,
    private readonly calDavErrorHandler: CalDavErrorHandler,
  ) {}

  async getCalendarEvents(
    connectedAccountId: string,
    eventExternalIds: string[],
  ): Promise<FetchedCalendarEvent[]> {
    this.logger.debug(
      `Importing ${eventExternalIds.length} calendar events for ${connectedAccountId}`,
    );

    try {
      const client =
        await this.calDavClientProvider.getClient(connectedAccountId);

      return await this.fetchEventsService.fetchEventsByHrefs(
        client,
        eventExternalIds,
      );
    } catch (error) {
      this.calDavErrorHandler.handleError(error, 'getCalendarEvents');
    }
  }
}
