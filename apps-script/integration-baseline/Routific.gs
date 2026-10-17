/**
 * MA KITCHENS - ROUTIFIC INTEGRATION
 *
 * Script Properties required:
 * ROUTIFIC_API_TOKEN
 * ROUTIFIC_WORKSPACE_UUID
 */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const ROUTIFIC_CONFIG = {
  DISPATCH_SHEET: 'Routific Dispatch',
  DISPATCH_DATE_CELL: 'B3',

  ORDERS_SHEET: 'Orders',
  DELIVERIES_SHEET: 'Deliveries',

  DEFAULT_STOP_DURATION_SECONDS: 300
};


/* =========================================================
   CONNECTION TEST
   ========================================================= */

function testRoutificConnection() {

  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('ROUTIFIC_API_TOKEN');

  if (!token) {
    throw new Error(
      'ROUTIFIC_API_TOKEN was not found in Script Properties.'
    );
  }

  const response = UrlFetchApp.fetch(
    'https://api.plan.routific.com/v2/workspaces',
    {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json'
      },
      muteHttpExceptions: true
    }
  );

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  Logger.log('HTTP Status: ' + statusCode);
  Logger.log('Response: ' + body);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      'Routific connection failed. HTTP ' +
      statusCode +
      ': ' +
      body
    );
  }

  const data = JSON.parse(body);

  if (!data.items || data.items.length === 0) {
    throw new Error(
      'Connected to Routific, but no workspaces were returned.'
    );
  }

  Logger.log('SUCCESS: Routific connection established.');

  data.items.forEach(function(workspace) {
    Logger.log(
      'Workspace: ' +
      workspace.name +
      ' | UUID: ' +
      workspace.uuid +
      ' | ID: ' +
      workspace.id
    );
  });
}


/* =========================================================
   PRODUCTION BATCH SEND
   ========================================================= */

/**
 * Sends eligible confirmed orders for the delivery date
 * selected in Routific Dispatch!B3.
 *
 * Eligibility:
 * 1. Delivery Date = selected date
 * 2. Order Status = Confirmed
 * 3. Order Check = OK
 * 4. Customer Name exists
 * 5. Phone exists
 * 6. Delivery Address exists
 * 7. Delivery Window is valid
 *
 * Payment Status deliberately does NOT affect eligibility.
 *
 * Duplicate protection:
 * Any order with a Routific UUID or Sync Status = Synced
 * in Deliveries will not be sent again.
 */
