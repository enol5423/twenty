import { Injectable, Logger } from '@nestjs/common';

import { CalDavClientProvider } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/providers/caldav-client.provider';
import { CalDavErrorHandler } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-error-handler.service';
import { CalDavFetchEventsService } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-fetch-events.service';
import { type CalDavSyncCursor } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/types/caldav-sync-cursor';
import { type GetCalendarEventsResponse } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-get-events.service';

@Injectable()
export class CalDavGetEventsService {
  private readonly logger = new Logger(CalDavGetEventsService.name);

  constructor(
    private readonly calDavClientProvider: CalDavClientProvider,
    private readonly fetchEventsService: CalDavFetchEventsService,
    private readonly calDavErrorHandler: CalDavErrorHandler,
  ) {}

  async getCalendarEvents(
    connectedAccountId: string,
    syncCursor?: string,
  ): Promise<GetCalendarEventsResponse> {
    this.logger.debug(`Getting calendar events for ${connectedAccountId}`);

    try {
      const client =
        await this.calDavClientProvider.getClient(connectedAccountId);

      const result = await this.fetchEventsService.fetchChangedEventHrefs(
        client,
        syncCursor ? (JSON.parse(syncCursor) as CalDavSyncCursor) : undefined,
      );

      this.logger.debug(
        `Found ${result.changedHrefs.length} changed and ${result.cancelledHrefs.length} cancelled calendar events for ${connectedAccountId}`,
      );

      return {
        calendarEventIds: result.changedHrefs,
        calendarEventIdsToDelete: result.cancelledHrefs,
        nextSyncCursor: JSON.stringify(result.syncCursor),
      };
    } catch (error) {
      this.calDavErrorHandler.handleError(error, 'getCalendarEvents');
    }
  }
}