function sendConfirmedOrdersToRoutific() {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    SpreadsheetApp.getUi().alert(
      'Another Routific process is already running. Please try again shortly.'
    );
    return;
  }

  try {

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();

    const dispatchSheet =
      ss.getSheetByName(ROUTIFIC_CONFIG.DISPATCH_SHEET);

    const ordersSheet =
      ss.getSheetByName(ROUTIFIC_CONFIG.ORDERS_SHEET);

    const deliveriesSheet =
      ss.getSheetByName(ROUTIFIC_CONFIG.DELIVERIES_SHEET);

    if (!dispatchSheet || !ordersSheet || !deliveriesSheet) {
      throw new Error(
        'One or more required Control Tower sheets were not found.'
      );
    }


    /* -----------------------------------------------------
       CREDENTIALS
       ----------------------------------------------------- */

    const properties =
      PropertiesService.getScriptProperties();

    const token =
      properties.getProperty('ROUTIFIC_API_TOKEN');

    const workspaceUuid =
      properties.getProperty('ROUTIFIC_WORKSPACE_UUID');

    if (!token) {
      throw new Error(
        'ROUTIFIC_API_TOKEN was not found in Script Properties.'
      );
    }

    if (!workspaceUuid) {
      throw new Error(
        'ROUTIFIC_WORKSPACE_UUID was not found in Script Properties.'
      );
    }


    /* -----------------------------------------------------
       SELECTED DELIVERY DATE
       ----------------------------------------------------- */

    const selectedDate =
      dispatchSheet
        .getRange(ROUTIFIC_CONFIG.DISPATCH_DATE_CELL)
        .getValue();

    if (
      !selectedDate ||
      Object.prototype.toString.call(selectedDate) !== '[object Date]' ||
      isNaN(selectedDate.getTime())
    ) {
      ui.alert(
        'Please select a valid delivery date in Routific Dispatch cell B3.'
      );
      return;
    }

    const timeZone =
      ss.getSpreadsheetTimeZone() ||
      'Australia/Sydney';

    const selectedDateKey =
      Utilities.formatDate(
        selectedDate,
        timeZone,
        'yyyy-MM-dd'
      );

    const selectedDateDisplay =
      Utilities.formatDate(
        selectedDate,
        timeZone,
        'd MMMM yyyy'
      );


    /* -----------------------------------------------------
       READ EXISTING DELIVERY RECORDS
       ----------------------------------------------------- */

    const deliveryMap = {};

    const maxDeliveryRows =
      deliveriesSheet.getMaxRows();

    if (maxDeliveryRows >= 2) {

      const deliveryValues =
        deliveriesSheet
          .getRange(
            2,
            2,
            maxDeliveryRows - 1,
            16
          )
          .getValues();

      deliveryValues.forEach(
        function(row, index) {

          const orderId =
            String(row[0] || '').trim();

          if (!orderId) {
            return;
          }

          /*
           * Range starts at B:
           *
           * row[0]  = B  Order ID
           * row[12] = N  Routific ID
           * row[13] = O  Routific Sync Status
           * row[14] = P  Routific Synced At
           * row[15] = Q  Routific Last Error
           */

          deliveryMap[orderId] = {
            rowNumber: index + 2,
            routificId:
              String(row[12] || '').trim(),
            syncStatus:
              String(row[13] || '').trim(),
            syncedAt:
              row[14],
            lastError:
              String(row[15] || '').trim()
          };

        }
      );

    }


    /* -----------------------------------------------------
       READ ORDERS
       ----------------------------------------------------- */

    const lastOrderRow =
      ordersSheet.getLastRow();

    if (lastOrderRow < 2) {
      ui.alert('There are no orders in the Orders sheet.');
      return;
    }

    const orderRows =
      ordersSheet
        .getRange(
          2,
          1,
          lastOrderRow - 1,
          25
        )
        .getValues();


    /* -----------------------------------------------------
       BUILD ELIGIBLE BATCH
       ----------------------------------------------------- */

    const eligibleOrders = [];
    const alreadySyncedOrders = [];
    const invalidOrders = [];

    orderRows.forEach(function(row, index) {

      const orderId =
        String(row[0] || '').trim();

      if (!orderId) {
        return;
      }

      const deliveryDate =
        row[2];

      /*
       * Ignore orders not belonging to selected date.
       */
      if (
        !deliveryDate ||
        Object.prototype.toString.call(deliveryDate) !== '[object Date]' ||
        isNaN(deliveryDate.getTime())
      ) {
        return;
      }

      const orderDeliveryDateKey =
        Utilities.formatDate(
          deliveryDate,
          timeZone,
          'yyyy-MM-dd'
        );

      if (orderDeliveryDateKey !== selectedDateKey) {
        return;
      }


      const order = {
        sheetRow: index + 2,
        orderId: orderId,
        deliveryDate: deliveryDate,
        customerName: String(row[4] || '').trim(),
        phone: String(row[5] || '').trim(),
        deliveryAddress: String(row[6] || '').trim(),
        postcode: String(row[7] || '').trim(),
        orderStatus: String(row[8] || '').trim(),
        paymentStatus: String(row[9] || '').trim(),
        deliveryWindow: String(row[10] || '').trim(),
        notes: String(row[13] || '').trim(),
        orderCheck: String(row[23] || '').trim()
      };


      /*
       * Only Confirmed orders are eligible.
       */
      if (order.orderStatus !== 'Confirmed') {
        return;
      }


      /*
       * Order Check must be OK.
       */
      if (order.orderCheck !== 'OK') {

        invalidOrders.push({
          orderId: order.orderId,
          reason: 'Order Check is not OK'
        });

        return;
      }


      /*
       * Required delivery information.
       */
      if (!order.customerName) {

        invalidOrders.push({
          orderId: order.orderId,
          reason: 'Customer Name is missing'
        });

        return;
      }

      if (!order.phone) {

        invalidOrders.push({
          orderId: order.orderId,
          reason: 'Phone is missing'
        });

        return;
      }

      if (!order.deliveryAddress) {

        invalidOrders.push({
          orderId: order.orderId,
          reason: 'Delivery Address is missing'
        });

        return;
      }

      if (!order.deliveryWindow) {

        invalidOrders.push({
          orderId: order.orderId,
          reason: 'Delivery Window is missing'
        });

        return;
      }


      /*
       * Parse and validate delivery window BEFORE confirmation.
       */
      try {

        order.parsedWindow =
          parseMaKitchensDeliveryWindow_(
            order.deliveryWindow
          );

      } catch (error) {

        invalidOrders.push({
          orderId: order.orderId,
          reason:
            'Invalid Delivery Window: ' +
            error.message
        });

        return;
      }


      /*
       * Build Routific address.
       * Append postcode only when not already present.
       */
      order.routificAddress =
        order.deliveryAddress;

      if (
        order.postcode &&
        order.routificAddress.indexOf(order.postcode) === -1
      ) {
        order.routificAddress +=
          ' ' +
          order.postcode;
      }


      /*
       * Duplicate protection.
       */
      const existingDelivery =
        deliveryMap[order.orderId];

      if (existingDelivery) {

        if (
          existingDelivery.routificId ||
          existingDelivery.syncStatus.toLowerCase() === 'synced'
        ) {

          alreadySyncedOrders.push(
            order.orderId
          );

          return;
        }

      }


      /*
       * Payment Status is deliberately ignored.
       */
      eligibleOrders.push(order);

    });


    /* -----------------------------------------------------
       NOTHING TO SEND
       ----------------------------------------------------- */

    if (eligibleOrders.length === 0) {

      let message =
        'No new eligible confirmed orders were found for ' +
        selectedDateDisplay +
        '.';

      if (alreadySyncedOrders.length > 0) {

        message +=
          '\n\nAlready synced and skipped: ' +
          alreadySyncedOrders.length +
          '\n' +
          alreadySyncedOrders.join(', ');

      }

      if (invalidOrders.length > 0) {

        message +=
          '\n\nOrders requiring attention: ' +
          invalidOrders.length;

        invalidOrders.forEach(function(item) {
          message +=
            '\n' +
            item.orderId +
            ': ' +
            item.reason;
        });

      }

      ui.alert(
        'Nothing Sent',
        message,
        ui.ButtonSet.OK
      );

      return;
    }


    /* -----------------------------------------------------
       FINAL CONFIRMATION
       ----------------------------------------------------- */

    let confirmationMessage =
      'Send ' +
      eligibleOrders.length +
      ' confirmed order(s) for ' +
      selectedDateDisplay +
      ' to Routific?\n\n';

    confirmationMessage +=
      'ORDERS TO SEND:\n';

    eligibleOrders.forEach(function(order) {

      confirmationMessage +=
        '\n' +
        order.orderId +
        ' | ' +
        order.customerName +
        ' | ' +
        order.parsedWindow.startTime +
        ' to ' +
        order.parsedWindow.endTime;

    });


    if (alreadySyncedOrders.length > 0) {

      confirmationMessage +=
        '\n\nALREADY SYNCED AND WILL BE SKIPPED:\n' +
        alreadySyncedOrders.join(', ');

    }


    if (invalidOrders.length > 0) {

      confirmationMessage +=
        '\n\nNOT ELIGIBLE AND WILL NOT BE SENT:\n';

      invalidOrders.forEach(function(item) {

        confirmationMessage +=
          '\n' +
          item.orderId +
          ': ' +
          item.reason;

      });

    }


    confirmationMessage +=
      '\n\nPayment Status does not affect delivery eligibility.';

    confirmationMessage +=
      '\n\nProceed with the Routific send?';


    const confirmation =
      ui.alert(
        'SEND TO ROUTIFIC',
        confirmationMessage,
        ui.ButtonSet.YES_NO
      );


    if (confirmation !== ui.Button.YES) {
      return;
    }


    /* -----------------------------------------------------
       SEND EACH ORDER INDEPENDENTLY
       ----------------------------------------------------- */

    let successCount = 0;
    let errorCount = 0;

    const successfulOrders = [];
    const failedOrders = [];


    eligibleOrders.forEach(function(order) {

      let deliveryRow = null;

      try {

        /*
         * Reuse an existing delivery row if one exists.
         * This allows safe retry after an Error.
         */
        const existingDelivery =
          deliveryMap[order.orderId];

        if (existingDelivery) {

          deliveryRow =
            existingDelivery.rowNumber;

        } else {

          /*
           * Create permanent delivery lifecycle record
           * BEFORE calling Routific.
           *
           * Only column B is written.
           * ARRAYFORMULA controls A and C.
           */
          deliveryRow =
            findNextAvailableDeliveryRow_(
              deliveriesSheet
            );

          deliveriesSheet
            .getRange(deliveryRow, 2)
            .setValue(order.orderId);

          SpreadsheetApp.flush();


          deliveryMap[order.orderId] = {
            rowNumber: deliveryRow,
            routificId: '',
            syncStatus: '',
            syncedAt: '',
            lastError: ''
          };

        }


        /*
         * Recheck duplicate protection immediately
         * before API submission.
         */
        const currentRoutificId =
          String(
            deliveriesSheet
              .getRange(deliveryRow, 14)
              .getValue() || ''
          ).trim();

        const currentSyncStatus =
          String(
            deliveriesSheet
              .getRange(deliveryRow, 15)
              .getValue() || ''
          ).trim();

        if (
          currentRoutificId ||
          currentSyncStatus.toLowerCase() === 'synced'
        ) {

          /*
           * This should normally have been caught earlier,
           * but this second check protects against unexpected
           * changes between validation and submission.
           */
          alreadySyncedOrders.push(
            order.orderId
          );

          return;
        }


        /*
         * Mark active send attempt.
         */
        deliveriesSheet
          .getRange(deliveryRow, 15)
          .setValue('Sending');

        deliveriesSheet
          .getRange(deliveryRow, 17)
          .clearContent();

        SpreadsheetApp.flush();


        /* -------------------------------------------------
           BUILD ROUTIFIC PAYLOAD
           ------------------------------------------------- */

        const payload = [
          {
            name:
              order.customerName,

            locations: [
              {
                address:
                  order.routificAddress
              }
            ],

            phone:
              order.phone,

            duration:
              ROUTIFIC_CONFIG.DEFAULT_STOP_DURATION_SECONDS,

            instructions:
              order.notes,

            timeWindows: [
              {
                startTime:
                  order.parsedWindow.startTime,

                endTime:
                  order.parsedWindow.endTime
              }
            ],

            customerOrderNumber:
              order.orderId,

            deliveryDate:
              selectedDateKey
          }
        ];


        Logger.log(
          'Sending ' +
          order.orderId +
          ': ' +
          JSON.stringify(payload)
        );


        /* -------------------------------------------------
           CALL ROUTIFIC
           ------------------------------------------------- */

        const url =
          'https://api.plan.routific.com/v2/orders' +
          '?workspaceUuid=' +
          encodeURIComponent(workspaceUuid);


        let response;

        try {

          response =
            UrlFetchApp.fetch(
              url,
              {
                method: 'post',

                contentType:
                  'application/json',

                headers: {
                  Authorization:
                    'Bearer ' + token,

                  Accept:
                    'application/json'
                },

                payload:
                  JSON.stringify(payload),

                muteHttpExceptions:
                  true
              }
            );

        } catch (connectionError) {

          throw new Error(
            'Connection error: ' +
            connectionError.message
          );

        }


        const statusCode =
          response.getResponseCode();

        const body =
          response.getContentText();


        Logger.log(
          order.orderId +
          ' HTTP Status: ' +
          statusCode
        );

        Logger.log(
          order.orderId +
          ' Response: ' +
          body
        );


        if (
          statusCode < 200 ||
          statusCode >= 300
        ) {

          throw new Error(
            'HTTP ' +
            statusCode +
            ': ' +
            body
          );

        }


        /* -------------------------------------------------
           PARSE RESPONSE
           ------------------------------------------------- */

        let data;

        try {

          data =
            JSON.parse(body);

        } catch (parseError) {

          throw new Error(
            'Routific returned an unreadable success response.'
          );

        }


        if (
          !Array.isArray(data) ||
          data.length === 0
        ) {

          throw new Error(
            'Routific returned an empty or unexpected response.'
          );

        }


        /*
         * Find the response belonging to this Ma Kitchens
         * Order ID rather than blindly assuming array order.
         */
        const routificOrder =
          data.find(function(item) {

            return (
              String(
                item.customerOrderNumber || ''
              ).trim() === order.orderId
            );

          }) || data[0];


        if (!routificOrder.uuid) {

          throw new Error(
            'Routific response did not contain an order UUID.'
          );

        }


        if (
          routificOrder.customerOrderNumber &&
          String(
            routificOrder.customerOrderNumber
          ).trim() !== order.orderId
        ) {

          throw new Error(
            'Routific returned a different customerOrderNumber than expected.'
          );

        }


        const routificUuid =
          String(
            routificOrder.uuid
          ).trim();


        /* -------------------------------------------------
           SUCCESS WRITEBACK
           ------------------------------------------------- */

        /*
         * N = Routific ID
         * O = Routific Sync Status
         * P = Routific Synced At
         * Q = Routific Last Error
         */

        deliveriesSheet
          .getRange(deliveryRow, 14)
          .setValue(routificUuid);

        deliveriesSheet
          .getRange(deliveryRow, 15)
          .setValue('Synced');

        deliveriesSheet
          .getRange(deliveryRow, 16)
          .setValue(new Date());

        deliveriesSheet
          .getRange(deliveryRow, 17)
          .clearContent();

        SpreadsheetApp.flush();


        successCount++;

        successfulOrders.push(
          order.orderId
        );


      } catch (error) {

        errorCount++;

        failedOrders.push({
          orderId: order.orderId,
          error: error.message
        });


        /*
         * Preserve the permanent Deliveries row
         * and record the failure for safe retry.
         */
        if (deliveryRow) {

          deliveriesSheet
            .getRange(deliveryRow, 15)
            .setValue('Error');

          deliveriesSheet
            .getRange(deliveryRow, 17)
            .setValue(
              shortenRoutificError_(
                error.message
              )
            );

        }


        Logger.log(
          'ERROR sending ' +
          order.orderId +
          ': ' +
          error.message
        );

      }

    });


    SpreadsheetApp.flush();


    /* -----------------------------------------------------
       FINAL SUMMARY
       ----------------------------------------------------- */

    let summary =
      successCount +
      ' order(s) successfully sent to Routific.';


    if (successfulOrders.length > 0) {

      summary +=
        '\n\nSENT:\n' +
        successfulOrders.join(', ');

    }


    if (alreadySyncedOrders.length > 0) {

      /*
       * Remove any accidental duplicate IDs from summary.
       */
      const uniqueSkipped =
        Array.from(
          new Set(alreadySyncedOrders)
        );

      summary +=
        '\n\nALREADY SYNCED AND SKIPPED: ' +
        uniqueSkipped.length +
        '\n' +
        uniqueSkipped.join(', ');

    }


    if (errorCount > 0) {

      summary +=
        '\n\nERRORS: ' +
        errorCount;

      failedOrders.forEach(function(item) {

        summary +=
          '\n' +
          item.orderId +
          ': ' +
          item.error;

      });

    }


    if (invalidOrders.length > 0) {

      summary +=
        '\n\nNOT ELIGIBLE: ' +
        invalidOrders.length;

      invalidOrders.forEach(function(item) {

        summary +=
          '\n' +
          item.orderId +
          ': ' +
          item.reason;

      });

    }


    ui.alert(
      'Routific Send Complete',
      summary,
      ui.ButtonSet.OK
    );


  } finally {

    lock.releaseLock();

  }

}


/* =========================================================
   DELIVERY ROW HELPER
   ========================================================= */

/**
 * Finds the first unused Deliveries row based on
 * column B Order ID.
 *
 * We deliberately do not rely on getLastRow()
 * because ARRAYFORMULA exists in columns A and C.
 */
function findNextAvailableDeliveryRow_(
  deliveriesSheet
) {

  const maxRows =
    deliveriesSheet.getMaxRows();

  const orderIds =
    deliveriesSheet
      .getRange(
        2,
        2,
        maxRows - 1,
        1
      )
      .getValues();

  for (
    let i = 0;
    i < orderIds.length;
    i++
  ) {

    if (
      String(
        orderIds[i][0] || ''
      ).trim() === ''
    ) {

      return i + 2;

    }

  }

  deliveriesSheet.insertRowAfter(maxRows);

  return maxRows + 1;
}


/* =========================================================
   ERROR HELPER
   ========================================================= */

/**
 * Prevents extremely long API responses from filling
 * Routific Last Error with excessive text.
 */
function shortenRoutificError_(
  errorText
) {

  const text =
    String(errorText || '');

  const maxLength = 500;

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.substring(0, maxLength) +
    '...'
  );
}


/* =========================================================
   DELIVERY WINDOW PARSER
   ========================================================= */

function parseMaKitchensDeliveryWindow_(
  windowText
) {

  if (!windowText) {
    throw new Error(
      'Delivery window is blank.'
    );
  }

  let text =
    String(windowText)
      .trim()
      .toUpperCase();

  text =
    text.replace(/[–—−]/g, '-');

  text =
    text.replace(/\s+/g, ' ');

  const parts =
    text.split('-');

  if (parts.length !== 2) {
    throw new Error(
      'Expected a start and end time.'
    );
  }

  let startText =
    parts[0].trim();

  let endText =
    parts[1].trim();

  const startPeriodMatch =
    startText.match(/\b(AM|PM)\b/);

  const endPeriodMatch =
    endText.match(/\b(AM|PM)\b/);

  let startPeriod =
    startPeriodMatch
      ? startPeriodMatch[1]
      : null;

  let endPeriod =
    endPeriodMatch
      ? endPeriodMatch[1]
      : null;

  if (!startPeriod && endPeriod) {
    startPeriod = endPeriod;
  }

  if (!endPeriod && startPeriod) {
    endPeriod = startPeriod;
  }

  if (!startPeriod || !endPeriod) {
    throw new Error(
      'AM or PM could not be determined.'
    );
  }

  startText =
    startText
      .replace(/\b(AM|PM)\b/g, '')
      .trim();

  endText =
    endText
      .replace(/\b(AM|PM)\b/g, '')
      .trim();

  return {
    startTime:
      convert12HourTo24Hour_(
        startText,
        startPeriod
      ),

    endTime:
      convert12HourTo24Hour_(
        endText,
        endPeriod
      )
  };
}


function convert12HourTo24Hour_(
  timeText,
  period
) {

  const match =
    String(timeText)
      .trim()
      .match(
        /^(\d{1,2})(?::(\d{1,2}))?$/
      );

  if (!match) {
    throw new Error(
      'Invalid time "' +
      timeText +
      '".'
    );
  }

  let hour =
    Number(match[1]);

  let minute =
    match[2]
      ? Number(match[2])
      : 0;

  if (
    hour < 1 ||
    hour > 12
  ) {
    throw new Error(
      'Hour must be between 1 and 12.'
    );
  }

  if (
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      'Minutes must be between 00 and 59.'
    );
  }

  if (period === 'AM') {

    if (hour === 12) {
      hour = 0;
    }

  } else if (period === 'PM') {

    if (hour !== 12) {
      hour += 12;
    }

  } else {

    throw new Error(
      'Invalid AM/PM value.'
    );

  }

  return (
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0')
  );
}
